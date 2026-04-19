/**
 * Unit tests for PluginLoaderService — agent-only plugin bundles.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PluginLoaderService } from './plugin-loader.service';

vi.mock('output/logger', () => ({
	getLogger: vi.fn(() => ({
		warn: vi.fn(),
		info: vi.fn(),
		debug: vi.fn(),
		error: vi.fn()
	}))
}));

vi.mock('utils/resource-resolver', () => ({
	getResourceResolver: vi.fn(() => ({ registerPluginDir: vi.fn() }))
}));

function writeJson(filePath: string, data: unknown): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function writeFile(filePath: string, content: string): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, content);
}

describe('PluginLoaderService — agent-only bundles', () => {
	let tmpDir: string;
	let loader: PluginLoaderService;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-plugin-test-'));
		loader = new PluginLoaderService({
			discoverPluginDirs: () => [tmpDir]
		} as never);
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('loads an agent-only plugin and exposes agentsDir', () => {
		writeJson(path.join(tmpDir, 'valora-plugin.json'), {
			name: 'valora-core-secops',
			version: '1.0.0',
			description: 'SecOps agent bundle',
			contributes: ['agents']
		});
		const agentFile = path.join(tmpDir, 'agents', 'secops-engineer.md');
		writeFile(agentFile, '---\nrole: secops-engineer\n---\ntest');

		const plugins = loader.loadAll();

		expect(plugins).toHaveLength(1);
		expect(plugins[0].manifest.name).toBe('valora-core-secops');
		expect(plugins[0].agentsDir).toBe(path.join(tmpDir, 'agents'));
		expect(plugins[0].commandsDir).toBeUndefined();
		expect(plugins[0].hooks).toBeUndefined();
	});

	it('returns status enabled for a valid agent plugin', () => {
		writeJson(path.join(tmpDir, 'valora-plugin.json'), {
			name: 'valora-core-design',
			version: '1.0.0',
			contributes: ['agents']
		});
		writeFile(path.join(tmpDir, 'agents', 'ui-ux-designer.md'), '---\nrole: ui-ux-designer\n---\ntest');

		const plugins = loader.loadAll();

		expect(plugins[0].status).toBe('enabled');
	});

	it('respects plugins.enabled allowlist — skips plugin not in list', () => {
		writeJson(path.join(tmpDir, 'valora-plugin.json'), {
			name: 'valora-core-platform',
			version: '1.0.0',
			contributes: ['agents']
		});
		writeFile(path.join(tmpDir, 'agents', 'platform-engineer.md'), '---\nrole: platform-engineer\n---\ntest');

		const plugins = loader.loadAll({ enabled: ['other-plugin'] });

		expect(plugins).toHaveLength(0);
	});
});

describe('PluginLoaderService — prompts bundle', () => {
	let tmpDir: string;
	let loader: PluginLoaderService;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-plugin-test-'));
		loader = new PluginLoaderService({
			discoverPluginDirs: () => [tmpDir]
		} as never);
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('loads a prompts-only plugin and exposes promptsDir', () => {
		writeJson(path.join(tmpDir, 'valora-plugin.json'), {
			name: 'valora-core-generators',
			version: '1.0.0',
			contributes: ['prompts']
		});
		fs.mkdirSync(path.join(tmpDir, 'prompts', '00_generator'), { recursive: true });
		fs.writeFileSync(
			path.join(tmpDir, 'prompts', '00_generator', 'create_agent.md'),
			'---\nid: generator.agent_definition\n---'
		);

		const plugins = loader.loadAll();

		expect(plugins).toHaveLength(1);
		expect(plugins[0].promptsDir).toBe(path.join(tmpDir, 'prompts'));
		expect(plugins[0].agentsDir).toBeUndefined();
	});
});

describe('PluginLoaderService — command + agent bundles', () => {
	let tmpDir: string;
	let loader: PluginLoaderService;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-plugin-test-'));
		loader = new PluginLoaderService({
			discoverPluginDirs: () => [tmpDir]
		} as never);
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('exposes both commandsDir and agentsDir for a command+agent bundle', () => {
		writeJson(path.join(tmpDir, 'valora-plugin.json'), {
			name: 'valora-core-product',
			version: '1.0.0',
			description: 'Product Manager agent and product workflow commands.',
			contributes: ['agents', 'commands']
		});
		writeFile(path.join(tmpDir, 'agents', 'product-manager.md'), '---\nrole: product-manager\n---\ntest');
		writeFile(
			path.join(tmpDir, 'commands', 'create-prd.md'),
			'---\nname: create-prd\nagent: product-manager\n---\ntest'
		);

		const plugins = loader.loadAll();

		expect(plugins).toHaveLength(1);
		expect(plugins[0].manifest.name).toBe('valora-core-product');
		expect(plugins[0].agentsDir).toBe(path.join(tmpDir, 'agents'));
		expect(plugins[0].commandsDir).toBe(path.join(tmpDir, 'commands'));
		expect(plugins[0].promptsDir).toBeUndefined();
		expect(plugins[0].hooks).toBeUndefined();
	});

	it('exposes only commandsDir for a commands-only bundle (no agent in manifest)', () => {
		writeJson(path.join(tmpDir, 'valora-plugin.json'), {
			name: 'valora-core-docs',
			version: '1.0.0',
			description: 'Documentation generation commands (lead agent is core).',
			contributes: ['commands']
		});
		writeFile(path.join(tmpDir, 'commands', 'generate-docs.md'), '---\nname: generate-docs\nagent: lead\n---\ntest');

		const plugins = loader.loadAll();

		expect(plugins).toHaveLength(1);
		expect(plugins[0].commandsDir).toBe(path.join(tmpDir, 'commands'));
		expect(plugins[0].agentsDir).toBeUndefined();
	});
});

describe('PluginLoaderService — mcps bundle', () => {
	let tmpDir: string;
	let loader: PluginLoaderService;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-plugin-test-'));
		loader = new PluginLoaderService({
			discoverPluginDirs: () => [tmpDir]
		} as never);
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('exposes mcpsFile when plugin contributes mcps with mcp-connect permission', () => {
		writeJson(path.join(tmpDir, 'valora-plugin.json'), {
			name: 'valora-defaults',
			version: '1.0.0',
			contributes: ['mcps'],
			permissions: ['mcp-connect']
		});
		fs.writeFileSync(path.join(tmpDir, 'mcps.json'), JSON.stringify({ schema_version: '1.0.0', servers: [] }));

		const plugins = loader.loadAll();

		expect(plugins).toHaveLength(1);
		expect(plugins[0].mcpsFile).toBe(path.join(tmpDir, 'mcps.json'));
	});

	it('does NOT expose mcpsFile when mcp-connect permission is missing', () => {
		writeJson(path.join(tmpDir, 'valora-plugin.json'), {
			name: 'valora-no-perm',
			version: '1.0.0',
			contributes: ['mcps']
		});
		fs.writeFileSync(path.join(tmpDir, 'mcps.json'), JSON.stringify({ schema_version: '1.0.0', servers: [] }));

		const plugins = loader.loadAll();

		expect(plugins).toHaveLength(1);
		expect(plugins[0].mcpsFile).toBeUndefined();
	});

	it('does NOT expose mcpsFile when mcps is not in contributes (even with mcp-connect permission)', () => {
		writeJson(path.join(tmpDir, 'valora-plugin.json'), {
			name: 'valora-wrong-contrib',
			version: '1.0.0',
			contributes: ['agents'],
			permissions: ['mcp-connect']
		});
		fs.writeFileSync(path.join(tmpDir, 'mcps.json'), JSON.stringify({ schema_version: '1.0.0', servers: [] }));

		const plugins = loader.loadAll();

		expect(plugins[0].mcpsFile).toBeUndefined();
	});

	it('does NOT expose mcpsFile when mcps.json is absent', () => {
		writeJson(path.join(tmpDir, 'valora-plugin.json'), {
			name: 'valora-no-file',
			version: '1.0.0',
			contributes: ['mcps'],
			permissions: ['mcp-connect']
		});

		const plugins = loader.loadAll();

		expect(plugins[0].mcpsFile).toBeUndefined();
	});
});

describe('PluginLoaderService — code plugin bundle', () => {
	let tmpDir: string;
	let loader: PluginLoaderService;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-code-plugin-test-'));
		loader = new PluginLoaderService({
			discoverPluginDirs: () => [tmpDir]
		} as never);
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('resolves codeEntrypoint when contributes code and has code-exec permission', () => {
		writeJson(path.join(tmpDir, 'valora-plugin.json'), {
			name: 'my-code-plugin',
			version: '1.0.0',
			contributes: ['code'],
			permissions: ['code-exec'],
			codeEntrypoint: 'index.js'
		});
		writeFile(path.join(tmpDir, 'index.js'), 'export function register(api) {}');

		const plugins = loader.loadAll(undefined);

		expect(plugins).toHaveLength(1);
		expect(plugins[0]?.codeEntrypoint).toBe(path.join(tmpDir, 'index.js'));
	});

	it('does not resolve codeEntrypoint when code-exec permission is absent', () => {
		writeJson(path.join(tmpDir, 'valora-plugin.json'), {
			name: 'my-code-plugin-no-perm',
			version: '1.0.0',
			contributes: ['code'],
			codeEntrypoint: 'index.js'
		});
		writeFile(path.join(tmpDir, 'index.js'), 'export function register(api) {}');

		const plugins = loader.loadAll(undefined);

		expect(plugins[0]?.codeEntrypoint).toBeUndefined();
	});

	it('does not resolve codeEntrypoint when the file does not exist', () => {
		writeJson(path.join(tmpDir, 'valora-plugin.json'), {
			name: 'my-code-plugin-missing',
			version: '1.0.0',
			contributes: ['code'],
			permissions: ['code-exec'],
			codeEntrypoint: 'index.js'
		});
		// Note: index.js is not created

		const plugins = loader.loadAll(undefined);

		expect(plugins[0]?.codeEntrypoint).toBeUndefined();
	});
});
