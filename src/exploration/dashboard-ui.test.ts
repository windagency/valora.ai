import { describe, expect, it } from 'vitest';

import type { WorktreeExploration } from 'types/exploration.types';

import { calculateOverallProgress } from './dashboard-ui';

function makeWorktree(percentage: number): WorktreeExploration {
	return {
		branch_name: 'exploration/exp-1-1',
		index: 1,
		progress: {
			current_stage: '',
			errors: [],
			insights_published: 0,
			last_update: 't',
			percentage,
			stages_completed: []
		},
		status: 'pending',
		worktree_path: '/wt-1'
	};
}

describe('calculateOverallProgress', () => {
	it('averages worktree progress percentages across the branch count', () => {
		const worktrees = [makeWorktree(20), makeWorktree(60)];

		expect(calculateOverallProgress(worktrees, 2)).toBe(40);
	});

	it('returns 0 (not NaN) when there are no worktrees and no branches', () => {
		expect(calculateOverallProgress([], 0)).toBe(0);
	});

	it('returns 0 (not Infinity) when branches is 0 but worktree progress data is present', () => {
		const worktrees = [makeWorktree(50)];

		expect(calculateOverallProgress(worktrees, 0)).toBe(0);
	});
});
