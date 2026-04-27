import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({
	spawnSync: vi.fn()
}));

import { spawnSync } from 'node:child_process';

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

	function mockSpawnSuccess() {
		vi.mocked(spawnSync).mockReturnValue({
			output: [],
			pid: 1,
			signal: null,
			status: 0,
			stderr: null,
			stdout: null
		} as ReturnType<typeof spawnSync>);
	}

	function mockSpawnFailure() {
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

	it('uses "open" on macOS', () => {
		setPlatform('darwin');
		mockSpawnSuccess();
		openObsidian('/tmp/vault');
		expect(spawnSync).toHaveBeenCalledWith(
			'open',
			expect.arrayContaining([expect.stringContaining('obsidian://')]),
			expect.anything()
		);
	});

	it('uses "xdg-open" on Linux', () => {
		setPlatform('linux');
		mockSpawnSuccess();
		openObsidian('/tmp/vault');
		expect(spawnSync).toHaveBeenCalledWith(
			'xdg-open',
			expect.arrayContaining([expect.stringContaining('obsidian://')]),
			expect.anything()
		);
	});

	it('uses "cmd /c start" on Windows', () => {
		setPlatform('win32');
		mockSpawnSuccess();
		openObsidian('/tmp/vault');
		expect(spawnSync).toHaveBeenCalledWith('cmd', expect.arrayContaining(['/c', 'start']), expect.anything());
	});

	it('returns success: false and logs a manual URI when spawn fails', () => {
		setPlatform('linux');
		mockSpawnFailure();
		const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		const result = openObsidian('/tmp/vault');
		expect(result.success).toBe(false);
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Open this URI manually'));
	});

	it('returns success: true when spawn succeeds', () => {
		setPlatform('darwin');
		mockSpawnSuccess();
		const result = openObsidian('/tmp/vault');
		expect(result.success).toBe(true);
	});
});
