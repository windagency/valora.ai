import { mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('output/logger', () => ({
	getLogger: vi.fn(() => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }))
}));

let globalConfigDir: string;
vi.mock('utils/paths', () => ({
	getGlobalConfigDir: () => globalConfigDir
}));

/**
 * The module under test caches resolutions in a module-level variable with
 * no exported reset — `vi.resetModules()` plus a fresh dynamic import gives
 * each test a clean, isolated cache instead of leaking state across tests.
 */
async function freshModule(): Promise<typeof import('./conflict-resolver-config')> {
	vi.resetModules();
	return import('./conflict-resolver-config');
}

describe('conflict-resolver-config', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), 'valora-conflict-resolver-'));
		globalConfigDir = tmpDir;
	});

	afterEach(() => {
		rmSync(tmpDir, { force: true, recursive: true });
	});

	function resolutionsFilePath(): string {
		return join(tmpDir, 'plugin-conflict-resolutions.json');
	}

	describe('getResolvedConflict', () => {
		it('returns undefined before anything has been loaded or saved', async () => {
			const mod = await freshModule();

			expect(mod.getResolvedConflict('memory')).toBeUndefined();
		});
	});

	describe('preloadConflictResolutions', () => {
		it('loads existing resolutions from disk, making them available via getResolvedConflict', async () => {
			const { mkdir, writeFile } = await import('node:fs/promises');
			await mkdir(tmpDir, { recursive: true });
			await writeFile(resolutionsFilePath(), JSON.stringify({ memory: 'valora-plugin-memory-vault' }), 'utf8');
			const mod = await freshModule();

			await mod.preloadConflictResolutions();

			expect(mod.getResolvedConflict('memory')).toBe('valora-plugin-memory-vault');
		});

		it('resolves gracefully with no resolutions when the file does not exist', async () => {
			const mod = await freshModule();

			await expect(mod.preloadConflictResolutions()).resolves.toBeUndefined();
			expect(mod.getResolvedConflict('memory')).toBeUndefined();
		});

		it('resolves gracefully with no resolutions when the file contains malformed JSON', async () => {
			const { mkdir, writeFile } = await import('node:fs/promises');
			await mkdir(tmpDir, { recursive: true });
			await writeFile(resolutionsFilePath(), '{ not valid json', 'utf8');
			const mod = await freshModule();

			await expect(mod.preloadConflictResolutions()).resolves.toBeUndefined();
			expect(mod.getResolvedConflict('memory')).toBeUndefined();
		});

		it('caches the loaded resolutions — a second preload does not re-read a since-changed file', async () => {
			const { mkdir, writeFile } = await import('node:fs/promises');
			await mkdir(tmpDir, { recursive: true });
			await writeFile(resolutionsFilePath(), JSON.stringify({ memory: 'first-winner' }), 'utf8');
			const mod = await freshModule();
			await mod.preloadConflictResolutions();

			await writeFile(resolutionsFilePath(), JSON.stringify({ memory: 'second-winner' }), 'utf8');
			await mod.preloadConflictResolutions();

			expect(mod.getResolvedConflict('memory')).toBe('first-winner');
		});
	});

	describe('saveResolvedConflict', () => {
		it('persists the resolution to disk as JSON', async () => {
			const mod = await freshModule();

			await mod.saveResolvedConflict('memory', 'valora-plugin-memory-vault');

			const written = JSON.parse(await readFile(resolutionsFilePath(), 'utf8')) as Record<string, string>;
			expect(written).toEqual({ memory: 'valora-plugin-memory-vault' });
		});

		it('makes the new resolution immediately available via getResolvedConflict, without a separate preload', async () => {
			const mod = await freshModule();

			await mod.saveResolvedConflict('memory', 'valora-plugin-memory-vault');

			expect(mod.getResolvedConflict('memory')).toBe('valora-plugin-memory-vault');
		});

		it('merges with previously loaded resolutions rather than overwriting the whole file', async () => {
			const { mkdir, writeFile } = await import('node:fs/promises');
			await mkdir(tmpDir, { recursive: true });
			await writeFile(resolutionsFilePath(), JSON.stringify({ agents: 'valora-plugin-engineering' }), 'utf8');
			const mod = await freshModule();
			await mod.preloadConflictResolutions();

			await mod.saveResolvedConflict('memory', 'valora-plugin-memory-vault');

			const written = JSON.parse(await readFile(resolutionsFilePath(), 'utf8')) as Record<string, string>;
			expect(written).toEqual({ agents: 'valora-plugin-engineering', memory: 'valora-plugin-memory-vault' });
			expect(mod.getResolvedConflict('agents')).toBe('valora-plugin-engineering');
		});

		it('overwrites an existing resolution for the same key', async () => {
			const mod = await freshModule();
			await mod.saveResolvedConflict('memory', 'first-winner');

			await mod.saveResolvedConflict('memory', 'second-winner');

			expect(mod.getResolvedConflict('memory')).toBe('second-winner');
		});

		it('does not throw when the resolutions directory cannot be created', async () => {
			// Point the "directory" at a path that is actually a file, so
			// mkdir(..., { recursive: true }) fails — saveResolvedConflict must
			// swallow the write failure (log-and-continue) rather than throw,
			// since a persistence failure here should never break plugin loading.
			const { mkdir, writeFile } = await import('node:fs/promises');
			const blockingFile = join(tmpDir, 'not-a-directory');
			await mkdir(tmpDir, { recursive: true });
			await writeFile(blockingFile, 'blocking', 'utf8');
			globalConfigDir = blockingFile;
			const mod = await freshModule();

			await expect(mod.saveResolvedConflict('memory', 'valora-plugin-memory-vault')).resolves.toBeUndefined();
			// The in-memory resolution is still recorded even though the disk write failed.
			expect(mod.getResolvedConflict('memory')).toBe('valora-plugin-memory-vault');
		});
	});
});
