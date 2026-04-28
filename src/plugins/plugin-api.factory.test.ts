import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';

import type { LoadedPlugin } from 'types/plugin.types';

import { createPluginAPI, type PluginLifecycleRegistry } from './plugin-api.factory';

vi.mock('output/logger', () => ({
	getLogger: vi.fn(() => ({
		child: vi.fn(() => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() })),
		debug: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warn: vi.fn()
	}))
}));

vi.mock('llm/registry', () => ({
	getProviderRegistry: vi.fn(() => ({
		registerProvider: vi.fn()
	}))
}));

vi.mock('config/loader', () => ({
	getConfigLoader: vi.fn(() => ({
		getRaw: vi.fn(() => ({}))
	}))
}));

function makePlugin(overrides: Partial<LoadedPlugin> = {}): LoadedPlugin {
	return {
		manifest: { name: 'test-plugin', version: '1.0.0' },
		pluginDir: '/tmp/test',
		status: 'enabled',
		...overrides
	};
}

function makeRegistry(): PluginLifecycleRegistry {
	return { activateHooks: [], deactivateHooks: [] };
}

describe('createPluginAPI', () => {
	it('passes plugin name as owner when registering a provider', async () => {
		const { getProviderRegistry } = await import('llm/registry');
		const mockRegister = vi.fn();
		vi.mocked(getProviderRegistry).mockReturnValue({ registerProvider: mockRegister } as never);

		const api = createPluginAPI(
			{} as never,
			makePlugin({ manifest: { name: 'my-plugin', version: '1.0.0' } }),
			makeRegistry()
		);
		const FakeProvider = class {};
		api.providers.register('fake', FakeProvider as never);

		expect(mockRegister).toHaveBeenCalledWith('fake', FakeProvider, { owner: 'my-plugin', override: false });
	});

	it('sets override: true when the key appears in manifest.overrides', async () => {
		const { getProviderRegistry } = await import('llm/registry');
		const mockRegister = vi.fn();
		vi.mocked(getProviderRegistry).mockReturnValue({ registerProvider: mockRegister } as never);

		const plugin = makePlugin({
			manifest: { name: 'override-plugin', version: '1.0.0', overrides: ['ollama'] }
		});
		const api = createPluginAPI({} as never, plugin, makeRegistry());
		const FakeProvider = class {};
		api.providers.register('ollama', FakeProvider as never);

		expect(mockRegister).toHaveBeenCalledWith('ollama', FakeProvider, { owner: 'override-plugin', override: true });
	});

	it('sets override: false when the key does not appear in manifest.overrides', async () => {
		const { getProviderRegistry } = await import('llm/registry');
		const mockRegister = vi.fn();
		vi.mocked(getProviderRegistry).mockReturnValue({ registerProvider: mockRegister } as never);

		const plugin = makePlugin({
			manifest: { name: 'plugin-a', version: '1.0.0', overrides: ['other-key'] }
		});
		const api = createPluginAPI({} as never, plugin, makeRegistry());
		const FakeProvider = class {};
		api.providers.register('anthropic', FakeProvider as never);

		expect(mockRegister).toHaveBeenCalledWith('anthropic', FakeProvider, { owner: 'plugin-a', override: false });
	});

	it('accumulates activate hooks via api.lifecycle.onActivate()', () => {
		const registry = makeRegistry();
		const api = createPluginAPI({} as never, makePlugin(), registry);
		const hook = async () => {};

		api.lifecycle.onActivate(hook);

		expect(registry.activateHooks).toContain(hook);
	});

	it('accumulates deactivate hooks via api.lifecycle.onDeactivate()', () => {
		const registry = makeRegistry();
		const api = createPluginAPI({} as never, makePlugin(), registry);
		const hook = async () => {};

		api.lifecycle.onDeactivate(hook);

		expect(registry.deactivateHooks).toContain(hook);
	});

	describe('api.config.extend()', () => {
		it('returns a getter function', async () => {
			const { getConfigLoader } = await import('config/loader');
			vi.mocked(getConfigLoader).mockReturnValue({ getRaw: vi.fn(() => ({})) } as never);

			const schema = z.object({ color: z.string().default('blue') });
			const api = createPluginAPI({} as never, makePlugin(), makeRegistry());
			const getConfig = api.config.extend(schema);

			expect(typeof getConfig).toBe('function');
		});

		it('getter returns parsed config merged from raw loader data', async () => {
			const { getConfigLoader } = await import('config/loader');
			vi.mocked(getConfigLoader).mockReturnValue({
				getRaw: vi.fn(() => ({ myPlugin: { color: 'red' } }))
			} as never);

			const schema = z.object({ myPlugin: z.object({ color: z.string().default('blue') }).default({}) }).default({});
			const api = createPluginAPI({} as never, makePlugin(), makeRegistry());
			const getConfig = api.config.extend(schema);

			expect(getConfig().myPlugin.color).toBe('red');
		});

		it('getter falls back to schema defaults and warns when raw config fails validation', async () => {
			const { getConfigLoader } = await import('config/loader');
			const { getLogger } = await import('output/logger');
			const mockWarn = vi.fn();
			vi.mocked(getLogger).mockReturnValue({ warn: mockWarn, info: vi.fn(), debug: vi.fn(), error: vi.fn() } as never);
			vi.mocked(getConfigLoader).mockReturnValue({
				getRaw: vi.fn(() => ({ color: 42 })) // 42 is not a string
			} as never);

			const schema = z.object({ color: z.string().default('blue') });
			const api = createPluginAPI(
				{} as never,
				makePlugin({ manifest: { name: 'my-plugin', version: '1.0.0' } }),
				makeRegistry()
			);
			const getConfig = api.config.extend(schema);

			expect(getConfig().color).toBe('blue');
			expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('my-plugin'), expect.anything());
		});

		it('getter returns defaults when config is not yet loaded (getRaw throws)', async () => {
			const { getConfigLoader } = await import('config/loader');
			vi.mocked(getConfigLoader).mockReturnValue({
				getRaw: vi.fn(() => {
					throw new Error('Configuration not loaded');
				})
			} as never);

			const schema = z.object({ color: z.string().default('blue') });
			const api = createPluginAPI({} as never, makePlugin(), makeRegistry());
			const getConfig = api.config.extend(schema);

			expect(getConfig().color).toBe('blue');
		});

		it('getter re-reads from loader on each call (not memoised)', async () => {
			const { getConfigLoader } = await import('config/loader');
			let callCount = 0;
			vi.mocked(getConfigLoader).mockReturnValue({
				getRaw: vi.fn(() => {
					callCount++;
					return {};
				})
			} as never);

			const schema = z.object({ x: z.number().default(0) });
			const api = createPluginAPI({} as never, makePlugin(), makeRegistry());
			const getConfig = api.config.extend(schema);

			getConfig();
			getConfig();

			expect(callCount).toBe(2);
		});
	});

	it('registers a compression strategy via api.compression.registerStrategy()', async () => {
		const { getStrategy, resetRegistry } = await import('executor/output-compression.service');

		const fn = (output: string) => output.slice(0, 10);
		const api = createPluginAPI({} as never, makePlugin(), makeRegistry());

		api.compression.registerStrategy('mytool', fn);

		expect(getStrategy('mytool')).toBe(fn);
		resetRegistry();
	});
});
