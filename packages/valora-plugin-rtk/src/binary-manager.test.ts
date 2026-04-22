import { describe, expect, it } from 'vitest';

import { RtkBinaryManagerImpl, RtkInstallError } from './binary-manager.js';

const resolved = (): Promise<void> => Promise.resolve();
const rejected = (msg: string) => (): Promise<never> => Promise.reject(new Error(msg));

describe('RtkBinaryManagerImpl', () => {
	describe('isInstalled()', () => {
		it('returns true when rtk --version exits with code 0', async () => {
			const manager = new RtkBinaryManagerImpl(resolved, resolved);
			expect(await manager.isInstalled()).toBe(true);
		});

		it('returns false when rtk binary is not on PATH', async () => {
			const manager = new RtkBinaryManagerImpl(rejected('spawn rtk ENOENT'), resolved);
			expect(await manager.isInstalled()).toBe(false);
		});
	});

	describe('install()', () => {
		it('runs the install script when rtk is absent', async () => {
			let ran = false;
			const runInstall = (): Promise<void> => {
				ran = true;
				return Promise.resolve();
			};
			const manager = new RtkBinaryManagerImpl(rejected('ENOENT'), runInstall);
			await manager.install();
			expect(ran).toBe(true);
		});

		it('throws RtkInstallError when the install script fails', async () => {
			const manager = new RtkBinaryManagerImpl(rejected('ENOENT'), rejected('curl: not found'));
			await expect(manager.install()).rejects.toThrow(RtkInstallError);
		});

		it('wraps the underlying error message in RtkInstallError', async () => {
			const manager = new RtkBinaryManagerImpl(rejected('ENOENT'), rejected('network timeout'));
			await expect(manager.install()).rejects.toThrow('network timeout');
		});
	});

	describe('ensureInstalled()', () => {
		it('resolves immediately when rtk is already installed', async () => {
			let installCalled = false;
			const runInstall = (): Promise<void> => {
				installCalled = true;
				return Promise.resolve();
			};
			const manager = new RtkBinaryManagerImpl(resolved, runInstall);
			await manager.ensureInstalled();
			expect(installCalled).toBe(false);
		});

		it('installs rtk when not on PATH', async () => {
			let installCalled = false;
			const runInstall = (): Promise<void> => {
				installCalled = true;
				return Promise.resolve();
			};
			const manager = new RtkBinaryManagerImpl(rejected('ENOENT'), runInstall);
			await manager.ensureInstalled();
			expect(installCalled).toBe(true);
		});

		it('propagates RtkInstallError when the install script fails', async () => {
			const manager = new RtkBinaryManagerImpl(rejected('ENOENT'), rejected('curl: not found'));
			await expect(manager.ensureInstalled()).rejects.toThrow(RtkInstallError);
		});
	});
});
