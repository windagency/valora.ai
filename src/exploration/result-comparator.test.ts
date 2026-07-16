/**
 * Tests for ResultComparator
 *
 * Focused on the array-form SafeExecutor.execute conversion for the git diff
 * used to compute code metrics — a worktree path/branch name reaching a shell
 * string is the same injection class fixed in merge-orchestrator.ts.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Exploration, WorktreeExploration } from 'types/exploration.types';

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

const { ResultComparator } = await import('./result-comparator');

function buildWorktree(overrides: Partial<WorktreeExploration> = {}): WorktreeExploration {
	return {
		branch_name: 'exploration/task-1-abc123',
		index: 1,
		progress: {
			current_stage: 'done',
			errors: [],
			insights_published: 0,
			last_update: new Date(0).toISOString(),
			percentage: 100,
			stages_completed: ['planning', 'coding']
		},
		status: 'completed',
		worktree_path: '/repo/.valora/worktrees/exp-1',
		...overrides
	};
}

function buildExploration(worktree: WorktreeExploration): Exploration {
	return {
		branches: 1,
		completed_branches: 1,
		config: {} as Exploration['config'],
		created_at: new Date(0).toISOString(),
		id: 'exp-1',
		mode: 'worktree',
		status: 'completed',
		task: 'do the thing',
		worktrees: [worktree]
	};
}

function fakeStateManager(): { getSharedVolumePath: (id: string) => string } {
	return { getSharedVolumePath: () => '/tmp/valora-result-comparator-test-does-not-exist' };
}

describe('ResultComparator', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('passes the worktree path and branch name as literal array elements to git, with no shell involved', async () => {
		const worktree = buildWorktree({
			branch_name: 'exploration/task"; touch /tmp/poc; echo "-1',
			worktree_path: '/repo/.valora/worktrees/exp"; touch /tmp/poc; echo "-1'
		});
		const exploration = buildExploration(worktree);
		mockExecute.mockResolvedValue({ exitCode: 0, stderr: '', stdout: '1 file changed, 2 insertions(+)\n' });

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const comparator = new ResultComparator(exploration, fakeStateManager() as any);
		const report = await comparator.generateComparisonReport();

		expect(mockExecute).toHaveBeenCalledWith('git', [
			'-C',
			worktree.worktree_path,
			'diff',
			'--shortstat',
			`${worktree.branch_name}~1`,
			worktree.branch_name
		]);
		expect(report.metrics[0]?.files_changed).toBe(1);
	});

	it('reports no code metrics when git fails, without throwing', async () => {
		const worktree = buildWorktree();
		const exploration = buildExploration(worktree);
		mockExecute.mockRejectedValue(new Error('Command failed with exit code 128: not a git repository'));

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const comparator = new ResultComparator(exploration, fakeStateManager() as any);
		const report = await comparator.generateComparisonReport();

		expect(report.metrics[0]?.files_changed).toBeUndefined();
	});

	describe('scoring and ranking', () => {
		beforeEach(() => {
			mockExecute.mockRejectedValue(new Error('not a git repository'));
		});

		it('scores a completed worktree with full progress higher than a failed one with no progress', async () => {
			const completed = buildWorktree({
				index: 1,
				progress: {
					current_stage: 'done',
					errors: [],
					insights_published: 0,
					last_update: '',
					percentage: 100,
					stages_completed: []
				},
				status: 'completed'
			});
			const failed = buildWorktree({
				index: 2,
				progress: {
					current_stage: '',
					errors: [],
					insights_published: 0,
					last_update: '',
					percentage: 0,
					stages_completed: []
				},
				status: 'failed'
			});
			const exploration = buildExploration(completed);
			exploration.worktrees.push(failed);
			exploration.branches = 2;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const comparator = new ResultComparator(exploration, fakeStateManager() as any);

			const report = await comparator.generateComparisonReport();

			const completedMetric = report.metrics.find((m) => m.worktree_index === 1);
			const failedMetric = report.metrics.find((m) => m.worktree_index === 2);
			expect(completedMetric?.overall_score).toBe(60); // 40 (completed) + 20 (100% progress)
			expect(failedMetric?.overall_score).toBe(0);
		});

		it('ranks worktrees by overall score, descending', async () => {
			const low = buildWorktree({
				index: 1,
				progress: {
					current_stage: '',
					errors: [],
					insights_published: 0,
					last_update: '',
					percentage: 0,
					stages_completed: []
				},
				status: 'running'
			});
			const high = buildWorktree({
				index: 2,
				progress: {
					current_stage: '',
					errors: [],
					insights_published: 0,
					last_update: '',
					percentage: 100,
					stages_completed: []
				},
				status: 'completed'
			});
			const exploration = buildExploration(low);
			exploration.worktrees.push(high);
			exploration.branches = 2;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const comparator = new ResultComparator(exploration, fakeStateManager() as any);

			const report = await comparator.generateComparisonReport();

			expect(report.metrics.map((m) => m.worktree_index)).toEqual([2, 1]);
		});

		it('deducts an error penalty, capped at 10 points, from the overall score', async () => {
			const manyErrors = buildWorktree({
				index: 1,
				progress: {
					current_stage: '',
					errors: Array.from({ length: 20 }, (_, i) => `error ${i}`),
					insights_published: 0,
					last_update: '',
					percentage: 100,
					stages_completed: []
				},
				status: 'completed'
			});
			const exploration = buildExploration(manyErrors);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const comparator = new ResultComparator(exploration, fakeStateManager() as any);

			const report = await comparator.generateComparisonReport();

			// 40 (completed) + 20 (100% progress) - 10 (capped error penalty) = 50
			expect(report.metrics[0]?.overall_score).toBe(50);
			expect(report.metrics[0]?.errors_count).toBe(20);
		});

		it('selects the first completed worktree (by rank) as the winner, skipping non-completed higher scorers', async () => {
			const timedOut = buildWorktree({
				index: 1,
				progress: {
					current_stage: '',
					errors: [],
					insights_published: 0,
					last_update: '',
					percentage: 90,
					stages_completed: []
				},
				status: 'timed_out'
			});
			const completed = buildWorktree({
				index: 2,
				progress: {
					current_stage: '',
					errors: [],
					insights_published: 0,
					last_update: '',
					percentage: 50,
					stages_completed: []
				},
				status: 'completed'
			});
			const exploration = buildExploration(timedOut);
			exploration.worktrees.push(completed);
			exploration.branches = 2;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const comparator = new ResultComparator(exploration, fakeStateManager() as any);

			const report = await comparator.generateComparisonReport();

			expect(report.winner_index).toBe(2);
			expect(report.summary).toContain('Winner: Worktree 2');
		});

		it('reports no winner and a generic recommendation when every worktree failed', async () => {
			const failed = buildWorktree({ status: 'failed' });
			const exploration = buildExploration(failed);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const comparator = new ResultComparator(exploration, fakeStateManager() as any);

			const report = await comparator.generateComparisonReport();

			expect(report.winner_index).toBeUndefined();
			expect(report.recommendation).toContain('No successful exploration found');
		});

		it('recommends merging the winner and grades the recommendation by score tier', async () => {
			const excellent = buildWorktree({
				progress: {
					current_stage: '',
					errors: [],
					insights_published: 0,
					last_update: '',
					percentage: 100,
					stages_completed: []
				},
				status: 'completed'
			});
			const exploration = buildExploration(excellent);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const comparator = new ResultComparator(exploration, fakeStateManager() as any);

			const report = await comparator.generateComparisonReport();

			expect(report.recommendation).toContain('Recommend merging Worktree 1');
			// Score is 60 (40 completed + 20 progress) — falls in the 60-75 "Acceptable" tier.
			expect(report.recommendation).toContain('Acceptable implementation');
		});

		it('appends a warning note when the winner has more than 5 errors', async () => {
			const worktree = buildWorktree({
				progress: {
					current_stage: '',
					errors: Array.from({ length: 6 }, (_, i) => `error ${i}`),
					insights_published: 0,
					last_update: '',
					percentage: 100,
					stages_completed: []
				},
				status: 'completed'
			});
			const exploration = buildExploration(worktree);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const comparator = new ResultComparator(exploration, fakeStateManager() as any);

			const report = await comparator.generateComparisonReport();

			expect(report.recommendation).toContain('6 errors encountered');
		});
	});
});
