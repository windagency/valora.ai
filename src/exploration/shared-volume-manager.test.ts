/**
 * Tests for SharedVolumeManager
 *
 * Focused on archive()'s array-form SafeExecutor.execute conversion — the
 * output path is caller-supplied and must never reach a shell string.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

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
