import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('output/processing-feedback', () => ({
	getProcessingFeedback: vi.fn(() => ({ showPluginsStatus: vi.fn() }))
}));

vi.mock('config/loader', () => ({
	getConfigLoader: vi.fn(() => ({ get: vi.fn(() => ({})) }))
}));

/**
 * `bootstrapMemoryFromConfig()` unconditionally activates the ephemeral
 * provider as a default at the START of `initializePlugins()` — before any
 * plugin has had a chance to load and self-activate a persistent one. A
 * warning tied to that moment (e.g. logged from the provider's constructor)
 * fires even when a memory plugin is about to override it a few lines later,
 * which is exactly what happened with valora-plugin-memory-vault: it loaded
 * and activated successfully, but the user still saw "Using ephemeral
 * memory" and reasonably concluded the plugin wasn't being used.
 *
 * The warning must instead reflect the FINAL state, once all plugins have
 * finished loading.
 */
describe('initializePlugins — ephemeral-memory warning reflects final state, not bootstrap order', () => {
	let tmpDir: string;
	let warnSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-memory-warning-test-'));
		warnSpy = vi.fn();
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
		vi.resetModules();
		vi.doUnmock('plugins/plugin-loader.service');
		vi.doUnmock('output/logger');
	});

	it('does not warn about ephemeral memory when a plugin activates a persistent provider', async () => {
		const entrypointPath = path.join(tmpDir, 'vault-plugin.mjs');
		fs.writeFileSync(
			entrypointPath,
			[
				'export function register(api) {',
				'  api.memory.register("vault", class P {',
				'    constructor() {}',
				'    async info() { return { name: "vault", label: "Vault", capabilities: [], counts: {} }; }',
				'  });',
				'  api.memory.activate("vault", {});',
				'}'
			].join('\n')
		);

		vi.doMock('plugins/plugin-loader.service', () => ({
			PluginLoaderService: vi.fn().mockImplementation(() => ({
				loadAll: vi.fn().mockReturnValue([
					{
						codeEntrypoint: entrypointPath,
						manifest: { name: 'vault-plugin', version: '1.0.0' },
						pluginDir: tmpDir,
						status: 'enabled'
					}
				])
			}))
		}));
		vi.doMock('output/logger', () => ({
			getLogger: vi.fn(() => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: warnSpy }))
		}));

		const { createContainer, initializePlugins } = await import('di/container');
		const { getMemoryRegistry, resetMemoryRegistry } = await import('memory/registry');
		resetMemoryRegistry();

		const container = createContainer();
		await initializePlugins(container);

		expect(getMemoryRegistry().getActiveName()).toBe('vault');
		expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('Using ephemeral memory'));

		resetMemoryRegistry();
	});

	it('warns about ephemeral memory when no plugin activates a persistent provider', async () => {
		vi.doMock('plugins/plugin-loader.service', () => ({
			PluginLoaderService: vi.fn().mockImplementation(() => ({
				loadAll: vi.fn().mockReturnValue([])
			}))
		}));
		vi.doMock('output/logger', () => ({
			getLogger: vi.fn(() => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: warnSpy }))
		}));

		const { createContainer, initializePlugins } = await import('di/container');
		const { getMemoryRegistry, resetMemoryRegistry } = await import('memory/registry');
		resetMemoryRegistry();

		const container = createContainer();
		await initializePlugins(container);

		expect(getMemoryRegistry().getActiveName()).toBe('ephemeral');
		expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Using ephemeral memory'));

		resetMemoryRegistry();
	});
});
