import type { MetricsQuery, MetricValue } from './observability.types';
import type { WorktreeMetricsRegistry } from './worktree-metrics-registry';

export class MetricsQueryService {
	constructor(private readonly registry: WorktreeMetricsRegistry) {}

	query(q: Partial<MetricsQuery>): MetricValue[] {
		let metrics = this.registry.snapshot();

		if (q.name !== undefined) {
			metrics = metrics.filter((m) => m.name === q.name);
		}
		if (q.type !== undefined) {
			metrics = metrics.filter((m) => m.type === q.type);
		}
		if (q.labelFilters && Object.keys(q.labelFilters).length > 0) {
			metrics = metrics.filter((m) => {
				if (!m.labels) return false;
				return Object.entries(q.labelFilters!).every(([k, v]) => m.labels![k] === v);
			});
		}

		return metrics;
	}
}
