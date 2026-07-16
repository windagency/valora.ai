/**
 * Tests for SharedVolumeManager
 *
 * Focused on archive()'s array-form SafeExecutor.execute conversion — the
 * output path is caller-supplied and must never reach a shell string.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockExecute = vi.fn();
vi.mock('utils/safe-exec', () => ({
	SafeExecutor: {
		execute: (...args: unknown[]) => mockExecute(...args)
	}
}));

vi.mock('output/logger', () => ({
	getLogger: () => ({
		debug: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warn: vi.fn()
	})
}));

const { SharedVolumeManager } = await import('./shared-volume-manager');

describe('SharedVolumeManager.archive', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('passes the output path as a literal array element to tar, with no shell involved', async () => {
		mockExecute.mockResolvedValue({ exitCode: 0, stderr: '', stdout: '' });
		const manager = new SharedVolumeManager('/repo/.valora/shared/exp-1', 'exp-1');
		const maliciousOutputPath = '/tmp/out.tar.gz"; touch /tmp/poc; echo "';

		await manager.archive(maliciousOutputPath);

		expect(mockExecute).toHaveBeenCalledWith('tar', [
			'-czf',
			maliciousOutputPath,
			'-C',
			'/repo/.valora/shared',
			'exp-1'
		]);
	});

	it('wraps a tar failure in a descriptive error', async () => {
		mockExecute.mockRejectedValue(new Error('Command failed with exit code 1: tar: cannot open'));
		const manager = new SharedVolumeManager('/repo/.valora/shared/exp-1', 'exp-1');

		await expect(manager.archive('/tmp/out.tar.gz')).rejects.toThrow(/Failed to archive shared volume/);
	});
});

describe('SharedVolumeManager — real filesystem behaviour', () => {
	let tmpDir: string;
	let sharedVolumePath: string;
	let manager: InstanceType<typeof SharedVolumeManager>;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), 'valora-shared-volume-'));
		sharedVolumePath = join(tmpDir, 'shared');
		manager = new SharedVolumeManager(sharedVolumePath, 'exp-1');
	});

	afterEach(() => {
		rmSync(tmpDir, { force: true, recursive: true });
	});

	describe('initialize', () => {
		it('creates the root, locks dir, pool files, per-worktree dirs, and README', async () => {
			const structure = await manager.initialize(2);

			expect(existsSync(structure.locks_dir)).toBe(true);
			expect(existsSync(structure.insights_pool_path)).toBe(true);
			expect(existsSync(structure.decisions_pool_path)).toBe(true);
			expect(structure.worktree_data_dirs).toHaveLength(2);
			for (const dir of structure.worktree_data_dirs) {
				expect(existsSync(join(dir, 'latest-insight.json'))).toBe(true);
				expect(existsSync(join(dir, 'metrics.json'))).toBe(true);
				expect(existsSync(join(dir, 'progress.json'))).toBe(true);
			}
			expect(existsSync(join(sharedVolumePath, 'README.md'))).toBe(true);
			const insightsPool = JSON.parse(readFileSync(structure.insights_pool_path, 'utf-8'));
			expect(insightsPool).toMatchObject({ exploration_id: 'exp-1', insights: [], total_count: 0 });
		});
	});

	describe('getPaths', () => {
		it('derives pool/lock/worktree paths from the shared volume root', () => {
			const paths = manager.getPaths();

			expect(paths.root).toBe(sharedVolumePath);
			expect(paths.insights_pool).toBe(join(sharedVolumePath, 'insights-pool.json'));
			expect(paths.decisions_pool).toBe(join(sharedVolumePath, 'decisions-pool.json'));
			expect(paths.locks_dir).toBe(join(sharedVolumePath, 'locks'));
			expect(paths.worktreeData(2)).toBe(join(sharedVolumePath, 'worktree-2'));
		});
	});

	describe('validate', () => {
		it('reports valid: true and no missing files after a real initialize()', async () => {
			await manager.initialize(1);

			const result = await manager.validate();

			expect(result).toEqual({ errors: [], missing_files: [], valid: true });
		});

		it('reports every missing file before initialize() has run', async () => {
			const result = await manager.validate();

			expect(result.valid).toBe(false);
			expect(result.missing_files).toEqual(
				expect.arrayContaining([
					sharedVolumePath,
					join(sharedVolumePath, 'insights-pool.json'),
					join(sharedVolumePath, 'decisions-pool.json'),
					join(sharedVolumePath, 'locks')
				])
			);
		});
	});

	describe('getSize / getFormattedSize', () => {
		it('returns 0 / "0 B" for a shared volume that does not exist yet', async () => {
			expect(await manager.getSize()).toBe(0);
			expect(await manager.getFormattedSize()).toBe('0 B');
		});

		it('reports a positive size after initialize() has written real files', async () => {
			await manager.initialize(1);

			const size = await manager.getSize();

			expect(size).toBeGreaterThan(0);
			expect(await manager.getFormattedSize()).toMatch(/^[\d.]+ (B|KB)$/);
		});
	});

	describe('cleanup', () => {
		it('removes the entire shared volume directory tree', async () => {
			await manager.initialize(1);
			expect(existsSync(sharedVolumePath)).toBe(true);

			await manager.cleanup();

			expect(existsSync(sharedVolumePath)).toBe(false);
		});

		it('does not throw when the directory never existed', async () => {
			await expect(manager.cleanup()).resolves.toBeUndefined();
		});
	});
});
