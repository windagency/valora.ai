/**
 * Tests for ContainerManager
 */

import * as childProcess from 'child_process';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ContainerManager } from './container-manager';

vi.mock('child_process', () => {
	const mockExec = vi.fn();
	return {
		exec: mockExec
	};
});

vi.mock('output/logger', () => ({
	getLogger: () => ({
		debug: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warn: vi.fn()
	})
}));

const mockExec = childProcess.exec as unknown as ReturnType<typeof vi.fn>;

function queueExecResult(stdout: string, stderr = '', error: Error | null = null): void {
	mockExec.mockImplementationOnce((...args: unknown[]) => {
		const callback = args[args.length - 1];
		if (typeof callback === 'function') {
			process.nextTick(() => {
				callback(error, { stderr, stdout });
			});
		}
	});
}

describe('ContainerManager', () => {
	let manager: ContainerManager;

	beforeEach(() => {
		vi.clearAllMocks();
		manager = new ContainerManager();
	});

	describe('removeContainer', () => {
		it('retries and succeeds when docker transiently reports removal already in progress', async () => {
			queueExecResult(
				'',
				'',
				new Error(
					'Command failed: docker rm my-container\nError response from daemon: removal of container my-container is already in progress'
				)
			);
			queueExecResult('');

			await expect(manager.removeContainer('my-container')).resolves.toBeUndefined();
			expect(mockExec).toHaveBeenCalledTimes(2);
		});

		it('does not retry when the container does not exist', async () => {
			queueExecResult(
				'',
				'',
				new Error(
					'Command failed: docker rm missing-container\nError response from daemon: No such container: missing-container'
				)
			);

			await expect(manager.removeContainer('missing-container')).resolves.toBeUndefined();
			expect(mockExec).toHaveBeenCalledTimes(1);
		});

		it('throws after exhausting retries when removal never completes', async () => {
			const inProgressError = new Error(
				'Command failed: docker rm stuck-container\nError response from daemon: removal of container stuck-container is already in progress'
			);
			queueExecResult('', '', inProgressError);
			queueExecResult('', '', inProgressError);
			queueExecResult('', '', inProgressError);

			await expect(manager.removeContainer('stuck-container')).rejects.toThrow(/already in progress/);
			expect(mockExec).toHaveBeenCalledTimes(3);
		});
	});
});
