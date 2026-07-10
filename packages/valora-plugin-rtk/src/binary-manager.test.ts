import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
	DEFAULT_INSTALL_SHA256,
	DEFAULT_INSTALL_URL,
	RtkBinaryManagerImpl,
	RtkInstallError
} from './binary-manager.js';

const SAMPLE_SCRIPT = '#!/usr/bin/env sh\necho rtk-installed\n';
const SAMPLE_SCRIPT_SHA = '01c55fd79c3056a592445d4cc1deef13cd134d52f61b8a7d3acf0bdfd5eb539d';

const resolved = (): Promise<void> => Promise.resolve();
const rejected = (msg: string) => (): Promise<never> => Promise.reject(new Error(msg));

describe('RtkBinaryManagerImpl', () => {
	describe('default pinning', () => {
		it('pins the install URL to a commit SHA, not a moving ref', () => {
			expect(DEFAULT_INSTALL_URL).not.toContain('refs/heads/');
			expect(DEFAULT_INSTALL_URL).toMatch(/raw\.githubusercontent\.com\/rtk-ai\/rtk\/[0-9a-f]{40}\/install\.sh/);
		});

		it('exports a 64-character hex sha256 to verify the pinned script against', () => {
			expect(DEFAULT_INSTALL_SHA256).toMatch(/^[0-9a-f]{64}$/);
		});
	});

	describe('isInstalled()', () => {
		it('returns true when rtk --version exits with code 0', async () => {
			const manager = new RtkBinaryManagerImpl({ checkRtk: resolved });
			expect(await manager.isInstalled()).toBe(true);
		});

		it('returns false when rtk binary is not on PATH', async () => {
			const manager = new RtkBinaryManagerImpl({ checkRtk: rejected('spawn rtk ENOENT') });
			expect(await manager.isInstalled()).toBe(false);
		});
	});

	describe('install()', () => {
		it('downloads, verifies, and executes the install script when integrity matches', async () => {
			const downloadScript = vi.fn().mockResolvedValue(SAMPLE_SCRIPT);
			const executeScript = vi.fn().mockResolvedValue(undefined);
			const manager = new RtkBinaryManagerImpl({
				checkRtk: rejected('ENOENT'),
				downloadScript,
				executeScript,
				installSha256: SAMPLE_SCRIPT_SHA,
				installUrl: 'https://example.com/install.sh'
			});

			await manager.install();

			expect(downloadScript).toHaveBeenCalledWith('https://example.com/install.sh');
			expect(executeScript).toHaveBeenCalledTimes(1);
		});

		it('refuses to execute when the downloaded script SHA256 does not match the expected hash', async () => {
			const downloadScript = vi.fn().mockResolvedValue('#!/usr/bin/env sh\nrm -rf /\n');
			const executeScript = vi.fn().mockResolvedValue(undefined);
			const manager = new RtkBinaryManagerImpl({
				checkRtk: rejected('ENOENT'),
				downloadScript,
				executeScript,
				installSha256: SAMPLE_SCRIPT_SHA, // expected for SAMPLE_SCRIPT, not the malicious one
				installUrl: 'https://example.com/install.sh'
			});

			await expect(manager.install()).rejects.toThrow(/integrity/i);
			expect(executeScript).not.toHaveBeenCalled();
		});

		it('wraps download failures in RtkInstallError', async () => {
			const manager = new RtkBinaryManagerImpl({
				checkRtk: rejected('ENOENT'),
				downloadScript: () => Promise.reject(new Error('network timeout')),
				executeScript: resolved
			});
			await expect(manager.install()).rejects.toThrow(RtkInstallError);
			await expect(manager.install()).rejects.toThrow(/network timeout/);
		});

		it('wraps executor failures in RtkInstallError', async () => {
			const manager = new RtkBinaryManagerImpl({
				checkRtk: rejected('ENOENT'),
				downloadScript: () => Promise.resolve(SAMPLE_SCRIPT),
				executeScript: rejected('exit 127'),
				installSha256: SAMPLE_SCRIPT_SHA
			});
			await expect(manager.install()).rejects.toThrow(RtkInstallError);
		});

		it('writes the install script into a freshly created, unpredictable temp directory rather than a fixed guessable path', async () => {
			// A pid+timestamp path sits directly in the shared os.tmpdir() with a
			// predictable name — on a multi-tenant filesystem, another local
			// process can pre-plant a symlink at the guessed path before install()
			// runs, causing the (legitimate, hash-verified) script content to
			// overwrite whatever that symlink points to. A freshly created,
			// randomly-named directory (mkdtemp) closes that race.
			let capturedPath = '';
			const executeScript = vi.fn().mockImplementation((scriptPath: string) => {
				capturedPath = scriptPath;
				return Promise.resolve();
			});
			const manager = new RtkBinaryManagerImpl({
				checkRtk: rejected('ENOENT'),
				downloadScript: () => Promise.resolve(SAMPLE_SCRIPT),
				executeScript,
				installSha256: SAMPLE_SCRIPT_SHA,
				installUrl: 'https://example.com/install.sh'
			});

			await manager.install();

			expect(path.dirname(capturedPath)).not.toBe(os.tmpdir());
		});
	});

	describe('ensureInstalled()', () => {
		it('resolves immediately when rtk is already installed without downloading', async () => {
			const downloadScript = vi.fn();
			const manager = new RtkBinaryManagerImpl({
				checkRtk: resolved,
				downloadScript,
				executeScript: vi.fn()
			});
			await manager.ensureInstalled();
			expect(downloadScript).not.toHaveBeenCalled();
		});

		it('installs rtk when not on PATH and integrity matches', async () => {
			const executeScript = vi.fn().mockResolvedValue(undefined);
			const manager = new RtkBinaryManagerImpl({
				checkRtk: rejected('ENOENT'),
				downloadScript: () => Promise.resolve(SAMPLE_SCRIPT),
				executeScript,
				installSha256: SAMPLE_SCRIPT_SHA
			});
			await manager.ensureInstalled();
			expect(executeScript).toHaveBeenCalledTimes(1);
		});

		it('propagates RtkInstallError when the install fails for any reason', async () => {
			const manager = new RtkBinaryManagerImpl({
				checkRtk: rejected('ENOENT'),
				downloadScript: () => Promise.reject(new Error('curl: not found')),
				executeScript: resolved
			});
			await expect(manager.ensureInstalled()).rejects.toThrow(RtkInstallError);
		});
	});

	describe('environment overrides', () => {
		it('honours VALORA_PLUGIN_RTK_INSTALL_URL and VALORA_PLUGIN_RTK_INSTALL_SHA256 if set', async () => {
			const originalUrl = process.env['VALORA_PLUGIN_RTK_INSTALL_URL'];
			const originalSha = process.env['VALORA_PLUGIN_RTK_INSTALL_SHA256'];
			process.env['VALORA_PLUGIN_RTK_INSTALL_URL'] = 'https://override.example.com/install.sh';
			process.env['VALORA_PLUGIN_RTK_INSTALL_SHA256'] = SAMPLE_SCRIPT_SHA;

			try {
				const downloadScript = vi.fn().mockResolvedValue(SAMPLE_SCRIPT);
				const executeScript = vi.fn().mockResolvedValue(undefined);
				const manager = new RtkBinaryManagerImpl({
					checkRtk: rejected('ENOENT'),
					downloadScript,
					executeScript
				});

				await manager.install();

				expect(downloadScript).toHaveBeenCalledWith('https://override.example.com/install.sh');
				expect(executeScript).toHaveBeenCalledTimes(1);
			} finally {
				if (originalUrl === undefined) delete process.env['VALORA_PLUGIN_RTK_INSTALL_URL'];
				else process.env['VALORA_PLUGIN_RTK_INSTALL_URL'] = originalUrl;
				if (originalSha === undefined) delete process.env['VALORA_PLUGIN_RTK_INSTALL_SHA256'];
				else process.env['VALORA_PLUGIN_RTK_INSTALL_SHA256'] = originalSha;
			}
		});

		it('logs a loud warning when either install-script override env var is set', () => {
			const originalUrl = process.env['VALORA_PLUGIN_RTK_INSTALL_URL'];
			process.env['VALORA_PLUGIN_RTK_INSTALL_URL'] = 'https://override.example.com/install.sh';
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

			try {
				new RtkBinaryManagerImpl();

				expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/override|VALORA_PLUGIN_RTK_INSTALL/i));
			} finally {
				warnSpy.mockRestore();
				if (originalUrl === undefined) delete process.env['VALORA_PLUGIN_RTK_INSTALL_URL'];
				else process.env['VALORA_PLUGIN_RTK_INSTALL_URL'] = originalUrl;
			}
		});

		it('does not warn when no override env vars are set', () => {
			const originalUrl = process.env['VALORA_PLUGIN_RTK_INSTALL_URL'];
			const originalSha = process.env['VALORA_PLUGIN_RTK_INSTALL_SHA256'];
			delete process.env['VALORA_PLUGIN_RTK_INSTALL_URL'];
			delete process.env['VALORA_PLUGIN_RTK_INSTALL_SHA256'];
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

			try {
				new RtkBinaryManagerImpl();

				expect(warnSpy).not.toHaveBeenCalled();
			} finally {
				warnSpy.mockRestore();
				if (originalUrl !== undefined) process.env['VALORA_PLUGIN_RTK_INSTALL_URL'] = originalUrl;
				if (originalSha !== undefined) process.env['VALORA_PLUGIN_RTK_INSTALL_SHA256'] = originalSha;
			}
		});
	});
});
