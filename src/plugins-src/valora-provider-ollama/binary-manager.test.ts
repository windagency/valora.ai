import { describe, expect, it } from 'vitest';
import { OllamaBinaryManagerImpl, OllamaNotInstalledError } from './binary-manager.js';

describe('OllamaBinaryManagerImpl', () => {
	describe('isInstalled()', () => {
		it('returns true when ollama --version exits with code 0', async () => {
			const manager = new OllamaBinaryManagerImpl(() =>
				Promise.resolve({ stdout: 'ollama version 0.5.0', stderr: '' })
			);

			const result = await manager.isInstalled();

			expect(result).toBe(true);
		});

		it('returns false when ollama --version throws (binary not found)', async () => {
			const manager = new OllamaBinaryManagerImpl(() => Promise.reject(new Error('spawn ollama ENOENT')));

			const result = await manager.isInstalled();

			expect(result).toBe(false);
		});
	});

	describe('assertInstalled()', () => {
		it('resolves when ollama is installed', async () => {
			const manager = new OllamaBinaryManagerImpl(() =>
				Promise.resolve({ stdout: 'ollama version 0.5.0', stderr: '' })
			);

			await expect(manager.assertInstalled()).resolves.toBeUndefined();
		});

		it('throws OllamaNotInstalledError when ollama is not installed', async () => {
			const manager = new OllamaBinaryManagerImpl(() => Promise.reject(new Error('spawn ollama ENOENT')));

			await expect(manager.assertInstalled()).rejects.toThrow(OllamaNotInstalledError);
		});
	});
});
