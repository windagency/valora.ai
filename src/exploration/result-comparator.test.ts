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
});
