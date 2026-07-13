import { describe, expect, it } from 'vitest';

import type { WorktreeExploration } from 'types/exploration.types';

import { calculateDataRange, computeExplorationStats } from './dashboard-metrics';

describe('calculateDataRange', () => {
	it('computes min/max/range for ordinary varying data', () => {
		expect(calculateDataRange([2, 5, 8])).toEqual({ max: 8, min: 0, range: 8 });
	});

	it('does not divide by zero when every value is the same non-zero number', () => {
		// max/min both include 1/0 as floor candidates, so a uniform data series
		// never actually produces an equal max/min pair — this proves that
		// invariant holds rather than assuming it.
		const result = calculateDataRange([5, 5, 5]);
		expect(result.range).toBeGreaterThan(0);
		expect(Number.isFinite(result.range)).toBe(true);
	});

	it('does not divide by zero when every value is exactly zero', () => {
		const result = calculateDataRange([0, 0, 0]);
		expect(result).toEqual({ max: 1, min: 0, range: 1 });
	});

	it('does not divide by zero for a single-element data series', () => {
		const result = calculateDataRange([42]);
		expect(result.range).toBeGreaterThan(0);
		expect(Number.isFinite(result.range)).toBe(true);
	});

	it('handles negative values without producing a zero or negative range', () => {
		const result = calculateDataRange([-5, -5, -5]);
		expect(result.range).toBeGreaterThan(0);
		expect(result.max).toBeGreaterThanOrEqual(result.min);
	});
});

describe('computeExplorationStats', () => {
	function makeWorktree(overrides: Partial<WorktreeExploration> = {}): WorktreeExploration {
		return {
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
			status: 'pending',
			worktree_path: '/wt-1',
			...overrides
		};
	}

	it('counts worktrees by status', () => {
		const worktrees = [
			makeWorktree({ status: 'completed' }),
			makeWorktree({ status: 'running' }),
			makeWorktree({ status: 'failed' }),
			makeWorktree({ status: 'pending' }),
			makeWorktree({ status: 'pending' })
		];

		const stats = computeExplorationStats(worktrees);

		expect(stats.completed).toBe(1);
		expect(stats.running).toBe(1);
		expect(stats.failed).toBe(1);
		expect(stats.pending).toBe(2);
	});

	it('sums errors and published insights across all worktrees', () => {
		const worktrees = [
			makeWorktree({ progress: { ...makeWorktree().progress, errors: ['a', 'b'], insights_published: 3 } }),
			makeWorktree({ progress: { ...makeWorktree().progress, errors: ['c'], insights_published: 2 } })
		];

		const stats = computeExplorationStats(worktrees);

		expect(stats.totalErrors).toBe(3);
		expect(stats.totalInsightsPublished).toBe(5);
	});

	it('averages progress percentage across worktrees', () => {
		const worktrees = [
			makeWorktree({ progress: { ...makeWorktree().progress, percentage: 20 } }),
			makeWorktree({ progress: { ...makeWorktree().progress, percentage: 60 } })
		];

		const stats = computeExplorationStats(worktrees);

		expect(stats.avgProgress).toBe(40);
	});

	it('returns 0 average progress (not NaN) for an empty worktree list', () => {
		const stats = computeExplorationStats([]);

		expect(stats.avgProgress).toBe(0);
		expect(Number.isNaN(stats.avgProgress)).toBe(false);
	});
});
