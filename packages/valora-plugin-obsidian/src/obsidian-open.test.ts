import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({
	spawn: vi.fn(),
	spawnSync: vi.fn()
}));
vi.mock('node:fs', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:fs')>();
	return { ...actual, existsSync: vi.fn() };
});

import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';

import { buildObsidianUri, openObsidian } from './obsidian-open.js';

describe('buildObsidianUri', () => {
	it('produces an obsidian:// URI starting with the scheme', () => {
		const uri = buildObsidianUri('/home/user/.valora/memory');
		expect(uri).toMatch(/^obsidian:\/\/open\?vault=/);
	});

	it('URL-encodes the vault path', () => {
		const uri = buildObsidianUri('/home/user/.valora/memory');
		expect(uri).toContain('%2F');
	});
});

describe('openObsidian', () => {
	const originalPlatform = process.platform;

	afterEach(() => {
		vi.clearAllMocks();
		Object.defineProperty(process, 'platform', { configurable: true, value: originalPlatform });
	});

	function setPlatform(p: string) {
		Object.defineProperty(process, 'platform', { configurable: true, value: p });
	}

	function mockVaultExists(exists = true) {
		vi.mocked(fs.existsSync).mockReturnValue(exists);
	}

	function mockSpawnSyncSuccess() {
		vi.mocked(spawnSync).mockReturnValue({
			output: [],
			pid: 1,
			signal: null,
			status: 0,
			stderr: null,
			stdout: null
		} as ReturnType<typeof spawnSync>);
	}

	function mockSpawnSyncFailure() {
		vi.mocked(spawnSync).mockReturnValue({
			error: new Error('spawn ENOENT'),
			output: [],
			pid: 0,
			signal: null,
			status: null,
			stderr: null,
			stdout: null
		} as ReturnType<typeof spawnSync>);
	}

	function mockSpawnDetached() {
		const child = { unref: vi.fn() };
		vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);
		return child;
	}

	it('uses "open" on macOS', () => {
		setPlatform('darwin');
		mockVaultExists();
		mockSpawnSyncSuccess();
		openObsidian('/tmp/vault');
		expect(spawnSync).toHaveBeenCalledWith(
			'open',
			expect.arrayContaining([expect.stringContaining('obsidian://')]),
			expect.anything()
		);
	});

	it('uses "cmd /c start" on Windows', () => {
		setPlatform('win32');
		mockVaultExists();
		mockSpawnSyncSuccess();
		openObsidian('/tmp/vault');
		expect(spawnSync).toHaveBeenCalledWith('cmd', expect.arrayContaining(['/c', 'start']), expect.anything());
	});

	it('runs obsidian directly on Linux when found on PATH, passing AppImage and sandbox flags', () => {
		setPlatform('linux');
		mockVaultExists();
		mockSpawnSyncSuccess(); // which obsidian → found
		const child = mockSpawnDetached();
		openObsidian('/tmp/vault');
		expect(spawnSync).toHaveBeenCalledWith('which', ['obsidian'], expect.anything());
		expect(spawn).toHaveBeenCalledWith(
			'obsidian',
			expect.arrayContaining(['--appimage-extract-and-run', '--no-sandbox', expect.stringContaining('obsidian://')]),
			expect.objectContaining({ detached: true })
		);
		expect(child.unref).toHaveBeenCalled();
	});

	it('reports Obsidian not installed on Linux when obsidian is not on PATH', () => {
		setPlatform('linux');
		mockVaultExists();
		vi.mocked(spawnSync).mockReturnValue({
			output: [],
			pid: 0,
			signal: null,
			status: 1,
			stderr: null,
			stdout: null
		} as ReturnType<typeof spawnSync>);
		const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		const result = openObsidian('/tmp/vault');
		expect(result.success).toBe(false);
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Obsidian is not installed'));
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Open this URI manually'));
		expect(spawn).not.toHaveBeenCalled();
	});

	it('reports Obsidian not installed on macOS when the open command fails', () => {
		setPlatform('darwin');
		mockVaultExists();
		mockSpawnSyncFailure();
		const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		const result = openObsidian('/tmp/vault');
		expect(result.success).toBe(false);
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Obsidian is not installed'));
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Open this URI manually'));
	});

	it('reports vault not found when the vault directory does not exist', () => {
		setPlatform('linux');
		mockVaultExists(false);
		const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		const result = openObsidian('/tmp/vault');
		expect(result.success).toBe(false);
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Memory vault not found'));
		expect(spawnSync).not.toHaveBeenCalled();
	});

	it('returns success: true when launch succeeds on macOS', () => {
		setPlatform('darwin');
		mockVaultExists();
		mockSpawnSyncSuccess();
		const result = openObsidian('/tmp/vault');
		expect(result.success).toBe(true);
	});

	it('returns success: true on Linux when obsidian launches', () => {
		setPlatform('linux');
		mockVaultExists();
		mockSpawnSyncSuccess(); // which obsidian → found
		mockSpawnDetached();
		const result = openObsidian('/tmp/vault');
		expect(result.success).toBe(true);
	});
});
