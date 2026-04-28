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

	it('does not throw and logs a warning when a code plugin fails to import', async () => {
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

		const { getLogger } = await import('output/logger');
		const mockWarn = vi.fn();
		vi.mocked(getLogger).mockReturnValue({ warn: mockWarn, info: vi.fn(), debug: vi.fn(), error: vi.fn() } as never);

		const { createContainer, initializePlugins } = await import('di/container');

		const container = createContainer();
		await expect(initializePlugins(container)).resolves.toBeUndefined();
		expect(mockWarn).toHaveBeenCalledWith(
			'Failed to load code plugin',
			expect.objectContaining({ plugin: 'broken-plugin' })
		);
	});
});

describe('initializePlugins — compression strategy registration', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-compression-test-'));
	});

	afterEach(async () => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
		const { resetRegistry } = await import('executor/output-compression.service');
		resetRegistry();
		vi.resetModules();
	});

	it('registers a compression strategy via api.compression.registerStrategy()', async () => {
		const entrypointPath = path.join(tmpDir, 'compression-plugin.mjs');
		fs.writeFileSync(
			entrypointPath,
			[
				'export async function register(api) {',
				'  api.compression.registerStrategy("mytesttool", (output) => "compressed:" + output.slice(0, 5));',
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
							manifest: { name: 'compression-integration-plugin', version: '1.0.0' },
							pluginDir: tmpDir,
							status: 'enabled'
						}
					])
				}) as never
		);

		const { createContainer, initializePlugins } = await import('di/container');
		const { getStrategy } = await import('executor/output-compression.service');

		const container = createContainer();
		await initializePlugins(container);

		const strategy = getStrategy('mytesttool');
		expect(strategy?.('hello world', 'mytesttool run')).toBe('compressed:hello');
	});
});

describe('initializePlugins — provider descriptor registration', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-descriptor-test-'));
	});

	afterEach(async () => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
		const { resetProviderRegistry } = await import('llm/registry');
		resetProviderRegistry();
		vi.resetModules();
	});

	it('stores the descriptor when a plugin registers a provider with one', async () => {
		const entrypointPath = path.join(tmpDir, 'descriptor-plugin.mjs');
		fs.writeFileSync(
			entrypointPath,
			[
				'export function register(api) {',
				'  api.providers.register("test-provider", class P {',
				'    constructor() {}',
				'    get name() { return "test-provider"; }',
				'    isConfigured() { return true; }',
				'    async complete() { return { content: "", role: "assistant" }; }',
				'    async streamComplete(_o, onChunk) { onChunk(""); return { content: "", role: "assistant" }; }',
				'    getAlternativeModels() { return []; }',
				'    validateModel() { return Promise.resolve(true); }',
				'  }, { label: "Test", defaultModel: "test-model", modelModes: [], requiresApiKey: false });',
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
							manifest: { name: 'descriptor-plugin', version: '1.0.0' },
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

		const descriptor = getProviderRegistry().getDescriptor('test-provider');
		expect(descriptor).toBeDefined();
		expect(descriptor?.label).toBe('Test');
		expect(descriptor?.defaultModel).toBe('test-model');
		expect(descriptor?.requiresApiKey).toBe(false);
	});

	it('returns undefined from getDescriptor for an unregistered provider name', async () => {
		const { createContainer, initializePlugins } = await import('di/container');
		const { getProviderRegistry } = await import('llm/registry');

		const container = createContainer();
		await initializePlugins(container);

		expect(getProviderRegistry().getDescriptor('no-such-provider')).toBeUndefined();
	});

	it('does not break existing registration path when no descriptor is supplied', async () => {
		const entrypointPath = path.join(tmpDir, 'nodesc-plugin.mjs');
		fs.writeFileSync(
			entrypointPath,
			[
				'export function register(api) {',
				'  api.providers.register("nodesc-provider", class P {',
				'    constructor() {}',
				'    get name() { return "nodesc-provider"; }',
				'    isConfigured() { return true; }',
				'    async complete() { return { content: "", role: "assistant" }; }',
				'    async streamComplete(_o, onChunk) { onChunk(""); return { content: "", role: "assistant" }; }',
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
							manifest: { name: 'nodesc-plugin', version: '1.0.0' },
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

		expect(getProviderRegistry().hasProvider('nodesc-provider')).toBe(true);
		expect(getProviderRegistry().getDescriptor('nodesc-provider')).toBeUndefined();
	});
});

describe('initializePlugins — lifecycle activate hook dispatch', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-activate-test-'));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
		vi.resetModules();
	});

	it('invokes activate hooks registered via api.lifecycle.onActivate()', async () => {
		const flagFile = path.join(tmpDir, 'activate-called.txt');
		const entrypointPath = path.join(tmpDir, 'lifecycle-plugin.mjs');
		fs.writeFileSync(
			entrypointPath,
			[
				'import * as nodefs from "node:fs";',
				'export async function register(api) {',
				`  api.lifecycle.onActivate(async () => { nodefs.writeFileSync(${JSON.stringify(flagFile)}, "1"); });`,
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
							manifest: { name: 'lifecycle-plugin', version: '1.0.0' },
							pluginDir: tmpDir,
							status: 'enabled'
						}
					])
				}) as never
		);

		const { createContainer, initializePlugins } = await import('di/container');
		const container = createContainer();
		await initializePlugins(container);

		expect(fs.existsSync(flagFile)).toBe(true);
	});

	it('continues dispatching remaining activate hooks when one plugin hook throws', async () => {
		const flagFile = path.join(tmpDir, 'plugin-b-activated.txt');
		const entryA = path.join(tmpDir, 'plugin-a.mjs');
		const entryB = path.join(tmpDir, 'plugin-b.mjs');
		fs.writeFileSync(
			entryA,
			[
				'export async function register(api) {',
				'  api.lifecycle.onActivate(async () => { throw new Error("activate error"); });',
				'}'
			].join('\n')
		);
		fs.writeFileSync(
			entryB,
			[
				'import * as nodefs from "node:fs";',
				'export async function register(api) {',
				`  api.lifecycle.onActivate(async () => { nodefs.writeFileSync(${JSON.stringify(flagFile)}, "1"); });`,
				'}'
			].join('\n')
		);

		const { PluginLoaderService } = await import('plugins/plugin-loader.service');
		vi.mocked(PluginLoaderService).mockImplementation(
			() =>
				({
					loadAll: vi.fn().mockReturnValue([
						{
							codeEntrypoint: entryA,
							manifest: { name: 'plugin-a', version: '1.0.0' },
							pluginDir: tmpDir,
							status: 'enabled'
						},
						{
							codeEntrypoint: entryB,
							manifest: { name: 'plugin-b', version: '1.0.0' },
							pluginDir: tmpDir,
							status: 'enabled'
						}
					])
				}) as never
		);

		const { createContainer, initializePlugins } = await import('di/container');
		const container = createContainer();
		await expect(initializePlugins(container)).resolves.toBeUndefined();

		expect(fs.existsSync(flagFile)).toBe(true);
	});
});

describe('dispatchDeactivateHooks', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-deactivate-test-'));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
		vi.resetModules();
	});

	it('invokes deactivate hooks registered via api.lifecycle.onDeactivate()', async () => {
		const flagFile = path.join(tmpDir, 'deactivate-called.txt');
		const entrypointPath = path.join(tmpDir, 'deactivate-plugin.mjs');
		fs.writeFileSync(
			entrypointPath,
			[
				'import * as nodefs from "node:fs";',
				'export async function register(api) {',
				`  api.lifecycle.onDeactivate(async () => { nodefs.writeFileSync(${JSON.stringify(flagFile)}, "1"); });`,
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
							manifest: { name: 'deactivate-plugin', version: '1.0.0' },
							pluginDir: tmpDir,
							status: 'enabled'
						}
					])
				}) as never
		);

		const { createContainer, dispatchDeactivateHooks, initializePlugins } = await import('di/container');
		const container = createContainer();
		await initializePlugins(container);
		await dispatchDeactivateHooks(container);

		expect(fs.existsSync(flagFile)).toBe(true);
	});

	it('continues dispatching remaining deactivate hooks when one throws', async () => {
		const flagFile = path.join(tmpDir, 'plugin-b-deactivated.txt');
		const entryA = path.join(tmpDir, 'plugin-a.mjs');
		const entryB = path.join(tmpDir, 'plugin-b.mjs');
		fs.writeFileSync(
			entryA,
			[
				'export async function register(api) {',
				'  api.lifecycle.onDeactivate(async () => { throw new Error("deactivate error"); });',
				'}'
			].join('\n')
		);
		fs.writeFileSync(
			entryB,
			[
				'import * as nodefs from "node:fs";',
				'export async function register(api) {',
				`  api.lifecycle.onDeactivate(async () => { nodefs.writeFileSync(${JSON.stringify(flagFile)}, "1"); });`,
				'}'
			].join('\n')
		);

		const { PluginLoaderService } = await import('plugins/plugin-loader.service');
		vi.mocked(PluginLoaderService).mockImplementation(
			() =>
				({
					loadAll: vi.fn().mockReturnValue([
						{
							codeEntrypoint: entryA,
							manifest: { name: 'plugin-a', version: '1.0.0' },
							pluginDir: tmpDir,
							status: 'enabled'
						},
						{
							codeEntrypoint: entryB,
							manifest: { name: 'plugin-b', version: '1.0.0' },
							pluginDir: tmpDir,
							status: 'enabled'
						}
					])
				}) as never
		);

		const { createContainer, dispatchDeactivateHooks, initializePlugins } = await import('di/container');
		const container = createContainer();
		await initializePlugins(container);
		await expect(dispatchDeactivateHooks(container)).resolves.toBeUndefined();

		expect(fs.existsSync(flagFile)).toBe(true);
	});

	it('is a no-op when initializePlugins has not been called', async () => {
		const { createContainer, dispatchDeactivateHooks } = await import('di/container');
		const container = createContainer();
		await expect(dispatchDeactivateHooks(container)).resolves.toBeUndefined();
	});
});
