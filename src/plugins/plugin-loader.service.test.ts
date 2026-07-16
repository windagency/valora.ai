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

const mockRegisterPluginDir = vi.fn();
vi.mock('utils/resource-resolver', () => ({
	getResourceResolver: () => ({ registerPluginDir: mockRegisterPluginDir })
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
			discoverWithSource: () => [{ dir: tmpDir, location: 'built-in' as const }]
		} as never);
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('loads an agent-only plugin and exposes agentsDir', () => {
		writeJson(path.join(tmpDir, 'valora-plugin.json'), {
			name: 'valora-plugin-secops',
			version: '1.0.0',
			description: 'SecOps agent bundle',
			contributes: ['agents']
		});
		const agentFile = path.join(tmpDir, 'agents', 'secops-engineer.md');
		writeFile(agentFile, '---\nrole: secops-engineer\n---\ntest');

		const plugins = loader.loadAll();

		expect(plugins).toHaveLength(1);
		expect(plugins[0].manifest.name).toBe('valora-plugin-secops');
		expect(plugins[0].agentsDir).toBe(path.join(tmpDir, 'agents'));
		expect(plugins[0].commandsDir).toBeUndefined();
		expect(plugins[0].hooks).toBeUndefined();
	});

	it('preserves the discovery location on the loaded plugin', () => {
		writeJson(path.join(tmpDir, 'valora-plugin.json'), {
			name: 'valora-plugin-secops',
			version: '1.0.0',
			contributes: ['agents']
		});

		const plugins = loader.loadAll();

		expect(plugins[0].location).toBe('built-in');
	});

	it('returns status enabled for a valid agent plugin', () => {
		writeJson(path.join(tmpDir, 'valora-plugin.json'), {
			name: 'valora-plugin-design',
			version: '1.0.0',
			contributes: ['agents']
		});
		writeFile(path.join(tmpDir, 'agents', 'ui-ux-designer.md'), '---\nrole: ui-ux-designer\n---\ntest');

		const plugins = loader.loadAll();

		expect(plugins[0].status).toBe('enabled');
	});

	it('respects plugins.enabled allowlist — skips plugin not in list', () => {
		writeJson(path.join(tmpDir, 'valora-plugin.json'), {
			name: 'valora-plugin-platform',
			version: '1.0.0',
			contributes: ['agents']
		});
		writeFile(path.join(tmpDir, 'agents', 'platform-engineer.md'), '---\nrole: platform-engineer\n---\ntest');

		const plugins = loader.loadAll({ enabled: ['other-plugin'] });

		expect(plugins).toHaveLength(0);
	});

	it('registers each loaded plugin directory with the ResourceResolver', () => {
		mockRegisterPluginDir.mockClear();
		writeJson(path.join(tmpDir, 'valora-plugin.json'), {
			name: 'valora-plugin-secops',
			version: '1.0.0',
			contributes: ['agents']
		});
		writeFile(path.join(tmpDir, 'agents', 'secops-engineer.md'), '---\nrole: secops-engineer\n---\ntest');

		loader.loadAll();

		expect(mockRegisterPluginDir).toHaveBeenCalledWith(tmpDir);
	});

	it('excludes a plugin with a malformed manifest from loadAll() (not just catalogAll())', () => {
		fs.writeFileSync(path.join(tmpDir, 'valora-plugin.json'), '{ "broken": true }');

		const plugins = loader.loadAll();

		expect(plugins).toHaveLength(0);
	});
});

describe('PluginLoaderService — prompts bundle', () => {
	let tmpDir: string;
	let loader: PluginLoaderService;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-plugin-test-'));
		loader = new PluginLoaderService({
			discoverWithSource: () => [{ dir: tmpDir, location: 'user' as const }]
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
			discoverWithSource: () => [{ dir: tmpDir, location: 'project' as const }]
		} as never);
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('exposes both commandsDir and agentsDir for a command+agent bundle', () => {
		writeJson(path.join(tmpDir, 'valora-plugin.json'), {
			name: 'valora-plugin-product',
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
		expect(plugins[0].manifest.name).toBe('valora-plugin-product');
		expect(plugins[0].agentsDir).toBe(path.join(tmpDir, 'agents'));
		expect(plugins[0].commandsDir).toBe(path.join(tmpDir, 'commands'));
		expect(plugins[0].promptsDir).toBeUndefined();
		expect(plugins[0].hooks).toBeUndefined();
	});

	it('exposes only commandsDir for a commands-only bundle (no agent in manifest)', () => {
		writeJson(path.join(tmpDir, 'valora-plugin.json'), {
			name: 'valora-plugin-docs',
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
			discoverWithSource: () => [{ dir: tmpDir, location: 'npm' as const }]
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
			discoverWithSource: () => [{ dir: tmpDir, location: 'built-in' as const }]
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

describe('PluginLoaderService — permission/contribute mismatch warnings', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-warn-test-'));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('logs a warning when contributes code but code-exec permission is absent', async () => {
		const { getLogger } = await import('output/logger');
		const mockWarn = vi.fn();
		vi.mocked(getLogger).mockReturnValueOnce({
			warn: mockWarn,
			info: vi.fn(),
			debug: vi.fn(),
			error: vi.fn()
		} as never);

		const loader = new PluginLoaderService({
			discoverWithSource: () => [{ dir: tmpDir, location: 'built-in' as const }]
		} as never);

		writeJson(path.join(tmpDir, 'valora-plugin.json'), {
			name: 'code-plugin-no-perm',
			version: '1.0.0',
			contributes: ['code'],
			codeEntrypoint: 'index.js'
		});
		writeFile(path.join(tmpDir, 'index.js'), '');

		loader.loadAll();

		expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('code-exec'), expect.anything());
	});

	it('logs a warning when contributes hooks but shell-hooks permission is absent', async () => {
		const { getLogger } = await import('output/logger');
		const mockWarn = vi.fn();
		vi.mocked(getLogger).mockReturnValueOnce({
			warn: mockWarn,
			info: vi.fn(),
			debug: vi.fn(),
			error: vi.fn()
		} as never);

		const loader = new PluginLoaderService({
			discoverWithSource: () => [{ dir: tmpDir, location: 'built-in' as const }]
		} as never);

		writeJson(path.join(tmpDir, 'valora-plugin.json'), {
			name: 'hooks-plugin-no-perm',
			version: '1.0.0',
			contributes: ['hooks']
		});

		loader.loadAll();

		expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('shell-hooks'), expect.anything());
	});

	it('logs a warning when contributes mcps but mcp-connect permission is absent', async () => {
		const { getLogger } = await import('output/logger');
		const mockWarn = vi.fn();
		vi.mocked(getLogger).mockReturnValueOnce({
			warn: mockWarn,
			info: vi.fn(),
			debug: vi.fn(),
			error: vi.fn()
		} as never);

		const loader = new PluginLoaderService({
			discoverWithSource: () => [{ dir: tmpDir, location: 'built-in' as const }]
		} as never);

		writeJson(path.join(tmpDir, 'valora-plugin.json'), {
			name: 'mcps-plugin-no-perm',
			version: '1.0.0',
			contributes: ['mcps']
		});

		loader.loadAll();

		expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('mcp-connect'), expect.anything());
	});
});

describe('PluginLoaderService — hooks.json loading', () => {
	let tmpDir: string;
	let loader: PluginLoaderService;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-hooks-test-'));
		loader = new PluginLoaderService({
			discoverWithSource: () => [{ dir: tmpDir, location: 'built-in' as const }]
		} as never);
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('loads real hook definitions from hooks.json when the plugin has shell-hooks permission', () => {
		writeJson(path.join(tmpDir, 'valora-plugin.json'), {
			name: 'valora-plugin-rtk',
			version: '1.0.0',
			contributes: ['hooks'],
			permissions: ['shell-hooks']
		});
		writeJson(path.join(tmpDir, 'hooks.json'), {
			hooks: { PreToolUse: [{ matcher: '^rtk$', hooks: [{ type: 'command', command: 'rtk' }] }] }
		});

		const plugins = loader.loadAll();

		expect(plugins).toHaveLength(1);
		expect(plugins[0].hooks?.PreToolUse).toHaveLength(1);
		expect(plugins[0].hooks?.PreToolUse?.[0]?.matcher).toBe('^rtk$');
		expect(plugins[0].hooks?.PreToolUse?.[0]?.hooks[0]?.command).toBe('rtk');
	});

	it('loads the plugin without hooks when hooks.json is malformed, rather than failing the whole plugin', () => {
		writeJson(path.join(tmpDir, 'valora-plugin.json'), {
			name: 'valora-plugin-rtk',
			version: '1.0.0',
			contributes: ['hooks'],
			permissions: ['shell-hooks']
		});
		writeJson(path.join(tmpDir, 'hooks.json'), { hooks: { PreToolUse: 'not-an-array' } });

		const plugins = loader.loadAll();

		expect(plugins).toHaveLength(1);
		expect(plugins[0].hooks).toBeUndefined();
	});
});

describe('PluginLoaderService — requires dependency ordering', () => {
	let tmpDirA: string;
	let tmpDirB: string;
	let loader: PluginLoaderService;

	beforeEach(() => {
		tmpDirA = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-req-test-a-'));
		tmpDirB = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-req-test-b-'));
		loader = new PluginLoaderService({
			discoverWithSource: () => [
				{ dir: tmpDirA, location: 'user' as const },
				{ dir: tmpDirB, location: 'user' as const }
			]
		} as never);
	});

	afterEach(() => {
		fs.rmSync(tmpDirA, { recursive: true, force: true });
		fs.rmSync(tmpDirB, { recursive: true, force: true });
	});

	it('loads dependency before dependent when requires is declared', () => {
		// tmpDirA is discovered first but requires tmpDirB — must be reordered
		writeJson(path.join(tmpDirA, 'valora-plugin.json'), {
			name: 'plugin-a',
			version: '1.0.0',
			requires: ['plugin-b']
		});
		writeJson(path.join(tmpDirB, 'valora-plugin.json'), {
			name: 'plugin-b',
			version: '1.0.0'
		});

		const plugins = loader.loadAll();
		const names = plugins.map((p) => p.manifest.name);

		expect(names.indexOf('plugin-b')).toBeLessThan(names.indexOf('plugin-a'));
	});

	it('loads all plugins when requires is satisfied', () => {
		writeJson(path.join(tmpDirA, 'valora-plugin.json'), {
			name: 'plugin-a',
			version: '1.0.0',
			requires: ['plugin-b']
		});
		writeJson(path.join(tmpDirB, 'valora-plugin.json'), {
			name: 'plugin-b',
			version: '1.0.0'
		});

		const plugins = loader.loadAll();
		expect(plugins).toHaveLength(2);
	});

	it('still loads the dependent plugin when required plugin is absent (with warning)', () => {
		writeJson(path.join(tmpDirA, 'valora-plugin.json'), {
			name: 'plugin-a',
			version: '1.0.0',
			requires: ['plugin-missing']
		});

		const plugins = loader.loadAll();

		// plugin-a still loads despite missing dep
		expect(plugins).toHaveLength(1);
		expect(plugins[0]?.manifest.name).toBe('plugin-a');
	});

	it('does not throw on a dependency cycle and still returns all plugins', () => {
		writeJson(path.join(tmpDirA, 'valora-plugin.json'), {
			name: 'plugin-a',
			version: '1.0.0',
			requires: ['plugin-b']
		});
		writeJson(path.join(tmpDirB, 'valora-plugin.json'), {
			name: 'plugin-b',
			version: '1.0.0',
			requires: ['plugin-a']
		});

		const plugins = loader.loadAll();
		expect(plugins).toHaveLength(2);
	});
});

describe('PluginLoaderService — isInstalled()', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-is-installed-test-'));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	function makeLoader(dirs: Array<{ dir: string; location: 'built-in' | 'npm' | 'project' | 'user' }>) {
		return new PluginLoaderService({
			discoverWithSource: () => dirs
		} as never);
	}

	it('returns true when a plugin with the given name is catalogued', () => {
		writeJson(path.join(tmpDir, 'valora-plugin.json'), { name: 'valora-plugin-rtk', version: '1.0.0' });
		const loader = makeLoader([{ dir: tmpDir, location: 'user' }]);

		expect(loader.isInstalled('valora-plugin-rtk')).toBe(true);
	});

	it('returns false when no catalogued plugin has the given name', () => {
		writeJson(path.join(tmpDir, 'valora-plugin.json'), { name: 'valora-plugin-rtk', version: '1.0.0' });
		const loader = makeLoader([{ dir: tmpDir, location: 'user' }]);

		expect(loader.isInstalled('valora-plugin-other')).toBe(false);
	});

	it('returns false when the only catalogued plugin has an invalid manifest', () => {
		fs.writeFileSync(path.join(tmpDir, 'valora-plugin.json'), '{ "broken": true }');
		const loader = makeLoader([{ dir: tmpDir, location: 'user' }]);

		expect(loader.isInstalled('valora-plugin-rtk')).toBe(false);
	});
});

describe('PluginLoaderService — catalogAll()', () => {
	let tmpDirEnabled: string;
	let tmpDirDisabled: string;

	beforeEach(() => {
		tmpDirEnabled = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-catalog-test-enabled-'));
		tmpDirDisabled = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-catalog-test-disabled-'));
	});

	afterEach(() => {
		fs.rmSync(tmpDirEnabled, { recursive: true, force: true });
		fs.rmSync(tmpDirDisabled, { recursive: true, force: true });
	});

	function makeDiscovery(dirs: Array<{ dir: string; location: 'built-in' | 'npm' | 'project' | 'user' }>) {
		return {
			discoverPluginDirs: () => dirs.map((d) => d.dir),
			discoverWithSource: () => dirs
		};
	}

	it('returns enabled status for a plugin listed in plugins.enabled', () => {
		writeJson(path.join(tmpDirEnabled, 'valora-plugin.json'), {
			name: 'my-plugin',
			version: '1.0.0'
		});
		const loader = new PluginLoaderService(makeDiscovery([{ dir: tmpDirEnabled, location: 'user' }]) as never);

		const result = loader.catalogAll({ enabled: ['my-plugin'] });

		expect(result).toHaveLength(1);
		expect(result[0].status).toBe('enabled');
		expect(result[0].manifest?.name).toBe('my-plugin');
		expect(result[0].location).toBe('user');
	});

	it('returns disabled status for a plugin not listed in plugins.enabled', () => {
		writeJson(path.join(tmpDirDisabled, 'valora-plugin.json'), {
			name: 'inactive-plugin',
			version: '2.0.0'
		});
		const loader = new PluginLoaderService(makeDiscovery([{ dir: tmpDirDisabled, location: 'project' }]) as never);

		const result = loader.catalogAll({ enabled: ['other-plugin'] });

		expect(result).toHaveLength(1);
		expect(result[0].status).toBe('disabled');
		expect(result[0].manifest?.name).toBe('inactive-plugin');
	});

	it('returns enabled for all plugins when no plugins.enabled allowlist is set', () => {
		writeJson(path.join(tmpDirEnabled, 'valora-plugin.json'), { name: 'any-plugin', version: '1.0.0' });
		const loader = new PluginLoaderService(makeDiscovery([{ dir: tmpDirEnabled, location: 'built-in' }]) as never);

		const result = loader.catalogAll();

		expect(result[0].status).toBe('enabled');
	});

	it('returns invalid status for a plugin with a malformed manifest', () => {
		fs.mkdirSync(tmpDirDisabled, { recursive: true });
		fs.writeFileSync(path.join(tmpDirDisabled, 'valora-plugin.json'), '{ "broken": true }');
		const loader = new PluginLoaderService(makeDiscovery([{ dir: tmpDirDisabled, location: 'user' }]) as never);

		const result = loader.catalogAll();

		expect(result).toHaveLength(1);
		expect(result[0].status).toBe('invalid');
		expect(result[0].manifest).toBeNull();
	});

	it('returns invalid status when the manifest file is missing entirely', () => {
		fs.mkdirSync(tmpDirDisabled, { recursive: true });
		// No valora-plugin.json written
		const loader = new PluginLoaderService(makeDiscovery([{ dir: tmpDirDisabled, location: 'npm' }]) as never);

		const result = loader.catalogAll();

		expect(result[0].status).toBe('invalid');
	});

	it('catalogs both enabled and disabled plugins together', () => {
		writeJson(path.join(tmpDirEnabled, 'valora-plugin.json'), { name: 'plugin-a', version: '1.0.0' });
		writeJson(path.join(tmpDirDisabled, 'valora-plugin.json'), { name: 'plugin-b', version: '1.0.0' });
		const loader = new PluginLoaderService(
			makeDiscovery([
				{ dir: tmpDirEnabled, location: 'user' },
				{ dir: tmpDirDisabled, location: 'project' }
			]) as never
		);

		const result = loader.catalogAll({ enabled: ['plugin-a'] });

		expect(result).toHaveLength(2);
		expect(result.find((p) => p.manifest?.name === 'plugin-a')?.status).toBe('enabled');
		expect(result.find((p) => p.manifest?.name === 'plugin-b')?.status).toBe('disabled');
	});
});

describe('PluginLoaderService — unenforced permissions audit', () => {
	let tmpDir: string;
	let loader: PluginLoaderService;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-perms-test-'));
		loader = new PluginLoaderService({
			discoverWithSource: () => [{ dir: tmpDir, location: 'built-in' as const }]
		} as never);
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('records fs-read, fs-write, and network as unenforced when declared', () => {
		writeJson(path.join(tmpDir, 'valora-plugin.json'), {
			name: 'wide-permissions-plugin',
			version: '1.0.0',
			contributes: ['agents'],
			permissions: ['fs-read', 'fs-write', 'network']
		});
		writeFile(path.join(tmpDir, 'agents', 'foo.md'), '---\nrole: foo\n---\ntest');

		const plugins = loader.loadAll();

		expect(plugins).toHaveLength(1);
		expect(plugins[0].unenforcedPermissions).toEqual(expect.arrayContaining(['fs-read', 'fs-write', 'network']));
	});

	it('does not list code-exec or shell-hooks among unenforced permissions', () => {
		writeJson(path.join(tmpDir, 'valora-plugin.json'), {
			name: 'mixed-permissions-plugin',
			version: '1.0.0',
			contributes: ['hooks'],
			permissions: ['shell-hooks', 'fs-write']
		});

		const plugins = loader.loadAll();

		expect(plugins[0].unenforcedPermissions).toEqual(['fs-write']);
	});

	it('omits unenforcedPermissions when no informational permissions are declared', () => {
		writeJson(path.join(tmpDir, 'valora-plugin.json'), {
			name: 'minimal-plugin',
			version: '1.0.0',
			contributes: ['agents'],
			permissions: []
		});

		const plugins = loader.loadAll();

		expect(plugins[0].unenforcedPermissions).toBeUndefined();
	});
});

describe('PluginLoaderService — node_modules wiring for requires', () => {
	let vaultDir: string;
	let runtimeDir: string;

	beforeEach(() => {
		vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-vault-wire-'));
		runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-runtime-wire-'));
	});

	afterEach(() => {
		fs.rmSync(vaultDir, { recursive: true, force: true });
		fs.rmSync(runtimeDir, { recursive: true, force: true });
	});

	it('creates a node_modules symlink so code plugins can import their required deps', () => {
		writeJson(path.join(vaultDir, 'valora-plugin.json'), {
			name: 'valora-plugin-memory-vault',
			version: '1.0.0',
			contributes: ['code'],
			permissions: ['code-exec'],
			codeEntrypoint: 'dist/index.js',
			requires: ['valora-runtime']
		});
		writeJson(path.join(runtimeDir, 'valora-plugin.json'), {
			name: 'valora-runtime',
			version: '1.0.0'
		});
		writeJson(path.join(runtimeDir, 'package.json'), {
			name: '@windagency/valora-runtime',
			version: '1.0.0'
		});

		const loader = new PluginLoaderService({
			discoverWithSource: () => [
				{ dir: vaultDir, location: 'user' as const },
				{ dir: runtimeDir, location: 'user' as const }
			]
		} as never);

		loader.loadAll();

		const symlinkPath = path.join(vaultDir, 'node_modules', '@windagency', 'valora-runtime');
		expect(fs.existsSync(symlinkPath)).toBe(true);
		expect(fs.lstatSync(symlinkPath).isSymbolicLink()).toBe(true);
		expect(fs.realpathSync(symlinkPath)).toBe(fs.realpathSync(runtimeDir));
	});

	it('falls back to the @windagency convention when the dep has no package.json', () => {
		writeJson(path.join(vaultDir, 'valora-plugin.json'), {
			name: 'valora-plugin-memory-vault',
			version: '1.0.0',
			requires: ['valora-runtime']
		});
		writeJson(path.join(runtimeDir, 'valora-plugin.json'), {
			name: 'valora-runtime',
			version: '1.0.0'
		});

		const loader = new PluginLoaderService({
			discoverWithSource: () => [
				{ dir: vaultDir, location: 'user' as const },
				{ dir: runtimeDir, location: 'user' as const }
			]
		} as never);

		loader.loadAll();

		const symlinkPath = path.join(vaultDir, 'node_modules', '@windagency', 'valora-runtime');
		expect(fs.existsSync(symlinkPath)).toBe(true);
	});

	it('skips wiring when the required dependency is not among discovered plugins', () => {
		writeJson(path.join(vaultDir, 'valora-plugin.json'), {
			name: 'valora-plugin-memory-vault',
			version: '1.0.0',
			requires: ['valora-runtime']
		});

		const loader = new PluginLoaderService({
			discoverWithSource: () => [{ dir: vaultDir, location: 'user' as const }]
		} as never);

		loader.loadAll();

		const symlinkPath = path.join(vaultDir, 'node_modules', '@windagency', 'valora-runtime');
		expect(fs.existsSync(symlinkPath)).toBe(false);
	});

	it('is idempotent when loadAll is called multiple times', () => {
		writeJson(path.join(vaultDir, 'valora-plugin.json'), {
			name: 'valora-plugin-memory-vault',
			version: '1.0.0',
			requires: ['valora-runtime']
		});
		writeJson(path.join(runtimeDir, 'valora-plugin.json'), {
			name: 'valora-runtime',
			version: '1.0.0'
		});

		const loader = new PluginLoaderService({
			discoverWithSource: () => [
				{ dir: vaultDir, location: 'user' as const },
				{ dir: runtimeDir, location: 'user' as const }
			]
		} as never);

		loader.loadAll();
		expect(() => loader.loadAll()).not.toThrow();
	});

	it('wires symlinks from peerDependencies even when requires is absent from valora-plugin.json', () => {
		writeJson(path.join(vaultDir, 'valora-plugin.json'), {
			name: 'valora-plugin-memory-vault',
			version: '1.0.0',
			contributes: ['code'],
			permissions: ['code-exec'],
			codeEntrypoint: 'dist/index.js'
			// no requires field — simulates an old tarball without it
		});
		writeJson(path.join(vaultDir, 'package.json'), {
			name: '@windagency/valora-plugin-memory-vault',
			version: '1.0.0',
			peerDependencies: {
				'@windagency/valora': '>=0.1.0',
				'@windagency/valora-runtime': '*'
			}
		});
		writeJson(path.join(runtimeDir, 'valora-plugin.json'), {
			name: 'valora-runtime',
			version: '1.0.0'
		});
		writeJson(path.join(runtimeDir, 'package.json'), {
			name: '@windagency/valora-runtime',
			version: '1.0.0'
		});
		writeFile(path.join(vaultDir, 'dist', 'index.js'), 'export function register(api) {}');

		const loader = new PluginLoaderService({
			discoverWithSource: () => [
				{ dir: vaultDir, location: 'user' as const },
				{ dir: runtimeDir, location: 'user' as const }
			]
		} as never);

		loader.loadAll();

		const symlinkPath = path.join(vaultDir, 'node_modules', '@windagency', 'valora-runtime');
		expect(fs.existsSync(symlinkPath)).toBe(true);
		expect(fs.lstatSync(symlinkPath).isSymbolicLink()).toBe(true);
		expect(fs.realpathSync(symlinkPath)).toBe(fs.realpathSync(runtimeDir));
	});
});

describe('PluginLoaderService — engines.valora compatibility', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-engines-test-'));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	function makeLoader(hostVersion: string): PluginLoaderService {
		return new PluginLoaderService(
			{ discoverWithSource: () => [{ dir: tmpDir, location: 'built-in' as const }] } as never,
			() => hostVersion
		);
	}

	it('loads a plugin whose engines.valora range is satisfied by the host', () => {
		writeJson(path.join(tmpDir, 'valora-plugin.json'), {
			name: 'compatible-plugin',
			version: '1.0.0',
			contributes: ['agents'],
			engines: { valora: '>=2.0.0' }
		});
		writeFile(path.join(tmpDir, 'agents', 'foo.md'), '---\nrole: foo\n---\ntest');

		const plugins = makeLoader('2.5.0').loadAll();

		expect(plugins).toHaveLength(1);
		expect(plugins[0].status).toBe('enabled');
	});

	it('skips a plugin whose engines.valora range excludes the host version', () => {
		writeJson(path.join(tmpDir, 'valora-plugin.json'), {
			name: 'incompatible-plugin',
			version: '1.0.0',
			contributes: ['agents'],
			engines: { valora: '>=99.0.0' }
		});
		writeFile(path.join(tmpDir, 'agents', 'foo.md'), '---\nrole: foo\n---\ntest');

		const plugins = makeLoader('2.5.0').loadAll();

		expect(plugins).toHaveLength(0);
	});

	it('reports incompatible plugins as invalid in the catalogue', () => {
		writeJson(path.join(tmpDir, 'valora-plugin.json'), {
			name: 'incompatible-plugin',
			version: '1.0.0',
			contributes: ['agents'],
			engines: { valora: '>=99.0.0' }
		});

		const result = makeLoader('2.5.0').catalogAll();

		expect(result).toHaveLength(1);
		expect(result[0].status).toBe('invalid');
		expect(result[0].validationErrors?.[0]).toMatch(/engines\.valora/);
	});

	it('loads a plugin without engines.valora (treated as universally compatible)', () => {
		writeJson(path.join(tmpDir, 'valora-plugin.json'), {
			name: 'no-engines-plugin',
			version: '1.0.0',
			contributes: ['agents']
		});
		writeFile(path.join(tmpDir, 'agents', 'foo.md'), '---\nrole: foo\n---\ntest');

		const plugins = makeLoader('2.5.0').loadAll();

		expect(plugins).toHaveLength(1);
	});
});
