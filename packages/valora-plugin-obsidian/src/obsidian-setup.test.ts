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

	it('returns ~/.valora/memory as the global fallback when no project vault exists', () => {
		const config = { obsidian: { colors: { decisions: '#059669', episodic: '#4c9be8', semantic: '#7c3aed' } } };
		const expected = path.join(os.homedir(), '.valora', 'memory');
		expect(resolveVaultDir(config)).toBe(expected);
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

	it('overwrites app.json on a second call', async () => {
		await setupObsidianVault(makeConfig(tmpDir));
		const appPath = path.join(tmpDir, '.obsidian', 'app.json');
		fs.writeFileSync(appPath, '{}');
		await setupObsidianVault(makeConfig(tmpDir));
		const content = JSON.parse(fs.readFileSync(appPath, 'utf-8')) as { livePreview?: boolean };
		expect(content.livePreview).toBe(true);
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
});
