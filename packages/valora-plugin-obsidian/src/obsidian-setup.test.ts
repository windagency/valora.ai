import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveVaultDir, setupObsidianVault } from './obsidian-setup.js';

function makeConfig(vaultDir: string) {
	return {
		obsidian: {
			colors: { decisions: '#059669', episodic: '#4c9be8', semantic: '#7c3aed' },
			vaultDir
		}
	};
}

describe('resolveVaultDir', () => {
	it('returns config.obsidian.vaultDir when provided', () => {
		const config = makeConfig('/custom/vault');
		expect(resolveVaultDir(config)).toBe('/custom/vault');
	});

	it('returns the project-local .valora/memory when it exists', () => {
		const tmpRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'valora-cwd-')));
		const projectVault = path.join(tmpRoot, '.valora', 'memory');
		fs.mkdirSync(projectVault, { recursive: true });
		try {
			const config = { obsidian: { colors: { decisions: '#059669', episodic: '#4c9be8', semantic: '#7c3aed' } } };
			expect(resolveVaultDir(config, tmpRoot)).toBe(projectVault);
		} finally {
			fs.rmSync(tmpRoot, { force: true, recursive: true });
		}
	});

	it('walks up from a subdirectory to find the project .valora/memory at an ancestor', () => {
		const tmpRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'valora-walkup-')));
		const projectVault = path.join(tmpRoot, '.valora', 'memory');
		fs.mkdirSync(projectVault, { recursive: true });
		const subdir = path.join(tmpRoot, 'src', 'foo', 'bar');
		fs.mkdirSync(subdir, { recursive: true });
		try {
			const config = { obsidian: { colors: { decisions: '#059669', episodic: '#4c9be8', semantic: '#7c3aed' } } };
			// Calling from a deep subdirectory must still resolve to the project vault, not ~/.valora/memory.
			expect(resolveVaultDir(config, subdir)).toBe(projectVault);
		} finally {
			fs.rmSync(tmpRoot, { force: true, recursive: true });
		}
	});

	it('returns ~/.valora/memory as the global fallback when no project vault exists in any ancestor', () => {
		// Use a tmp dir with no `.valora/` anywhere in its ancestry to exercise the fallback.
		const tmpRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'valora-no-project-')));
		try {
			const config = { obsidian: { colors: { decisions: '#059669', episodic: '#4c9be8', semantic: '#7c3aed' } } };
			const expected = path.join(os.homedir(), '.valora', 'memory');
			// If the tmpdir's ancestry happens to contain a `.valora/` (e.g. running tests from inside
			// such a directory), the walk-up must NOT cross out of the tmpdir for this assertion to hold.
			// `os.tmpdir()` lives outside the Valora project on every platform we ship to, so this is safe.
			expect(resolveVaultDir(config, tmpRoot)).toBe(expected);
		} finally {
			fs.rmSync(tmpRoot, { force: true, recursive: true });
		}
	});
});

describe('setupObsidianVault', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-obsidian-'));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { force: true, recursive: true });
	});

	it('creates .obsidian/app.json, core-plugins.json, graph.json, and workspace.json', async () => {
		await setupObsidianVault(makeConfig(tmpDir));
		const obsDir = path.join(tmpDir, '.obsidian');
		expect(fs.existsSync(path.join(obsDir, 'app.json'))).toBe(true);
		expect(fs.existsSync(path.join(obsDir, 'core-plugins.json'))).toBe(true);
		expect(fs.existsSync(path.join(obsDir, 'graph.json'))).toBe(true);
		expect(fs.existsSync(path.join(obsDir, 'workspace.json'))).toBe(true);
	});

	it('creates the episodic, semantic, and decisions category subdirectories', async () => {
		await setupObsidianVault(makeConfig(tmpDir));
		expect(fs.existsSync(path.join(tmpDir, 'episodic'))).toBe(true);
		expect(fs.existsSync(path.join(tmpDir, 'semantic'))).toBe(true);
		expect(fs.existsSync(path.join(tmpDir, 'decisions'))).toBe(true);
	});

	it('writes colour config into graph.json correctly', async () => {
		await setupObsidianVault(makeConfig(tmpDir));
		const graph = JSON.parse(fs.readFileSync(path.join(tmpDir, '.obsidian', 'graph.json'), 'utf-8')) as {
			colorGroups: Array<{ query: string; color: { r: number; g: number; b: number } }>;
		};
		const episodic = graph.colorGroups.find((g) => g.query === 'path:episodic');
		expect(episodic?.color).toEqual({ r: 76, g: 155, b: 232 });
	});

	it('preserves user customisations to app.json on a second call', async () => {
		await setupObsidianVault(makeConfig(tmpDir));
		const appPath = path.join(tmpDir, '.obsidian', 'app.json');
		const userCustom = { livePreview: false, showLineNumber: true, useTab: false };
		fs.writeFileSync(appPath, JSON.stringify(userCustom));
		await setupObsidianVault(makeConfig(tmpDir));
		const content = JSON.parse(fs.readFileSync(appPath, 'utf-8')) as Record<string, unknown>;
		expect(content).toEqual(userCustom);
	});

	it('preserves user customisations to core-plugins.json on a second call', async () => {
		await setupObsidianVault(makeConfig(tmpDir));
		const corePath = path.join(tmpDir, '.obsidian', 'core-plugins.json');
		const userCustom = { 'file-explorer': true, graph: false, 'my-extra-plugin': true };
		fs.writeFileSync(corePath, JSON.stringify(userCustom));
		await setupObsidianVault(makeConfig(tmpDir));
		const content = JSON.parse(fs.readFileSync(corePath, 'utf-8')) as Record<string, boolean>;
		expect(content).toEqual(userCustom);
	});

	it('preserves user customisations to graph.json on a second call', async () => {
		await setupObsidianVault(makeConfig(tmpDir));
		const graphPath = path.join(tmpDir, '.obsidian', 'graph.json');
		const userCustom = { colorGroups: [{ query: 'tag:#starred', color: { r: 255, g: 0, b: 0 } }], showTags: false };
		fs.writeFileSync(graphPath, JSON.stringify(userCustom));
		await setupObsidianVault(makeConfig(tmpDir));
		const content = JSON.parse(fs.readFileSync(graphPath, 'utf-8')) as unknown;
		expect(content).toEqual(userCustom);
	});

	it('does not overwrite workspace.json on a second call', async () => {
		await setupObsidianVault(makeConfig(tmpDir));
		const wPath = path.join(tmpDir, '.obsidian', 'workspace.json');
		const custom = { custom: true };
		fs.writeFileSync(wPath, JSON.stringify(custom));
		await setupObsidianVault(makeConfig(tmpDir));
		const content = JSON.parse(fs.readFileSync(wPath, 'utf-8')) as unknown;
		expect(content).toEqual(custom);
	});

	it('regenerates a config file from the template if the user deletes it', async () => {
		await setupObsidianVault(makeConfig(tmpDir));
		const appPath = path.join(tmpDir, '.obsidian', 'app.json');
		fs.rmSync(appPath);
		await setupObsidianVault(makeConfig(tmpDir));
		const content = JSON.parse(fs.readFileSync(appPath, 'utf-8')) as { livePreview?: boolean };
		expect(content.livePreview).toBe(true);
	});
});
