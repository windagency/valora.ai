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
	it('registers providers via api.providers.register()', async () => {
		const { getProviderRegistry } = await import('llm/registry');
		const mockRegister = vi.fn();
		vi.mocked(getProviderRegistry).mockReturnValue({ registerProvider: mockRegister } as never);

		const api = createPluginAPI({} as never, makePlugin(), makeRegistry());
		const FakeProvider = class {};
		api.providers.register('fake', FakeProvider as never);

		expect(mockRegister).toHaveBeenCalledWith('fake', FakeProvider);
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
});
