import type { MetricValue } from './observability.types';

export class WorktreeMetricsRegistry {
	private metrics = new Map<string, MetricValue>();

	clear(): void {
		this.metrics.clear();
	}

	gauge(name: string, value: number, labels?: Record<string, string>): void {
		const k = this.key(name, labels);
		this.metrics.set(k, { labels, name, type: 'gauge', value });
	}

	increment(name: string, labels?: Record<string, string>): void {
		const k = this.key(name, labels);
		const existing = this.metrics.get(k);
		this.metrics.set(k, {
			labels,
			name,
			type: 'counter',
			value: (existing?.value ?? 0) + 1
		});
	}

	snapshot(): MetricValue[] {
		return [...this.metrics.values()];
	}

	private key(name: string, labels?: Record<string, string>): string {
		if (!labels || Object.keys(labels).length === 0) return name;
		const sorted = Object.entries(labels)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([k, v]) => `${k}=${v}`)
			.join(',');
		return `${name}{${sorted}}`;
	}
}
