import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({
	spawn: vi.fn(),
	spawnSync: vi.fn()
}));
vi.mock('node:fs', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:fs')>();
	return { ...actual, existsSync: vi.fn(), mkdirSync: vi.fn(), readFileSync: vi.fn(), writeFileSync: vi.fn() };
});

import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';

import { buildBrowserUrl, buildObsidianUri, openObsidian, registerVaultWithObsidian } from './obsidian-open.js';

describe('buildBrowserUrl', () => {
	afterEach(() => {
		vi.mocked(fs.existsSync).mockReset();
	});

	it('returns the noVNC URL when running inside a container', () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		const url = buildBrowserUrl('/home/user/.valora/memory');
		expect(url).toBe('http://localhost:6080/vnc.html?resize=remote&autoconnect=1');
	});

	it('produces a file:// URL when not in a container', () => {
		vi.mocked(fs.existsSync).mockReturnValue(false);
		const url = buildBrowserUrl('/home/user/.valora/memory');
		expect(url).toMatch(/^file:\/\//);
	});

	it('includes the resolved vault path in the file:// URL when not in a container', () => {
		vi.mocked(fs.existsSync).mockReturnValue(false);
		const url = buildBrowserUrl('/home/user/.valora/memory');
		expect(url).toContain('home');
		expect(url).toContain('valora');
		expect(url).toContain('memory');
	});
});

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
		vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
			const s = String(p);
			if (s === '/.dockerenv') return false;
			if (s.endsWith('obsidian.json')) return false;
			return exists;
		});
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
		vi.spyOn(console, 'log').mockImplementation(() => {});
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
		vi.spyOn(console, 'log').mockImplementation(() => {});
		openObsidian('/tmp/vault');
		expect(spawnSync).toHaveBeenCalledWith('cmd', expect.arrayContaining(['/c', 'start']), expect.anything());
	});

	it('runs obsidian directly on Linux when found on PATH, passing AppImage and sandbox flags', () => {
		setPlatform('linux');
		mockVaultExists();
		mockSpawnSyncSuccess(); // which obsidian → found
		const child = mockSpawnDetached();
		vi.spyOn(console, 'log').mockImplementation(() => {});
		openObsidian('/tmp/vault');
		expect(spawnSync).toHaveBeenCalledWith('which', ['obsidian'], expect.anything());
		expect(spawn).toHaveBeenCalledWith(
			'obsidian',
			['--appimage-extract-and-run', '--no-sandbox', '--disable-gpu'],
			expect.objectContaining({ detached: true })
		);
		expect(child.unref).toHaveBeenCalledTimes(1);
	});

	it('pre-registers the vault in Obsidian config before launching on Linux', () => {
		setPlatform('linux');
		mockVaultExists();
		mockSpawnSyncSuccess();
		mockSpawnDetached();
		vi.spyOn(console, 'log').mockImplementation(() => {});
		openObsidian('/tmp/vault');
		expect(fs.writeFileSync).toHaveBeenCalledWith(expect.stringMatching(/obsidian\.json$/), expect.any(String));
		const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0]![1] as string) as {
			vaults: Record<string, { open?: boolean; path: string }>;
		};
		const vaultEntry = Object.values(written.vaults).find((v) => v.path === '/tmp/vault');
		expect(vaultEntry).toBeDefined();
		expect(vaultEntry?.open).toBe(true);
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
		vi.spyOn(console, 'log').mockImplementation(() => {});
		const result = openObsidian('/tmp/vault');
		expect(result.success).toBe(true);
	});

	it('returns success: true on Linux when obsidian launches', () => {
		setPlatform('linux');
		mockVaultExists();
		mockSpawnSyncSuccess(); // which obsidian → found
		mockSpawnDetached();
		vi.spyOn(console, 'log').mockImplementation(() => {});
		const result = openObsidian('/tmp/vault');
		expect(result.success).toBe(true);
	});

	it('prints the obsidian:// URI on successful launch on macOS', () => {
		setPlatform('darwin');
		mockVaultExists();
		mockSpawnSyncSuccess();
		const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		openObsidian('/tmp/vault');
		const allOutput = logSpy.mock.calls.flat().join('\n');
		expect(allOutput).toContain('obsidian://');
	});

	it('prints the file:// browser URL on successful launch on macOS', () => {
		setPlatform('darwin');
		mockVaultExists();
		mockSpawnSyncSuccess();
		const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		openObsidian('/tmp/vault');
		const allOutput = logSpy.mock.calls.flat().join('\n');
		expect(allOutput).toContain('file://');
	});

	it('prints both URLs on successful launch on Linux', () => {
		setPlatform('linux');
		mockVaultExists();
		mockSpawnSyncSuccess(); // which obsidian → found
		mockSpawnDetached();
		const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		openObsidian('/tmp/vault');
		const allOutput = logSpy.mock.calls.flat().join('\n');
		expect(allOutput).toContain('obsidian://');
		expect(allOutput).toContain('file://');
	});

	it('prints the noVNC URL when launching inside a container', () => {
		setPlatform('darwin');
		vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
			if (String(p) === '/.dockerenv') return true;
			return true; // vault also exists
		});
		mockSpawnSyncSuccess();
		const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		openObsidian('/tmp/vault');
		const allOutput = logSpy.mock.calls.flat().join('\n');
		expect(allOutput).toContain('http://localhost:6080');
		expect(allOutput).toContain('obsidian://');
		expect(allOutput).toContain('standalone browser');
	});
});

describe('registerVaultWithObsidian', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	function mockNoExistingConfig(): void {
		vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) =>
			String(p).endsWith('obsidian.json') ? false : true
		);
	}

	function mockExistingConfig(config: object): void {
		vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) =>
			String(p).endsWith('obsidian.json') ? true : true
		);
		vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(config));
	}

	function writtenConfig(): { vaults: Record<string, { open?: boolean; path: string }> } {
		return JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0]![1] as string) as ReturnType<typeof writtenConfig>;
	}

	it('creates a new config with the vault when no config exists', () => {
		mockNoExistingConfig();
		registerVaultWithObsidian('/tmp/vault');
		const config = writtenConfig();
		const entry = Object.values(config.vaults).find((v) => v.path === '/tmp/vault');
		expect(entry).toBeDefined();
		expect(entry?.open).toBe(true);
	});

	it('adds the vault to an existing config that does not yet contain it', () => {
		mockExistingConfig({
			vaults: { abc: { open: true, path: '/other/vault', ts: 1000 } }
		});
		registerVaultWithObsidian('/tmp/vault');
		const config = writtenConfig();
		const entries = Object.values(config.vaults);
		expect(entries.some((v) => v.path === '/tmp/vault')).toBe(true);
		expect(entries.some((v) => v.path === '/other/vault')).toBe(true);
	});

	it('marks only the target vault as open, clearing open on others', () => {
		mockExistingConfig({
			vaults: {
				aaa: { open: true, path: '/other/vault', ts: 1000 },
				bbb: { path: '/tmp/vault', ts: 2000 }
			}
		});
		registerVaultWithObsidian('/tmp/vault');
		const config = writtenConfig();
		const target = Object.values(config.vaults).find((v) => v.path === '/tmp/vault');
		const other = Object.values(config.vaults).find((v) => v.path === '/other/vault');
		expect(target?.open).toBe(true);
		expect(other?.open).toBe(false);
	});

	it('does not add a duplicate entry when the vault is already registered', () => {
		mockExistingConfig({
			vaults: { abc: { path: '/tmp/vault', ts: 1000 } }
		});
		registerVaultWithObsidian('/tmp/vault');
		const config = writtenConfig();
		const matches = Object.values(config.vaults).filter((v) => v.path === '/tmp/vault');
		expect(matches).toHaveLength(1);
	});

	it('writes the config to the Obsidian config directory', () => {
		mockNoExistingConfig();
		registerVaultWithObsidian('/tmp/vault');
		const [writtenPath] = vi.mocked(fs.writeFileSync).mock.calls[0]!;
		expect(String(writtenPath)).toContain('obsidian');
		expect(String(writtenPath)).toMatch(/obsidian\.json$/);
	});
});
