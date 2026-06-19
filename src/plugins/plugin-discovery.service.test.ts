import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PluginDiscoveryService } from './plugin-discovery.service';

vi.mock('output/logger', () => ({
	getLogger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warn: vi.fn()
	}))
}));

// Silence the built-in / global / project root scanning — they don't exist in test tmpDirs
vi.mock('utils/paths', () => ({
	getGlobalPluginsDir: vi.fn(() => '/nonexistent/global'),
	getPackagePluginsDir: vi.fn(() => '/nonexistent/builtin'),
	getProjectPluginsDir: vi.fn(() => undefined),
	getSystemPluginsDir: vi.fn(() => '/nonexistent/system')
}));

function writeJson(filePath: string, data: unknown): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

describe('PluginDiscoveryService — npm plugin discovery', () => {
	let tmpDir: string;
	let discovery: PluginDiscoveryService;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-discovery-test-'));
		discovery = new PluginDiscoveryService(tmpDir);
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('discovers a valid plugin from node_modules/@windagency/valora-plugin-*', () => {
		const pluginDir = path.join(tmpDir, 'node_modules', '@windagency', 'valora-plugin-engineering');
		writeJson(path.join(pluginDir, 'valora-plugin.json'), {
			name: 'valora-plugin-engineering',
			version: '1.0.0'
		});

		const dirs = discovery.discoverPluginDirs();

		expect(dirs).toContain(pluginDir);
	});

	it('ignores packages in the scope that lack valora-plugin.json', () => {
		const nonPluginDir = path.join(tmpDir, 'node_modules', '@windagency', 'valora-plugin-empty');
		fs.mkdirSync(nonPluginDir, { recursive: true });
		// No valora-plugin.json written

		const dirs = discovery.discoverPluginDirs();

		expect(dirs).not.toContain(nonPluginDir);
	});

	it('ignores packages in the scope not prefixed with valora-plugin- or valora-core-', () => {
		const nonPluginDir = path.join(tmpDir, 'node_modules', '@windagency', 'some-other-package');
		writeJson(path.join(nonPluginDir, 'valora-plugin.json'), {
			name: 'some-other-package',
			version: '1.0.0'
		});

		const dirs = discovery.discoverPluginDirs();

		expect(dirs).not.toContain(nonPluginDir);
	});

	it('discovers a valid plugin from node_modules/@windagency/valora-core-*', () => {
		const pluginDir = path.join(tmpDir, 'node_modules', '@windagency', 'valora-plugin-engineering');
		writeJson(path.join(pluginDir, 'valora-plugin.json'), {
			name: 'valora-plugin-engineering',
			version: '1.0.0'
		});

		const dirs = discovery.discoverPluginDirs();

		expect(dirs).toContain(pluginDir);
	});

	it('returns empty array when node_modules/@windagency does not exist', () => {
		// tmpDir has no node_modules at all
		const dirs = discovery.discoverPluginDirs();
		expect(dirs).toEqual([]);
	});

	it('discovers multiple plugins from the same scope directory', () => {
		const pluginDirA = path.join(tmpDir, 'node_modules', '@windagency', 'valora-plugin-engineering');
		const pluginDirB = path.join(tmpDir, 'node_modules', '@windagency', 'valora-plugin-qa');
		writeJson(path.join(pluginDirA, 'valora-plugin.json'), { name: 'valora-plugin-engineering', version: '1.0.0' });
		writeJson(path.join(pluginDirB, 'valora-plugin.json'), { name: 'valora-plugin-qa', version: '1.0.0' });

		const dirs = discovery.discoverPluginDirs();

		expect(dirs).toContain(pluginDirA);
		expect(dirs).toContain(pluginDirB);
	});

	it('returns standard root plugins before npm plugins', async () => {
		const { getPackagePluginsDir } = await import('utils/paths');

		// Create a real standard plugin root
		const builtinDir = path.join(tmpDir, 'builtin-plugins');
		const builtinPluginDir = path.join(builtinDir, 'my-builtin-plugin');
		writeJson(path.join(builtinPluginDir, 'valora-plugin.json'), { name: 'my-builtin', version: '1.0.0' });
		vi.mocked(getPackagePluginsDir).mockReturnValueOnce(builtinDir);

		// Create an npm plugin
		const npmPluginDir = path.join(tmpDir, 'node_modules', '@windagency', 'valora-plugin-npm');
		writeJson(path.join(npmPluginDir, 'valora-plugin.json'), { name: 'my-npm-plugin', version: '1.0.0' });

		const dirs = discovery.discoverPluginDirs();

		expect(dirs.indexOf(builtinPluginDir)).toBeLessThan(dirs.indexOf(npmPluginDir));
	});
});

describe('PluginDiscoveryService — discoverWithSource()', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-discovery-src-test-'));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('labels a plugin found in the built-in root as built-in', async () => {
		const { getPackagePluginsDir } = await import('utils/paths');
		const builtinRoot = path.join(tmpDir, 'builtin');
		const pluginDir = path.join(builtinRoot, 'my-builtin');
		writeJson(path.join(pluginDir, 'valora-plugin.json'), { name: 'my-builtin', version: '1.0.0' });
		vi.mocked(getPackagePluginsDir).mockReturnValueOnce(builtinRoot);

		const discovery = new PluginDiscoveryService(tmpDir);
		const results = discovery.discoverWithSource();

		expect(results).toContainEqual({ dir: pluginDir, location: 'built-in' });
	});

	it('labels a plugin found in the global user root as user', async () => {
		const { getGlobalPluginsDir } = await import('utils/paths');
		const userRoot = path.join(tmpDir, 'user-plugins');
		const pluginDir = path.join(userRoot, 'my-user-plugin');
		writeJson(path.join(pluginDir, 'valora-plugin.json'), { name: 'my-user-plugin', version: '1.0.0' });
		vi.mocked(getGlobalPluginsDir).mockReturnValueOnce(userRoot);

		const discovery = new PluginDiscoveryService(tmpDir);
		const results = discovery.discoverWithSource();

		expect(results).toContainEqual({ dir: pluginDir, location: 'user' });
	});

	it('labels a plugin found in the project root as project', async () => {
		const { getProjectPluginsDir } = await import('utils/paths');
		const projectRoot = path.join(tmpDir, 'project-plugins');
		const pluginDir = path.join(projectRoot, 'my-project-plugin');
		writeJson(path.join(pluginDir, 'valora-plugin.json'), { name: 'my-project-plugin', version: '1.0.0' });
		vi.mocked(getProjectPluginsDir).mockReturnValueOnce(projectRoot);

		const discovery = new PluginDiscoveryService(tmpDir);
		const results = discovery.discoverWithSource();

		expect(results).toContainEqual({ dir: pluginDir, location: 'project' });
	});

	it('labels a plugin found in node_modules/@windagency as npm', () => {
		const pluginDir = path.join(tmpDir, 'node_modules', '@windagency', 'valora-plugin-engineering');
		writeJson(path.join(pluginDir, 'valora-plugin.json'), { name: 'valora-plugin-engineering', version: '1.0.0' });

		const discovery = new PluginDiscoveryService(tmpDir);
		const results = discovery.discoverWithSource();

		expect(results).toContainEqual({ dir: pluginDir, location: 'npm' });
	});

	it('returns an empty array when no plugins exist in any root', () => {
		const discovery = new PluginDiscoveryService(tmpDir);
		expect(discovery.discoverWithSource()).toEqual([]);
	});

	it('labels a plugin found in the system root as global', async () => {
		const { getSystemPluginsDir } = await import('utils/paths');
		const systemRoot = path.join(tmpDir, 'system-plugins');
		const pluginDir = path.join(systemRoot, 'my-system-plugin');
		writeJson(path.join(pluginDir, 'valora-plugin.json'), { name: 'my-system-plugin', version: '1.0.0' });
		vi.mocked(getSystemPluginsDir).mockReturnValueOnce(systemRoot);

		const discovery = new PluginDiscoveryService(tmpDir);
		const results = discovery.discoverWithSource();

		expect(results).toContainEqual({ dir: pluginDir, location: 'global' });
	});

	it('rejects a plugin entry that is a symlink escaping the discovery root', async () => {
		const { getSystemPluginsDir } = await import('utils/paths');
		const systemRoot = path.join(tmpDir, 'system-plugins');
		const escapeTarget = path.join(tmpDir, 'outside', 'evil-plugin');
		writeJson(path.join(escapeTarget, 'valora-plugin.json'), { name: 'evil-plugin', version: '1.0.0' });
		fs.mkdirSync(systemRoot, { recursive: true });
		fs.symlinkSync(escapeTarget, path.join(systemRoot, 'evil-plugin'), 'dir');
		vi.mocked(getSystemPluginsDir).mockReturnValueOnce(systemRoot);

		const discovery = new PluginDiscoveryService(tmpDir);
		const results = discovery.discoverWithSource();

		expect(results.find((r) => r.dir.includes('evil-plugin'))).toBeUndefined();
	});

	it('rejects a plugin entry whose real path resolves outside the discovery root', async () => {
		const { getSystemPluginsDir } = await import('utils/paths');
		const systemRoot = path.join(tmpDir, 'system-plugins');
		const escapeTarget = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'valora-escape-')));
		writeJson(path.join(escapeTarget, 'valora-plugin.json'), { name: 'escape-plugin', version: '1.0.0' });
		fs.mkdirSync(systemRoot, { recursive: true });
		// symlink whose name passes the readdir directory check on platforms that follow symlinks
		fs.symlinkSync(escapeTarget, path.join(systemRoot, 'escape-plugin'), 'dir');
		vi.mocked(getSystemPluginsDir).mockReturnValueOnce(systemRoot);

		const discovery = new PluginDiscoveryService(tmpDir);
		const results = discovery.discoverWithSource();

		expect(results.find((r) => r.dir.includes('escape-plugin'))).toBeUndefined();
		fs.rmSync(escapeTarget, { recursive: true, force: true });
	});

	it('places global plugins before user plugins so user copy takes precedence', async () => {
		const { getSystemPluginsDir, getGlobalPluginsDir } = await import('utils/paths');
		const systemRoot = path.join(tmpDir, 'system-plugins');
		const userRoot = path.join(tmpDir, 'user-plugins');
		const systemPluginDir = path.join(systemRoot, 'shared-plugin');
		const userPluginDir = path.join(userRoot, 'shared-plugin');
		writeJson(path.join(systemPluginDir, 'valora-plugin.json'), { name: 'shared-plugin', version: '1.0.0' });
		writeJson(path.join(userPluginDir, 'valora-plugin.json'), { name: 'shared-plugin', version: '1.0.0' });
		vi.mocked(getSystemPluginsDir).mockReturnValueOnce(systemRoot);
		vi.mocked(getGlobalPluginsDir).mockReturnValueOnce(userRoot);

		const discovery = new PluginDiscoveryService(tmpDir);
		const results = discovery.discoverWithSource();

		const globalIdx = results.findIndex((r) => r.location === 'global');
		const userIdx = results.findIndex((r) => r.location === 'user');
		expect(globalIdx).toBeGreaterThanOrEqual(0);
		expect(userIdx).toBeGreaterThanOrEqual(0);
		expect(globalIdx).toBeLessThan(userIdx);
	});
});
