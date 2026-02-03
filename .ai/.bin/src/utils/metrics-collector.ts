/**
 * Metrics Collector Utility
 *
 * Comprehensive metrics collection system for performance monitoring.
 * Supports counters, gauges, histograms, and timers with automatic aggregation.
 */

export interface CounterMetric {
	description: string;
	labels?: Record<string, string>;
	name: string;
	value: number;
}

export interface GaugeMetric {
	description: string;
	labels?: Record<string, string>;
	name: string;
	value: number;
}

export interface HistogramMetric {
	buckets: Record<string, number>;
	count: number;
	description: string;
	labels?: Record<string, string>;
	name: string;
	sum: number;
}

export interface MetricsOptions {
	cleanupInterval?: number; // milliseconds
	enableHistograms?: boolean;
	histogramBuckets?: number[];
	maxMetricsAge?: number; // milliseconds
}

export interface MetricsSnapshot {
	collectionDuration: number;
	counters: CounterMetric[];
	gauges: GaugeMetric[];
	histograms: HistogramMetric[];
	timestamp: number;
	uptime: number;
}

export interface MetricValue {
	labels?: Record<string, string>;
	timestamp: number;
	value: number;
}

export interface TimerResult {
	duration: number;
	endTime: number;
	startTime: number;
}

/**
 * Default configuration for metrics collection
 */
const DEFAULT_METRICS_OPTIONS: Required<MetricsOptions> = {
	// 24 hours
	cleanupInterval: 60 * 60 * 1000,
	enableHistograms: true,
	histogramBuckets: [0.1, 0.5, 1, 2.5, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
	maxMetricsAge: 24 * 60 * 60 * 1000 // 1 hour
};

/**
 * Metrics Collector Class
 *
 * Provides comprehensive metrics collection with automatic cleanup and aggregation.
 */
export class MetricsCollector {
	private cleanupInterval: NodeJS.Timeout | null = null;
	private counters: Map<string, CounterMetric> = new Map();
	private gauges: Map<string, GaugeMetric> = new Map();
	private histograms: Map<string, HistogramMetric> = new Map();
	private options: Required<MetricsOptions>;
	private startTime: number = Date.now();
	private timers: Map<string, number> = new Map();

	constructor(options: MetricsOptions = {}) {
		this.options = { ...DEFAULT_METRICS_OPTIONS, ...options };
		this.startCleanup();
	}

	/**
	 * Increment a counter metric
	 */
	incrementCounter(name: string, value: number = 1, labels?: Record<string, string>): void {
		const key = this.createKey(name, labels);
		const existing = this.counters.get(key);

		if (existing) {
			existing.value += value;
		} else {
			this.counters.set(key, {
				description: `${name} counter`,
				labels,
				name,
				value
			});
		}
	}

	/**
	 * Set a gauge metric value
	 */
	setGauge(name: string, value: number, labels?: Record<string, string>): void {
		const key = this.createKey(name, labels);

		this.gauges.set(key, {
			description: `${name} gauge`,
			labels,
			name,
			value
		});
	}

	/**
	 * Update a gauge metric by adding to current value
	 */
	updateGauge(name: string, delta: number, labels?: Record<string, string>): void {
		const key = this.createKey(name, labels);
		const existing = this.gauges.get(key);

		const newValue = existing ? existing.value + delta : delta;
		this.setGauge(name, newValue, labels);
	}

	/**
	 * Record a histogram observation
	 */
	observeHistogram(name: string, value: number, labels?: Record<string, string>): void {
		if (!this.options.enableHistograms) return;

		const key = this.createKey(name, labels);
		const existing = this.histograms.get(key);

		if (existing) {
			existing.count++;
			existing.sum += value;

			// Update buckets
			Object.entries(existing.buckets).forEach(([bucket, count]) => {
				const bucketValue = parseFloat(bucket);
				if (value <= bucketValue) {
					existing.buckets[bucket] = count + 1;
				}
			});
		} else {
			// Create new histogram
			const bucketEntries: Array<[string, number]> = [
				...this.options.histogramBuckets.map((bucket): [string, number] => [
					bucket.toString(),
					value <= bucket ? 1 : 0
				]),
				['+Inf', 1]
			];
			const buckets: Record<string, number> = Object.fromEntries(bucketEntries);

			this.histograms.set(key, {
				buckets,
				count: 1,
				description: `${name} histogram`,
				labels,
				name,
				sum: value
			});
		}
	}

	/**
	 * Start a timer for measuring operation duration
	 */
	startTimer(name: string): string {
		const timerId = `${name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
		this.timers.set(timerId, Date.now());
		return timerId;
	}

	/**
	 * End a timer and record the duration
	 */
	endTimer(timerId: string, labels?: Record<string, string>): null | TimerResult {
		const startTime = this.timers.get(timerId);
		if (!startTime) return null;

		const endTime = Date.now();
		const duration = endTime - startTime;

		this.timers.delete(timerId);

		// Record in histogram if enabled
		const timerName = timerId.split('_')[0];
		this.observeHistogram(`${timerName}_duration`, duration, labels);

		return { duration, endTime, startTime };
	}

	/**
	 * Time an async operation automatically
	 */
	async timeAsync<T>(name: string, operation: () => Promise<T>, labels?: Record<string, string>): Promise<T> {
		const timerId = this.startTimer(name);
		try {
			const result = await operation();
			this.endTimer(timerId, { ...labels, status: 'success' });
			return result;
		} catch (error) {
			this.endTimer(timerId, { ...labels, status: 'error' });
			this.incrementCounter(`${name}_errors`, 1, labels);
			throw error;
		}
	}

	/**
	 * Time a sync operation automatically
	 */
	timeSync<T>(name: string, operation: () => T, labels?: Record<string, string>): T {
		const timerId = this.startTimer(name);
		try {
			const result = operation();
			this.endTimer(timerId, { ...labels, status: 'success' });
			return result;
		} catch (error) {
			this.endTimer(timerId, { ...labels, status: 'error' });
			this.incrementCounter(`${name}_errors`, 1, labels);
			throw error;
		}
	}

	/**
	 * Get a snapshot of all current metrics
	 */
	getSnapshot(): MetricsSnapshot {
		const snapshotStart = Date.now();

		return {
			collectionDuration: Date.now() - snapshotStart,
			counters: Array.from(this.counters.values()),
			gauges: Array.from(this.gauges.values()),
			histograms: Array.from(this.histograms.values()),
			timestamp: Date.now(),
			uptime: Date.now() - this.startTime
		};
	}

	/**
	 * Export metrics in Prometheus format
	 */
	exportPrometheus(): string {
		const snapshot = this.getSnapshot();

		const uptimeLines = [
			`# HELP ai_orchestrator_uptime_seconds Time since metrics collection started`,
			`# TYPE ai_orchestrator_uptime_seconds gauge`,
			`ai_orchestrator_uptime_seconds ${snapshot.uptime / 1000}`
		];

		// Export counters
		const counterLines = snapshot.counters.flatMap((counter) => {
			const labels = this.formatPrometheusLabels(counter.labels);
			return [
				`# HELP ${this.prometheusName(counter.name)} ${counter.description}`,
				`# TYPE ${this.prometheusName(counter.name)} counter`,
				`${this.prometheusName(counter.name)}${labels} ${counter.value}`
			];
		});

		// Export gauges
		const gaugeLines = snapshot.gauges.flatMap((gauge) => {
			const labels = this.formatPrometheusLabels(gauge.labels);
			return [
				`# HELP ${this.prometheusName(gauge.name)} ${gauge.description}`,
				`# TYPE ${this.prometheusName(gauge.name)} gauge`,
				`${this.prometheusName(gauge.name)}${labels} ${gauge.value}`
			];
		});

		// Export histograms
		const histogramLines = snapshot.histograms.flatMap((histogram) => {
			const baseName = this.prometheusName(histogram.name);
			const labels = this.formatPrometheusLabels(histogram.labels);

			const bucketLines = Object.entries(histogram.buckets).map(([bucket, count]) => {
				const bucketLabels = { ...histogram.labels, le: bucket };
				const bucketLabelStr = this.formatPrometheusLabels(bucketLabels);
				return `${baseName}_bucket${bucketLabelStr} ${count}`;
			});

			return [
				`# HELP ${baseName}_count ${histogram.description} count`,
				`# TYPE ${baseName}_count counter`,
				`${baseName}_count${labels} ${histogram.count}`,
				`# HELP ${baseName}_sum ${histogram.description} sum`,
				`# TYPE ${baseName}_sum counter`,
				`${baseName}_sum${labels} ${histogram.sum}`,
				`# HELP ${baseName}_bucket ${histogram.description} bucket`,
				`# TYPE ${baseName}_bucket counter`,
				...bucketLines
			];
		});

		return [...uptimeLines, ...counterLines, ...gaugeLines, ...histogramLines].join('\n');
	}

	/**
	 * Reset all metrics
	 */
	reset(): void {
		this.counters.clear();
		this.gauges.clear();
		this.histograms.clear();
		this.timers.clear();
		this.startTime = Date.now();
	}

	/**
	 * Get metrics statistics
	 */
	getStats(): {
		activeTimers: number;
		counters: number;
		gauges: number;
		histograms: number;
		uptime: number;
	} {
		return {
			activeTimers: this.timers.size,
			counters: this.counters.size,
			gauges: this.gauges.size,
			histograms: this.histograms.size,
			uptime: Date.now() - this.startTime
		};
	}

	/**
	 * Destroy the collector and clean up resources
	 */
	destroy(): void {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
			this.cleanupInterval = null;
		}
		this.reset();
	}

	/**
	 * Create a unique key for metrics with labels
	 */
	private createKey(name: string, labels?: Record<string, string>): string {
		if (!labels) return name;

		const sortedLabels = Object.keys(labels)
			.sort()
			.map((key) => `${key}=${labels[key]}`)
			.join(',');

		return `${name}{${sortedLabels}}`;
	}

	/**
	 * Convert metric name to Prometheus format
	 */
	private prometheusName(name: string): string {
		return name
			.replace(/[^a-zA-Z0-9_]/g, '_')
			.replace(/^[^a-zA-Z_]/, '_')
			.toLowerCase();
	}

	/**
	 * Format labels for Prometheus
	 */
	private formatPrometheusLabels(labels?: Record<string, string>): string {
		if (!labels || Object.keys(labels).length === 0) return '';

		const formatted = Object.entries(labels)
			.map(([key, value]) => `${this.prometheusName(key)}="${value.replace(/"/g, '\\"')}"`)
			.join(',');

		return `{${formatted}}`;
	}

	/**
	 * Start automatic cleanup of old metrics
	 */
	private startCleanup(): void {
		this.cleanupInterval = setInterval(() => {
			this.cleanup();
		}, this.options.cleanupInterval);

		// Allow process to exit even if cleanup interval is active
		this.cleanupInterval.unref();
	}

	/**
	 * Clean up old metrics based on age and activity
	 */
	private cleanup(): void {
		const now = Date.now();
		const maxAge = this.options.maxMetricsAge;

		// Clean up old timers (unfinished operations)
		Array.from(this.timers.entries())
			.filter(([, startTime]) => now - startTime > maxAge)
			.forEach(([timerId]) => this.timers.delete(timerId));

		// For gauges and counters, we don't have timestamps, so we use a different approach
		// In a production system, you might want to track last-update timestamps
		// For now, we'll implement a simple size-based cleanup to prevent unbounded growth

		const maxCounters = 1000;
		const maxGauges = 500;
		const maxHistograms = 200;

		// If we exceed size limits, remove oldest entries
		// This is a simple LRU-style cleanup
		if (this.counters.size > maxCounters) {
			const entriesToRemove = this.counters.size - maxCounters;
			Array.from(this.counters.keys())
				.slice(0, entriesToRemove)
				.forEach((key) => this.counters.delete(key));
		}

		if (this.gauges.size > maxGauges) {
			const entriesToRemove = this.gauges.size - maxGauges;
			Array.from(this.gauges.keys())
				.slice(0, entriesToRemove)
				.forEach((key) => this.gauges.delete(key));
		}

		if (this.histograms.size > maxHistograms) {
			const entriesToRemove = this.histograms.size - maxHistograms;
			Array.from(this.histograms.keys())
				.slice(0, entriesToRemove)
				.forEach((key) => this.histograms.delete(key));
		}
	}
}

// Singleton instance for global use
let globalMetricsCollector: MetricsCollector | null = null;

/**
 * Get the global metrics collector instance
 */
export function getMetricsCollector(options?: MetricsOptions): MetricsCollector {
	globalMetricsCollector ??= new MetricsCollector(options);
	return globalMetricsCollector;
}

/**
 * Set a custom global metrics collector instance
 */
export function setMetricsCollector(collector: MetricsCollector): void {
	globalMetricsCollector = collector;
}

/**
 * Convenience functions for global metrics collection
 */
export function endTimer(timerId: string, labels?: Record<string, string>): null | TimerResult {
	return getMetricsCollector().endTimer(timerId, labels);
}

export function exportMetricsPrometheus(): string {
	return getMetricsCollector().exportPrometheus();
}

export function getMetricsSnapshot(): MetricsSnapshot {
	return getMetricsCollector().getSnapshot();
}

export function incrementCounter(name: string, value?: number, labels?: Record<string, string>): void {
	getMetricsCollector().incrementCounter(name, value, labels);
}

export function observeHistogram(name: string, value: number, labels?: Record<string, string>): void {
	getMetricsCollector().observeHistogram(name, value, labels);
}

export function setGauge(name: string, value: number, labels?: Record<string, string>): void {
	getMetricsCollector().setGauge(name, value, labels);
}

export function startTimer(name: string): string {
	return getMetricsCollector().startTimer(name);
}

export function timeAsync<T>(name: string, operation: () => Promise<T>, labels?: Record<string, string>): Promise<T> {
	return getMetricsCollector().timeAsync(name, operation, labels);
}

export function timeSync<T>(name: string, operation: () => T, labels?: Record<string, string>): T {
	return getMetricsCollector().timeSync(name, operation, labels);
}

export function updateGauge(name: string, delta: number, labels?: Record<string, string>): void {
	getMetricsCollector().updateGauge(name, delta, labels);
}
