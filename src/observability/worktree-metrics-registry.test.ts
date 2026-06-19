import { describe, expect, it } from 'vitest';

import { WorktreeMetricsRegistry } from './worktree-metrics-registry';

describe('WorktreeMetricsRegistry', () => {
	it('starts with empty snapshot', () => {
		const reg = new WorktreeMetricsRegistry();
		expect(reg.snapshot()).toHaveLength(0);
	});

	it('increments a counter', () => {
		const reg = new WorktreeMetricsRegistry();
		reg.increment('llm_calls');
		reg.increment('llm_calls');
		const snap = reg.snapshot();
		expect(snap).toHaveLength(1);
		expect(snap[0]).toMatchObject({ name: 'llm_calls', type: 'counter', value: 2 });
	});

	it('sets a gauge value', () => {
		const reg = new WorktreeMetricsRegistry();
		reg.gauge('memory_mb', 128);
		reg.gauge('memory_mb', 256);
		const snap = reg.snapshot();
		expect(snap[0]).toMatchObject({ name: 'memory_mb', type: 'gauge', value: 256 });
	});

	it('treats metrics with different labels as separate', () => {
		const reg = new WorktreeMetricsRegistry();
		reg.increment('calls', { stage: 'analyse' });
		reg.increment('calls', { stage: 'implement' });
		const snap = reg.snapshot();
		expect(snap).toHaveLength(2);
	});

	it('clears all metrics', () => {
		const reg = new WorktreeMetricsRegistry();
		reg.increment('x');
		reg.clear();
		expect(reg.snapshot()).toHaveLength(0);
	});
});
