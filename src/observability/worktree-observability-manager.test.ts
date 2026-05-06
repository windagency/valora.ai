import { describe, expect, it } from 'vitest';

import { WorktreeObservabilityManager } from './worktree-observability-manager';

describe('WorktreeObservabilityManager', () => {
	it('creates a buffer and registry for a worktree', () => {
		const mgr = new WorktreeObservabilityManager();
		mgr.onCreate('wt-1');
		expect(mgr.getLogBuffer('wt-1')).not.toBeNull();
		expect(mgr.getMetricsRegistry('wt-1')).not.toBeNull();
	});

	it('returns null for unknown worktree', () => {
		const mgr = new WorktreeObservabilityManager();
		expect(mgr.getLogBuffer('unknown')).toBeNull();
		expect(mgr.getMetricsRegistry('unknown')).toBeNull();
	});

	it('destroys buffer and registry on completion', () => {
		const mgr = new WorktreeObservabilityManager();
		mgr.onCreate('wt-2');
		mgr.onComplete('wt-2');
		expect(mgr.getLogBuffer('wt-2')).toBeNull();
		expect(mgr.getMetricsRegistry('wt-2')).toBeNull();
	});

	it('destroys on failure', () => {
		const mgr = new WorktreeObservabilityManager();
		mgr.onCreate('wt-3');
		mgr.onFailure('wt-3');
		expect(mgr.getLogBuffer('wt-3')).toBeNull();
	});

	it('lists active worktrees', () => {
		const mgr = new WorktreeObservabilityManager();
		mgr.onCreate('wt-a');
		mgr.onCreate('wt-b');
		expect(mgr.activeWorktrees()).toEqual(expect.arrayContaining(['wt-a', 'wt-b']));
	});
});
