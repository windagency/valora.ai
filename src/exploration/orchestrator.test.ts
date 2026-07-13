import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('output/logger', () => ({
	getLogger: () => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() })
}));

const { mockStateManager } = vi.hoisted(() => ({
	mockStateManager: {
		createExploration: vi.fn(),
		deleteExploration: vi.fn().mockResolvedValue(undefined),
		getExplorationsDir: vi.fn().mockReturnValue('/explorations'),
		getSharedVolumePath: vi.fn().mockReturnValue('/shared'),
		listExplorations: vi.fn().mockResolvedValue([]),
		loadExploration: vi.fn(),
		saveExploration: vi.fn().mockResolvedValue(undefined)
	}
}));
vi.mock('./exploration-state', () => ({ ExplorationStateManager: vi.fn().mockImplementation(() => mockStateManager) }));

const { mockWorktreeManager } = vi.hoisted(() => ({
	mockWorktreeManager: {
		createMultipleWorktrees: vi.fn(),
		deleteBranch: vi.fn().mockResolvedValue(undefined),
		removeWorktree: vi.fn().mockResolvedValue(undefined)
	}
}));
vi.mock('./worktree-manager', () => ({ WorktreeManager: vi.fn().mockImplementation(() => mockWorktreeManager) }));

const { mockResourceAllocator } = vi.hoisted(() => ({
	mockResourceAllocator: { allocate: vi.fn(), release: vi.fn() }
}));
vi.mock('./resource-allocator', () => ({ ResourceAllocator: vi.fn().mockImplementation(() => mockResourceAllocator) }));

const { mockContainerManager } = vi.hoisted(() => ({
	mockContainerManager: {
		pullImageIfNeeded: vi.fn().mockResolvedValue(false),
		removeMultipleContainers: vi.fn().mockResolvedValue(undefined),
		stopMultipleContainers: vi.fn().mockResolvedValue(undefined)
	}
}));
vi.mock('./container-manager', () => ({ ContainerManager: vi.fn().mockImplementation(() => mockContainerManager) }));

const { mockSafetyValidator } = vi.hoisted(() => ({
	mockSafetyValidator: { validate: vi.fn() }
}));
vi.mock('./safety-validator', () => ({ SafetyValidator: vi.fn().mockImplementation(() => mockSafetyValidator) }));

const { mockSharedVolumeManager } = vi.hoisted(() => ({
	mockSharedVolumeManager: { initialize: vi.fn() }
}));
vi.mock('./shared-volume-manager', () => ({
	SharedVolumeManager: vi.fn().mockImplementation(() => mockSharedVolumeManager)
}));

const { mockComparator } = vi.hoisted(() => ({
	mockComparator: {
		exportToJson: vi.fn().mockResolvedValue(undefined),
		exportToMarkdown: vi.fn().mockResolvedValue(undefined),
		generateComparisonReport: vi.fn().mockResolvedValue({})
	}
}));
vi.mock('./result-comparator', () => ({ ResultComparator: vi.fn().mockImplementation(() => mockComparator) }));

const { mockCreateExecutionStrategy } = vi.hoisted(() => ({ mockCreateExecutionStrategy: vi.fn() }));
vi.mock('./execution-modes', () => ({ createExecutionStrategy: mockCreateExecutionStrategy }));

const { mockEmitter } = vi.hoisted(() => ({
	mockEmitter: {
		emitExplorationCompleted: vi.fn(),
		emitExplorationCreated: vi.fn(),
		emitExplorationFailed: vi.fn(),
		emitExplorationStarted: vi.fn(),
		emitExplorationStopped: vi.fn()
	}
}));
vi.mock('./exploration-events', () => ({ getExplorationEvents: () => mockEmitter }));

import type { Exploration, ExplorationConfig } from 'types/exploration.types';

import { ExplorationOrchestrator } from './orchestrator';

function makeConfig(overrides: Partial<ExplorationConfig> = {}): ExplorationConfig {
	return {
		auto_merge: false,
		branches: 2,
		cpu_limit: '1',
		docker_image: 'alpine',
		memory_limit: '1g',
		no_cleanup: false,
		port_range_end: 3100,
		port_range_start: 3000,
		timeout_minutes: 10,
		...overrides
	};
}

function makeExploration(overrides: Partial<Exploration> = {}): Exploration {
	return {
		branches: 2,
		completed_branches: 0,
		config: makeConfig(),
		created_at: 't',
		id: 'exp-1',
		mode: 'parallel',
		status: 'pending',
		task: 'do the thing',
		worktrees: [],
		...overrides
	};
}

describe('ExplorationOrchestrator', () => {
	beforeEach(() => {
		mockSafetyValidator.validate.mockResolvedValue({ errors: [], passed: true, warnings: [] });
		mockStateManager.createExploration.mockResolvedValue(makeExploration());
		mockWorktreeManager.createMultipleWorktrees.mockResolvedValue([
			{ branch: 'exploration/exp-1-1', commit: 'abc', path: '/wt-1', prunable: false },
			{ branch: 'exploration/exp-1-2', commit: 'def', path: '/wt-2', prunable: false }
		]);
		mockResourceAllocator.allocate.mockReturnValue({ cpu_limit: '1', memory_limit: '1g', port: 3000 });
		mockSharedVolumeManager.initialize.mockResolvedValue({ root_path: '/shared' });
		mockCreateExecutionStrategy.mockReturnValue({
			execute: vi.fn().mockResolvedValue({
				completed_branches: 1,
				duration_ms: 100,
				exploration_id: 'exp-1',
				mode: 'parallel',
				results: { decisions_made: 0, insights_collected: 0 },
				success: true,
				total_branches: 2,
				winner_index: 1
			})
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('startExploration', () => {
		it('runs the full happy-path lifecycle and returns a successful result', async () => {
			const orchestrator = new ExplorationOrchestrator();

			const result = await orchestrator.startExploration({ config: makeConfig(), task: 'do the thing' });

			expect(mockSafetyValidator.validate).toHaveBeenCalledWith(2);
			expect(mockContainerManager.pullImageIfNeeded).toHaveBeenCalledWith('alpine');
			expect(mockWorktreeManager.createMultipleWorktrees).toHaveBeenCalled();
			expect(mockResourceAllocator.allocate).toHaveBeenCalledTimes(2);
			expect(mockSharedVolumeManager.initialize).toHaveBeenCalledWith(2);
			expect(mockEmitter.emitExplorationCreated).toHaveBeenCalled();
			expect(mockEmitter.emitExplorationStarted).toHaveBeenCalled();
			expect(mockEmitter.emitExplorationCompleted).toHaveBeenCalled();
			expect(result.success).toBe(true);
			expect(result.exploration_id).toBe('exp-1');
			expect(result.comparison_report_path).toBe('/explorations/exp-1/comparison-report.md');
		});

		it('assigns allocated resources to each created worktree', async () => {
			const orchestrator = new ExplorationOrchestrator();

			await orchestrator.startExploration({ config: makeConfig(), task: 'do the thing' });

			const savedExploration = mockStateManager.saveExploration.mock.calls
				.map(([e]: [Exploration]) => e)
				.find((e: Exploration) => e.worktrees.length === 2);
			expect(savedExploration?.worktrees.every((w: { allocated_resources?: unknown }) => w.allocated_resources)).toBe(
				true
			);
		});

		it('throws before creating any exploration state when safety validation fails', async () => {
			mockSafetyValidator.validate.mockResolvedValue({
				errors: ['dirty working tree'],
				passed: false,
				warnings: []
			});
			const orchestrator = new ExplorationOrchestrator();

			await expect(orchestrator.startExploration({ config: makeConfig(), task: 'x' })).rejects.toThrow(
				/Safety validation failed/
			);
			expect(mockStateManager.createExploration).not.toHaveBeenCalled();
		});

		it('marks the exploration failed, emits a failure event, and attempts cleanup when execution throws', async () => {
			mockCreateExecutionStrategy.mockReturnValue({
				execute: vi.fn().mockRejectedValue(new Error('docker daemon unreachable'))
			});
			const orchestrator = new ExplorationOrchestrator();

			await expect(orchestrator.startExploration({ config: makeConfig(), task: 'x' })).rejects.toThrow(
				'docker daemon unreachable'
			);

			expect(mockEmitter.emitExplorationFailed).toHaveBeenCalled();
			const failedExploration = mockEmitter.emitExplorationFailed.mock.calls[0]?.[0] as Exploration;
			expect(failedExploration.status).toBe('failed');
			// cleanup() is attempted on failure
			expect(mockWorktreeManager.removeWorktree).toHaveBeenCalled();
		});

		it('sets the session id on the exploration and persists it when provided', async () => {
			const orchestrator = new ExplorationOrchestrator();

			await orchestrator.startExploration({ config: makeConfig(), sessionId: 'sess-1', task: 'x' });

			const savedWithSession = mockStateManager.saveExploration.mock.calls
				.map(([e]: [Exploration]) => e)
				.find((e: Exploration) => e.session_id === 'sess-1');
			expect(savedWithSession).toBeDefined();
		});
	});

	describe('stopExploration', () => {
		it('stops containers, marks the exploration stopped, and emits the stopped event', async () => {
			mockStateManager.loadExploration.mockResolvedValue(makeExploration({ status: 'running' }));
			const orchestrator = new ExplorationOrchestrator();

			await orchestrator.stopExploration('exp-1');

			expect(mockEmitter.emitExplorationStopped).toHaveBeenCalled();
			const stopped = mockEmitter.emitExplorationStopped.mock.calls[0]?.[0] as Exploration;
			expect(stopped.status).toBe('stopped');
		});

		it('throws when the exploration is not currently running', async () => {
			mockStateManager.loadExploration.mockResolvedValue(makeExploration({ status: 'completed' }));
			const orchestrator = new ExplorationOrchestrator();

			await expect(orchestrator.stopExploration('exp-1')).rejects.toThrow(/Cannot stop exploration/);
		});
	});

	describe('resumeExploration', () => {
		it('re-executes a stopped exploration and returns the new result', async () => {
			mockStateManager.loadExploration.mockResolvedValue(makeExploration({ status: 'stopped' }));
			const orchestrator = new ExplorationOrchestrator();

			const result = await orchestrator.resumeExploration('exp-1');

			expect(result.success).toBe(true);
		});

		it('throws when the exploration is already completed', async () => {
			mockStateManager.loadExploration.mockResolvedValue(makeExploration({ status: 'completed' }));
			const orchestrator = new ExplorationOrchestrator();

			await expect(orchestrator.resumeExploration('exp-1')).rejects.toThrow(/Cannot resume completed exploration/);
		});

		it('throws when the exploration is already running', async () => {
			mockStateManager.loadExploration.mockResolvedValue(makeExploration({ status: 'running' }));
			const orchestrator = new ExplorationOrchestrator();

			await expect(orchestrator.resumeExploration('exp-1')).rejects.toThrow(/already running/);
		});
	});

	describe('getExplorationStatus / listExplorations', () => {
		it('getExplorationStatus loads the exploration by id', async () => {
			mockStateManager.loadExploration.mockResolvedValue(makeExploration());
			const orchestrator = new ExplorationOrchestrator();

			const exploration = await orchestrator.getExplorationStatus('exp-1');

			expect(exploration.id).toBe('exp-1');
		});

		it('listExplorations filters to active-only when requested', async () => {
			mockStateManager.listExplorations.mockResolvedValue([
				{ id: 'a', status: 'running' },
				{ id: 'b', status: 'completed' },
				{ id: 'c', status: 'pending' }
			]);
			const orchestrator = new ExplorationOrchestrator();

			const result = await orchestrator.listExplorations({ activeOnly: true });

			expect(result.map((e) => e.id)).toEqual(['a', 'c']);
		});

		it('listExplorations filters by an explicit status', async () => {
			mockStateManager.listExplorations.mockResolvedValue([
				{ id: 'a', status: 'running' },
				{ id: 'b', status: 'failed' }
			]);
			const orchestrator = new ExplorationOrchestrator();

			const result = await orchestrator.listExplorations({ status: 'failed' });

			expect(result.map((e) => e.id)).toEqual(['b']);
		});
	});

	describe('cleanup', () => {
		it('releases resources, removes worktrees, and deletes exploration state', async () => {
			const exploration = makeExploration({
				worktrees: [
					{
						allocated_resources: { cpu_limit: '1', memory_limit: '1g', port: 3000 },
						branch_name: 'exploration/exp-1-1',
						index: 1,
						progress: {
							current_stage: '',
							errors: [],
							insights_published: 0,
							last_update: 't',
							percentage: 0,
							stages_completed: []
						},
						status: 'completed',
						worktree_path: '/wt-1'
					}
				]
			});
			const orchestrator = new ExplorationOrchestrator();

			await orchestrator.cleanup(exploration);

			expect(mockResourceAllocator.release).toHaveBeenCalledWith('exp-1', 1);
			expect(mockWorktreeManager.removeWorktree).toHaveBeenCalledWith('/wt-1', false);
			expect(mockWorktreeManager.deleteBranch).toHaveBeenCalledWith('exploration/exp-1-1', false);
			expect(mockStateManager.deleteExploration).toHaveBeenCalledWith('exp-1');
		});

		it('does not delete exploration state when no_cleanup is set and force is not passed', async () => {
			const exploration = makeExploration({ config: makeConfig({ no_cleanup: true }), worktrees: [] });
			const orchestrator = new ExplorationOrchestrator();

			await orchestrator.cleanup(exploration);

			expect(mockStateManager.deleteExploration).not.toHaveBeenCalled();
		});

		it('deletes exploration state even with no_cleanup set, when force is true', async () => {
			const exploration = makeExploration({ config: makeConfig({ no_cleanup: true }), worktrees: [] });
			const orchestrator = new ExplorationOrchestrator();

			await orchestrator.cleanup(exploration, true);

			expect(mockStateManager.deleteExploration).toHaveBeenCalledWith('exp-1');
		});
	});
});
