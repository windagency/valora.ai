import { describe, expect, it } from 'vitest';

import { MetricsQueryService } from './metrics-query.service';
import { WorktreeMetricsRegistry } from './worktree-metrics-registry';

describe('MetricsQueryService', () => {
	it('returns all metrics when no filters', () => {
		const reg = new WorktreeMetricsRegistry();
		reg.increment('calls');
		reg.gauge('memory', 100);
		const svc = new MetricsQueryService(reg);
		expect(svc.query({})).toHaveLength(2);
	});

	it('filters by name', () => {
		const reg = new WorktreeMetricsRegistry();
		reg.increment('calls');
		reg.gauge('memory', 100);
		const svc = new MetricsQueryService(reg);
		expect(svc.query({ name: 'calls' })).toHaveLength(1);
	});

	it('filters by type', () => {
		const reg = new WorktreeMetricsRegistry();
		reg.increment('calls');
		reg.gauge('memory', 100);
		const svc = new MetricsQueryService(reg);
		expect(svc.query({ type: 'gauge' })).toHaveLength(1);
		expect(svc.query({ type: 'gauge' })[0]?.name).toBe('memory');
	});

	it('filters by label', () => {
		const reg = new WorktreeMetricsRegistry();
		reg.increment('calls', { stage: 'analyse' });
		reg.increment('calls', { stage: 'implement' });
		const svc = new MetricsQueryService(reg);
		const results = svc.query({ labelFilters: { stage: 'analyse' } });
		expect(results).toHaveLength(1);
		expect(results[0]?.labels?.['stage']).toBe('analyse');
	});
});
