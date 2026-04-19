import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('output/logger', () => ({
	getLogger: vi.fn(() => ({
		child: vi.fn(() => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() })),
		debug: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warn: vi.fn()
	}))
}));

vi.mock('output/processing-feedback', () => ({
	getProcessingFeedback: vi.fn(() => ({ showPluginsStatus: vi.fn() }))
}));

vi.mock('config/loader', () => ({
	getConfigLoader: vi.fn(() => ({ get: vi.fn(() => ({})) }))
}));

vi.mock('plugins/plugin-loader.service', () => ({
	PluginLoaderService: vi.fn().mockImplementation(() => ({
		loadAll: vi.fn().mockReturnValue([])
	}))
}));

describe('initializePlugins — code plugin dynamic import', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-container-test-'));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
		vi.resetModules();
	});

	it('loads a code plugin and registers its provider in the registry', async () => {
		const entrypointPath = path.join(tmpDir, 'test-plugin.mjs');
		fs.writeFileSync(
			entrypointPath,
			[
				'export function register(api) {',
				'  api.providers.register("integration-test-provider", class P {',
				'    constructor() { this.name = "integration-test-provider"; }',
				'    isConfigured() { return true; }',
				'    async complete() { return { content: "", role: "assistant" }; }',
				'    async streamComplete() { return { content: "", role: "assistant" }; }',
				'    getAlternativeModels() { return []; }',
				'    validateModel() { return Promise.resolve(true); }',
				'  });',
				'}'
			].join('\n')
		);

		const { PluginLoaderService } = await import('plugins/plugin-loader.service');
		vi.mocked(PluginLoaderService).mockImplementation(
			() =>
				({
					loadAll: vi.fn().mockReturnValue([
						{
							codeEntrypoint: entrypointPath,
							manifest: { name: 'integration-test-plugin', version: '1.0.0' },
							pluginDir: tmpDir,
							status: 'enabled'
						}
					])
				}) as never
		);

		const { createContainer, initializePlugins } = await import('di/container');
		const { getProviderRegistry } = await import('llm/registry');

		const container = createContainer();
		await initializePlugins(container);

		expect(getProviderRegistry().hasProvider('integration-test-provider')).toBe(true);
	});

	it('continues loading other plugins when a code plugin fails to load', async () => {
		const { PluginLoaderService } = await import('plugins/plugin-loader.service');
		vi.mocked(PluginLoaderService).mockImplementation(
			() =>
				({
					loadAll: vi.fn().mockReturnValue([
						{
							codeEntrypoint: '/non-existent/path/index.mjs',
							manifest: { name: 'broken-plugin', version: '1.0.0' },
							pluginDir: tmpDir,
							status: 'enabled'
						}
					])
				}) as never
		);

		const { createContainer, initializePlugins } = await import('di/container');

		const container = createContainer();
		// Should not throw
		await expect(initializePlugins(container)).resolves.toBeUndefined();
	});
});
