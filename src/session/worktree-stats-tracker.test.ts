import { afterEach, describe, expect, it } from 'vitest';

import type { WorktreeExploration, WorktreeProgress } from 'types/exploration.types';

import { getExplorationEvents } from 'exploration/exploration-events';

import { WorktreeStatsTracker } from './worktree-stats-tracker';

function makeProgress(overrides: Partial<WorktreeProgress> = {}): WorktreeProgress {
	return {
		current_stage: 'Planning',
		errors: [],
		insights_published: 0,
		last_update: new Date().toISOString(),
		percentage: 0,
		stages_completed: [],
		...overrides
	};
}

function makeWorktree(index: number, overrides: Partial<WorktreeExploration> = {}): WorktreeExploration {
	return {
		branch_name: `exploration/task-${index}`,
		index,
		progress: makeProgress(),
		status: 'pending',
		worktree_path: `.valora/worktrees/${index}`,
		...overrides
	};
}

describe('WorktreeStatsTracker (real singleton event emitter)', () => {
	let tracker: WorktreeStatsTracker;

	afterEach(() => {
		tracker.unsubscribe();
	});

	it('accumulates total_created and exploration_ids as worktree:created events arrive', () => {
		tracker = new WorktreeStatsTracker();
		tracker.subscribe();
		const events = getExplorationEvents();

		events.emitWorktreeCreated('exp-1', makeWorktree(1));
		events.emitWorktreeCreated('exp-1', makeWorktree(2));
		events.emitWorktreeCreated('exp-2', makeWorktree(3));

		const stats = tracker.getStats();
		expect(stats.total_created).toBe(3);
		expect(stats.exploration_ids.sort()).toEqual(['exp-1', 'exp-2']);
		expect(stats.worktree_summaries).toHaveLength(3);
		expect(stats.worktree_summaries.every((s) => s.status === 'created')).toBe(true);
	});

	it('tracks max_concurrent as worktrees start and marks matching summaries running', () => {
		tracker = new WorktreeStatsTracker();
		tracker.subscribe();
		const events = getExplorationEvents();

		events.emitWorktreeCreated('exp-1', makeWorktree(1));
		events.emitWorktreeCreated('exp-1', makeWorktree(2));
		events.emitWorktreeStarted('exp-1', makeWorktree(1));
		expect(tracker.getStats().max_concurrent).toBe(1);

		events.emitWorktreeStarted('exp-1', makeWorktree(2));
		const stats = tracker.getStats();
		expect(stats.max_concurrent).toBe(2);
		expect(stats.worktree_summaries.every((s) => s.status === 'running')).toBe(true);
	});

	it('records duration and marks the summary completed when a worktree finishes', () => {
		tracker = new WorktreeStatsTracker();
		tracker.subscribe();
		const events = getExplorationEvents();

		events.emitWorktreeCreated('exp-1', makeWorktree(1));
		events.emitWorktreeStarted('exp-1', makeWorktree(1));
		events.emitWorktreeCompleted('exp-1', makeWorktree(1));

		const stats = tracker.getStats();
		expect(stats.total_duration_ms).toBeGreaterThanOrEqual(0);
		expect(stats.worktree_summaries[0]?.status).toBe('completed');
		expect(stats.worktree_summaries[0]?.completed_at).toBeDefined();
	});

	it('marks the summary failed (not completed) when a worktree fails', () => {
		tracker = new WorktreeStatsTracker();
		tracker.subscribe();
		const events = getExplorationEvents();

		events.emitWorktreeCreated('exp-1', makeWorktree(1));
		events.emitWorktreeStarted('exp-1', makeWorktree(1));
		events.emitWorktreeFailed('exp-1', makeWorktree(1), 'boom');

		expect(tracker.getStats().worktree_summaries[0]?.status).toBe('failed');
	});

	it('does not double-count max_concurrent once a worktree completes and frees its slot', () => {
		tracker = new WorktreeStatsTracker();
		tracker.subscribe();
		const events = getExplorationEvents();

		events.emitWorktreeCreated('exp-1', makeWorktree(1));
		events.emitWorktreeStarted('exp-1', makeWorktree(1));
		events.emitWorktreeCompleted('exp-1', makeWorktree(1));

		events.emitWorktreeCreated('exp-1', makeWorktree(2));
		events.emitWorktreeStarted('exp-1', makeWorktree(2));

		expect(tracker.getStats().max_concurrent).toBe(1);
	});

	it('stops updating stats after unsubscribe()', () => {
		tracker = new WorktreeStatsTracker();
		tracker.subscribe();
		const events = getExplorationEvents();
		events.emitWorktreeCreated('exp-1', makeWorktree(1));

		tracker.unsubscribe();
		events.emitWorktreeCreated('exp-1', makeWorktree(2));

		expect(tracker.getStats().total_created).toBe(1);
	});

	it('ignores a completed/failed event for a worktree index that was never started', () => {
		tracker = new WorktreeStatsTracker();
		tracker.subscribe();
		const events = getExplorationEvents();

		expect(() => events.emitWorktreeCompleted('exp-1', makeWorktree(1))).not.toThrow();
		expect(tracker.getStats().total_duration_ms).toBe(0);
	});
});
