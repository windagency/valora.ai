import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('output/logger', () => ({
	getLogger: () => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() })
}));

import type { ContainerConfig, ContainerManager } from './container-manager';
import type { ExplorationStateManager } from './exploration-state';
import type { ResourceAllocator } from './resource-allocator';
import type { SharedVolumeManager } from './shared-volume-manager';
import type { WorktreeManager } from './worktree-manager';

import type { ContainerStats, Exploration, WorktreeExploration } from 'types/exploration.types';

import {
	createExecutionStrategy,
	type ExecutionContext,
	ParallelExecutionStrategy,
	SequentialExecutionStrategy
} from './execution-modes';

function makeWorktree(overrides: Partial<WorktreeExploration> = {}): WorktreeExploration {
	return {
		branch_name: 'exploration/exp-1-1',
		index: 1,
		progress: {
			current_stage: 'plan',
			errors: [],
			insights_published: 0,
			last_update: 't',
			percentage: 0,
			stages_completed: []
		},
		status: 'pending',
		worktree_path: '/wt-1',
		...overrides
	};
}

function makeExploration(overrides: Partial<Exploration> = {}): Exploration {
	return {
		branches: 1,
		completed_branches: 0,
		config: {
			auto_merge: false,
			branches: 1,
			cpu_limit: '1',
			docker_image: 'alpine',
			memory_limit: '1g',
			no_cleanup: false,
			port_range_end: 3100,
			port_range_start: 3000,
			timeout_minutes: 10
		},
		created_at: 't',
		id: 'exp-1',
		mode: 'parallel',
		status: 'pending',
		task: 'do the thing',
		worktrees: [makeWorktree()],
		...overrides
	};
}

function exitedStats(overrides: Partial<ContainerStats> = {}): ContainerStats {
	return {
		container_id: 'c1',
		cpu_usage_percent: 1,
		memory_limit_mb: 100,
		memory_usage_mb: 10,
		status: 'exited',
		uptime_seconds: 1,
		worktree_index: 1,
		...overrides
	} as ContainerStats;
}

function makeContext(overrides: Partial<ExecutionContext> = {}): {
	containerManager: { [K in keyof ContainerManager]?: ReturnType<typeof vi.fn> };
	context: ExecutionContext;
	stateManager: { [K in keyof ExplorationStateManager]?: ReturnType<typeof vi.fn> };
} {
	const containerManager = {
		createContainer: vi.fn().mockResolvedValue('container-1'),
		createMultipleContainers: vi.fn().mockResolvedValue(['container-1']),
		getMultipleContainerStats: vi.fn().mockResolvedValue([exitedStats({ status: 'exited' })]),
		stopContainer: vi.fn().mockResolvedValue(undefined),
		stopMultipleContainers: vi.fn().mockResolvedValue(undefined)
	};
	const stateManager = {
		getDecisionsForExploration: vi.fn().mockResolvedValue([]),
		getInsightsForExploration: vi.fn().mockResolvedValue([]),
		getSharedVolumePath: vi.fn().mockReturnValue('/shared'),
		loadExploration: vi.fn(),
		saveExploration: vi.fn().mockResolvedValue(undefined)
	};

	const context: ExecutionContext = {
		containerManager: containerManager as unknown as ContainerManager,
		exploration: makeExploration(),
		resourceAllocator: {} as ResourceAllocator,
		sharedVolumeManager: {} as SharedVolumeManager,
		stateManager: stateManager as unknown as ExplorationStateManager,
		worktreeManager: {} as WorktreeManager,
		...overrides
	};

	return { containerManager, context, stateManager };
}

describe('createExecutionStrategy', () => {
	it('creates a ParallelExecutionStrategy for mode "parallel"', () => {
		const { context } = makeContext();
		expect(createExecutionStrategy('parallel', context)).toBeInstanceOf(ParallelExecutionStrategy);
	});

	it('creates a SequentialExecutionStrategy for mode "sequential"', () => {
		const { context } = makeContext();
		expect(createExecutionStrategy('sequential', context)).toBeInstanceOf(SequentialExecutionStrategy);
	});

	it('throws for an unrecognised mode', () => {
		const { context } = makeContext();
		expect(() => createExecutionStrategy('bogus' as never, context)).toThrow(/Unknown execution mode/);
	});
});

describe('ParallelExecutionStrategy', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('starts all containers, waits for them to exit, and reports success when at least one worktree completes', async () => {
		const worktree = makeWorktree({ status: 'pending' });
		const exploration = makeExploration({ branches: 1, worktrees: [worktree] });
		const { containerManager, context, stateManager } = makeContext({ exploration });
		containerManager.getMultipleContainerStats!.mockResolvedValue([exitedStats({ exit_code: 0 })]);

		const strategy = new ParallelExecutionStrategy(context);
		const resultPromise = strategy.execute();
		await vi.runAllTimersAsync();
		const result = await resultPromise;

		expect(containerManager.createMultipleContainers).toHaveBeenCalledWith([
			expect.objectContaining({ image: 'alpine' })
		]);
		expect(containerManager.stopMultipleContainers).toHaveBeenCalledWith(['exploration-exp-1-worktree-1'], 30);
		expect(result.mode).toBe('parallel');
		expect(result.success).toBe(true);
		expect(result.completed_branches).toBe(1);
		expect(stateManager.saveExploration).toHaveBeenCalled();
	});

	it('reports failure when a container exits with a non-zero exit code (no worktree completes)', async () => {
		const worktree = makeWorktree({ status: 'pending' });
		const exploration = makeExploration({ branches: 1, worktrees: [worktree] });
		const { containerManager, context } = makeContext({ exploration });
		containerManager.getMultipleContainerStats!.mockResolvedValue([exitedStats({ exit_code: 1 })]);

		const strategy = new ParallelExecutionStrategy(context);
		const resultPromise = strategy.execute();
		await vi.runAllTimersAsync();
		const result = await resultPromise;

		expect(result.success).toBe(false);
		expect(result.completed_branches).toBe(0);
		expect(worktree.status).toBe('failed');
	});

	it('marks the exploration as failed when a container operation throws', async () => {
		const { context, containerManager } = makeContext();
		containerManager.createMultipleContainers!.mockRejectedValue(new Error('docker daemon unreachable'));

		const strategy = new ParallelExecutionStrategy(context);

		await expect(strategy.execute()).rejects.toThrow('docker daemon unreachable');
		expect(context.exploration.status).toBe('failed');
	});

	it('marks still-running worktrees as timed_out when the monitoring loop exceeds the configured timeout', async () => {
		const worktree = makeWorktree({ status: 'pending' });
		const exploration = makeExploration({
			config: {
				auto_merge: false,
				branches: 1,
				cpu_limit: '1',
				docker_image: 'alpine',
				memory_limit: '1g',
				no_cleanup: false,
				port_range_end: 3100,
				port_range_start: 3000,
				timeout_minutes: 0.0001 // effectively immediate timeout
			},
			worktrees: [worktree]
		});
		const { context, containerManager } = makeContext({ exploration });
		// Never reports "exited" — forces the monitor loop to run until timeout.
		containerManager.getMultipleContainerStats!.mockResolvedValue([exitedStats({ status: 'running' })]);

		const strategy = new ParallelExecutionStrategy(context);
		const resultPromise = strategy.execute();
		await vi.runAllTimersAsync();
		await resultPromise;

		expect(worktree.status).toBe('timed_out');
	});
});

describe('SequentialExecutionStrategy', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('stops trying once a worktree completes, and reports its index as the winner', async () => {
		const worktreeA = makeWorktree({ index: 1, status: 'pending' });
		const worktreeB = makeWorktree({ index: 2, status: 'pending' });
		const exploration = makeExploration({ branches: 2, worktrees: [worktreeA, worktreeB] });
		const { context, containerManager, stateManager } = makeContext({ exploration });
		containerManager.getMultipleContainerStats!.mockResolvedValue([exitedStats({ status: 'exited' })]);
		stateManager.loadExploration!.mockResolvedValue(
			makeExploration({ worktrees: [makeWorktree({ index: 1, status: 'completed' })] })
		);

		const strategy = new SequentialExecutionStrategy(context);
		const resultPromise = strategy.execute();
		await vi.runAllTimersAsync();
		const result = await resultPromise;

		expect(result.success).toBe(true);
		expect(result.winner_index).toBe(1);
		expect(result.completed_branches).toBe(1);
		// Only the first worktree should have had a container created — the
		// second is never attempted once the first succeeds.
		expect(containerManager.createContainer).toHaveBeenCalledTimes(1);
	});

	it('tries every worktree and reports failure when none complete', async () => {
		const worktreeA = makeWorktree({ index: 1, status: 'pending' });
		const worktreeB = makeWorktree({ index: 2, status: 'pending' });
		const exploration = makeExploration({ branches: 2, worktrees: [worktreeA, worktreeB] });
		const { context, containerManager, stateManager } = makeContext({ exploration });
		containerManager.getMultipleContainerStats!.mockResolvedValue([exitedStats({ status: 'exited' })]);
		stateManager.loadExploration!.mockResolvedValue(
			makeExploration({ worktrees: [makeWorktree({ index: 1, status: 'failed' })] })
		);

		const strategy = new SequentialExecutionStrategy(context);
		const resultPromise = strategy.execute();
		await vi.runAllTimersAsync();
		const result = await resultPromise;

		expect(result.success).toBe(false);
		expect(result.winner_index).toBeUndefined();
		expect(containerManager.createContainer).toHaveBeenCalledTimes(2);
	});

	it('marks the exploration as failed when a container operation throws', async () => {
		const { context, containerManager } = makeContext();
		containerManager.createContainer!.mockRejectedValue(new Error('docker daemon unreachable'));

		const strategy = new SequentialExecutionStrategy(context);

		await expect(strategy.execute()).rejects.toThrow('docker daemon unreachable');
		expect(context.exploration.status).toBe('failed');
	});
});
