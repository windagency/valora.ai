/**
 * Performance Profiling Utility
 *
 * Advanced performance profiling with detailed operation tracking,
 * memory usage analysis, and bottleneck identification.
 */

import { getLogger } from 'output/logger';
import { performance, type PerformanceEntry, PerformanceObserver } from 'perf_hooks';
import { getMetricsCollector } from 'utils/metrics-collector';
import * as v8 from 'v8';

export interface PerformanceReport {
	averageDuration: number;
	cpuStats: {
		averageSystemTime: number;
		averageUserTime: number;
		totalSystemTime: number;
		totalUserTime: number;
	};
	memoryStats: {
		averageDelta: {
			external: number;
			heapTotal: number;
			heapUsed: number;
			rss: number;
		};
		peakUsage: NodeJS.MemoryUsage;
	};
	performanceEntries: PerformanceEntry[];
	slowestOperations: Array<{
		duration: number;
		labels?: Record<string, string>;
		operation: string;
	}>;
	timestamp: number;
	totalProfiles: number;
}

export interface ProfileResult {
	cpuUsage?: {
		after: NodeJS.CpuUsage;
		before: NodeJS.CpuUsage;
		delta: {
			system: number;
			user: number;
		};
	};
	duration: number;
	endTime: number;
	labels?: Record<string, string>;
	memoryUsage?: {
		after: NodeJS.MemoryUsage;
		before: NodeJS.MemoryUsage;
		delta: {
			external: number;
			heapTotal: number;
			heapUsed: number;
			rss: number;
		};
	};
	operation: string;
	startTime: number;
}

export interface ProfilingOptions {
	enableCpuProfiling?: boolean;
	enableMemoryProfiling?: boolean;
	enablePerformanceObserver?: boolean;
	maxProfileHistory?: number;
	sampleInterval?: number;
}

/**
 * Default profiling configuration
 */
const DEFAULT_PROFILING_OPTIONS: Required<ProfilingOptions> = {
	enableCpuProfiling: true,
	enableMemoryProfiling: true,
	enablePerformanceObserver: true,
	// 1 second
	maxProfileHistory: 1000,
	sampleInterval: 1000
};

/**
 * Performance Profiler Class
 *
 * Provides comprehensive performance profiling capabilities including
 * timing, memory usage, CPU usage, and performance monitoring.
 */
export class PerformanceProfiler {
	private logger = getLogger();
	private metricsCollector = getMetricsCollector();
	private monitoringInterval?: NodeJS.Timeout;
	private options: Required<ProfilingOptions>;
	private performanceObserver?: PerformanceObserver;
	private profiles: ProfileResult[] = [];

	constructor(options: ProfilingOptions = {}) {
		this.options = { ...DEFAULT_PROFILING_OPTIONS, ...options };

		if (this.options.enablePerformanceObserver) {
			this.setupPerformanceObserver();
		}
	}

	/**
	 * Profile an async operation with detailed metrics
	 */
	async profileAsync<T>(operation: string, fn: () => Promise<T>, labels?: Record<string, string>): Promise<T> {
		const startTime = performance.now();
		const startMemory = this.options.enableMemoryProfiling ? process.memoryUsage() : undefined;
		const startCpu = this.options.enableCpuProfiling ? process.cpuUsage() : undefined;

		try {
			const result = await fn();

			const endTime = performance.now();
			const duration = endTime - startTime;

			const profile: ProfileResult = {
				duration,
				endTime,
				labels,
				operation,
				startTime
			};

			if (startMemory) {
				const endMemory = process.memoryUsage();
				profile.memoryUsage = {
					after: endMemory,
					before: startMemory,
					delta: {
						external: endMemory.external - startMemory.external,
						heapTotal: endMemory.heapTotal - startMemory.heapTotal,
						heapUsed: endMemory.heapUsed - startMemory.heapUsed,
						rss: endMemory.rss - startMemory.rss
					}
				};
			}

			if (startCpu) {
				const endCpu = process.cpuUsage();
				profile.cpuUsage = {
					after: endCpu,
					before: startCpu,
					delta: {
						system: endCpu.system - startCpu.system,
						user: endCpu.user - startCpu.user
					}
				};
			}

			this.recordProfile(profile);

			this.logger.debug(`Profiled async operation: ${operation}`, {
				cpuUser: profile.cpuUsage?.delta.user,
				duration: `${duration.toFixed(2)}ms`,
				labels,
				memoryDelta: profile.memoryUsage?.delta.heapUsed
			});

			return result;
		} catch (error) {
			// Still record the failed operation
			const endTime = performance.now();
			const duration = endTime - startTime;

			const profile: ProfileResult = {
				duration,
				endTime,
				labels: { ...labels, status: 'error' },
				operation: `${operation}_failed`,
				startTime
			};

			this.recordProfile(profile);
			throw error;
		}
	}

	/**
	 * Profile a sync operation with detailed metrics
	 */
	profileSync<T>(operation: string, fn: () => T, labels?: Record<string, string>): T {
		const startTime = performance.now();
		const startMemory = this.options.enableMemoryProfiling ? process.memoryUsage() : undefined;
		const startCpu = this.options.enableCpuProfiling ? process.cpuUsage() : undefined;

		try {
			const result = fn();

			const endTime = performance.now();
			const duration = endTime - startTime;

			const profile: ProfileResult = {
				duration,
				endTime,
				labels,
				operation,
				startTime
			};

			if (startMemory) {
				const endMemory = process.memoryUsage();
				profile.memoryUsage = {
					after: endMemory,
					before: startMemory,
					delta: {
						external: endMemory.external - startMemory.external,
						heapTotal: endMemory.heapTotal - startMemory.heapTotal,
						heapUsed: endMemory.heapUsed - startMemory.heapUsed,
						rss: endMemory.rss - startMemory.rss
					}
				};
			}

			if (startCpu) {
				const endCpu = process.cpuUsage();
				profile.cpuUsage = {
					after: endCpu,
					before: startCpu,
					delta: {
						system: endCpu.system - startCpu.system,
						user: endCpu.user - startCpu.user
					}
				};
			}

			this.recordProfile(profile);

			this.logger.debug(`Profiled sync operation: ${operation}`, {
				cpuUser: profile.cpuUsage?.delta.user,
				duration: `${duration.toFixed(2)}ms`,
				labels,
				memoryDelta: profile.memoryUsage?.delta.heapUsed
			});

			return result;
		} catch (error) {
			// Still record the failed operation
			const endTime = performance.now();
			const duration = endTime - startTime;

			const profile: ProfileResult = {
				duration,
				endTime,
				labels: { ...labels, status: 'error' },
				operation: `${operation}_failed`,
				startTime
			};

			this.recordProfile(profile);
			throw error;
		}
	}

	/**
	 * Start continuous monitoring
	 */
	startMonitoring(intervalMs: number = this.options.sampleInterval): void {
		this.monitoringInterval = setInterval(() => {
			this.takeSystemSnapshot();
		}, intervalMs);

		// Allow process to exit even if monitoring is active
		this.monitoringInterval.unref();

		this.logger.info('Performance monitoring started', {
			cpuProfiling: this.options.enableCpuProfiling,
			intervalMs,
			memoryProfiling: this.options.enableMemoryProfiling
		});
	}

	/**
	 * Stop continuous monitoring
	 */
	stopMonitoring(): void {
		if (this.monitoringInterval) {
			clearInterval(this.monitoringInterval);
			this.monitoringInterval = undefined;
			this.logger.info('Performance monitoring stopped');
		}
	}

	/**
	 * Take a system performance snapshot
	 */
	takeSystemSnapshot(): void {
		const memoryUsage = process.memoryUsage();
		const cpuUsage = process.cpuUsage();

		// Record memory metrics
		this.metricsCollector.setGauge('system_memory_rss', memoryUsage.rss, { unit: 'bytes' });
		this.metricsCollector.setGauge('system_memory_heap_used', memoryUsage.heapUsed, { unit: 'bytes' });
		this.metricsCollector.setGauge('system_memory_heap_total', memoryUsage.heapTotal, { unit: 'bytes' });
		this.metricsCollector.setGauge('system_memory_external', memoryUsage.external, { unit: 'bytes' });

		// Record CPU metrics (cumulative)
		this.metricsCollector.setGauge('system_cpu_user', cpuUsage.user, { unit: 'microseconds' });
		this.metricsCollector.setGauge('system_cpu_system', cpuUsage.system, { unit: 'microseconds' });

		// Record V8 heap statistics
		const heapStats = v8.getHeapStatistics();
		this.metricsCollector.setGauge('v8_heap_total', heapStats.total_heap_size, { unit: 'bytes' });
		this.metricsCollector.setGauge('v8_heap_used', heapStats.used_heap_size, { unit: 'bytes' });
		this.metricsCollector.setGauge('v8_heap_limit', heapStats.heap_size_limit, { unit: 'bytes' });
	}

	/**
	 * Generate a comprehensive performance report
	 */
	generateReport(): PerformanceReport {
		const profiles = [...this.profiles];

		// Calculate averages and aggregates
		const totalDuration = profiles.reduce((sum, p) => sum + p.duration, 0);
		const averageDuration = profiles.length > 0 ? totalDuration / profiles.length : 0;

		// Find slowest operations
		const slowestOperations = profiles
			.sort((a, b) => b.duration - a.duration)
			.slice(0, 10)
			.map((p) => ({
				duration: p.duration,
				labels: p.labels,
				operation: p.operation
			}));

		// Calculate memory stats
		const memoryProfiles = profiles.filter((p) => p.memoryUsage);
		const averageMemoryDelta =
			memoryProfiles.length > 0
				? {
						external: memoryProfiles.reduce((sum, p) => sum + p.memoryUsage!.delta.external, 0) / memoryProfiles.length,
						heapTotal:
							memoryProfiles.reduce((sum, p) => sum + p.memoryUsage!.delta.heapTotal, 0) / memoryProfiles.length,
						heapUsed: memoryProfiles.reduce((sum, p) => sum + p.memoryUsage!.delta.heapUsed, 0) / memoryProfiles.length,
						rss: memoryProfiles.reduce((sum, p) => sum + p.memoryUsage!.delta.rss, 0) / memoryProfiles.length
					}
				: { external: 0, heapTotal: 0, heapUsed: 0, rss: 0 };

		// Find peak memory usage
		const peakUsage = profiles.reduce(
			(peak, p) => {
				if (p.memoryUsage && p.memoryUsage.after.heapUsed > peak.heapUsed) {
					return p.memoryUsage.after;
				}
				return peak;
			},
			{ arrayBuffers: 0, external: 0, heapTotal: 0, heapUsed: 0, rss: 0 }
		);

		// Calculate CPU stats
		const cpuProfiles = profiles.filter((p) => p.cpuUsage);
		const totalUserTime = cpuProfiles.reduce((sum, p) => sum + p.cpuUsage!.delta.user, 0);
		const totalSystemTime = cpuProfiles.reduce((sum, p) => sum + p.cpuUsage!.delta.system, 0);
		const averageUserTime = cpuProfiles.length > 0 ? totalUserTime / cpuProfiles.length : 0;
		const averageSystemTime = cpuProfiles.length > 0 ? totalSystemTime / cpuProfiles.length : 0;

		// Get performance entries
		const performanceEntries = performance.getEntries();

		return {
			averageDuration,
			cpuStats: {
				averageSystemTime,
				averageUserTime,
				totalSystemTime,
				totalUserTime
			},
			memoryStats: {
				averageDelta: averageMemoryDelta,
				peakUsage
			},
			performanceEntries,
			slowestOperations,
			timestamp: Date.now(),
			totalProfiles: profiles.length
		};
	}

	/**
	 * Get recent profiles for a specific operation
	 */
	getRecentProfiles(operation?: string, limit: number = 50): ProfileResult[] {
		let filtered = this.profiles;
		if (operation) {
			filtered = filtered.filter((p) => p.operation === operation);
		}

		return filtered.sort((a, b) => b.startTime - a.startTime).slice(0, limit);
	}

	/**
	 * Clear all profiling data
	 */
	clearProfiles(): void {
		this.profiles = [];
	}

	/**
	 * Get profiler statistics
	 */
	getStats(): {
		averageDuration: number;
		cpuProfiles: number;
		memoryProfiles: number;
		newestProfile: number;
		oldestProfile: number;
		totalProfiles: number;
	} {
		const memoryProfiles = this.profiles.filter((p) => p.memoryUsage).length;
		const cpuProfiles = this.profiles.filter((p) => p.cpuUsage).length;
		const totalDuration = this.profiles.reduce((sum, p) => sum + p.duration, 0);
		const averageDuration = this.profiles.length > 0 ? totalDuration / this.profiles.length : 0;

		const timestamps = this.profiles.map((p) => p.startTime);
		const oldestProfile = timestamps.length > 0 ? Math.min(...timestamps) : 0;
		const newestProfile = timestamps.length > 0 ? Math.max(...timestamps) : 0;

		return {
			averageDuration,
			cpuProfiles,
			memoryProfiles,
			newestProfile,
			oldestProfile,
			totalProfiles: this.profiles.length
		};
	}

	/**
	 * Destroy the profiler and clean up resources
	 */
	destroy(): void {
		if (this.performanceObserver) {
			this.performanceObserver.disconnect();
		}
		this.clearProfiles();
	}

	/**
	 * Record a profile result
	 */
	private recordProfile(profile: ProfileResult): void {
		this.profiles.push(profile);

		// Maintain history limit
		if (this.profiles.length > this.options.maxProfileHistory) {
			this.profiles.shift();
		}

		// Record in metrics collector
		this.metricsCollector.observeHistogram(`${profile.operation}_duration`, profile.duration, profile.labels);

		if (profile.memoryUsage) {
			this.metricsCollector.observeHistogram(
				`${profile.operation}_memory_delta`,
				profile.memoryUsage.delta.heapUsed,
				profile.labels
			);
		}

		if (profile.cpuUsage) {
			this.metricsCollector.observeHistogram(
				`${profile.operation}_cpu_user`,
				profile.cpuUsage.delta.user,
				profile.labels
			);
			this.metricsCollector.observeHistogram(
				`${profile.operation}_cpu_system`,
				profile.cpuUsage.delta.system,
				profile.labels
			);
		}
	}

	/**
	 * Setup performance observer for automatic tracking
	 */
	private setupPerformanceObserver(): void {
		this.performanceObserver = new PerformanceObserver((list) => {
			list
				.getEntries()
				.filter((entry) => entry.entryType === 'measure')
				.forEach((entry) => {
					// Record performance entries as metrics
					this.metricsCollector.observeHistogram('performance_measure', entry.duration, {
						entryType: entry.entryType,
						name: entry.name
					});
				});
		});

		this.performanceObserver.observe({ entryTypes: ['measure', 'function'] });
	}
}

// Singleton instance for global use
let globalPerformanceProfiler: null | PerformanceProfiler = null;

/**
 * Get the global performance profiler instance
 */
export function getPerformanceProfiler(options?: ProfilingOptions): PerformanceProfiler {
	globalPerformanceProfiler ??= new PerformanceProfiler(options);
	return globalPerformanceProfiler;
}

/**
 * Set a custom global performance profiler instance
 */
export function setPerformanceProfiler(profiler: PerformanceProfiler): void {
	globalPerformanceProfiler = profiler;
}

/**
 * Convenience functions for global profiling
 */
export function generatePerformanceReport(): PerformanceReport {
	return getPerformanceProfiler().generateReport();
}

export function profileAsync<T>(operation: string, fn: () => Promise<T>, labels?: Record<string, string>): Promise<T> {
	return getPerformanceProfiler().profileAsync(operation, fn, labels);
}

export function profileSync<T>(operation: string, fn: () => T, labels?: Record<string, string>): T {
	return getPerformanceProfiler().profileSync(operation, fn, labels);
}

export function startSystemMonitoring(intervalMs?: number): void {
	getPerformanceProfiler().startMonitoring(intervalMs);
}

/**
 * Type guard to check if target has a constructor with a name
 */
function hasConstructorName(target: unknown): target is { constructor: { name: string } } {
	return (
		typeof target === 'object' &&
		target !== null &&
		'constructor' in target &&
		typeof target.constructor === 'function' &&
		'name' in target.constructor &&
		typeof target.constructor.name === 'string'
	);
}

/**
 * Type guard to check if a function is async
 */
function isAsyncFunction(fn: unknown): boolean {
	return typeof fn === 'function' && fn.constructor.name === 'AsyncFunction';
}

/**
 * Decorator for profiling class methods
 */
export function profileMethod(
	labels?: Record<string, string>
): (target: unknown, propertyKey: string, descriptor: PropertyDescriptor) => PropertyDescriptor {
	return function (target: unknown, propertyKey: string, descriptor: PropertyDescriptor): PropertyDescriptor {
		const originalMethod = descriptor.value as (...args: unknown[]) => unknown;

		if (typeof originalMethod !== 'function') {
			return descriptor;
		}

		descriptor.value = function (this: unknown, ...args: unknown[]): unknown {
			const className = hasConstructorName(target) ? target.constructor.name : 'Unknown';
			const operation = `${className}.${propertyKey}`;
			const profiler = getPerformanceProfiler();

			if (isAsyncFunction(originalMethod)) {
				return profiler.profileAsync(
					operation,
					() => (originalMethod as (...args: unknown[]) => Promise<unknown>).apply(this, args),
					labels
				);
			}

			return profiler.profileSync(operation, () => originalMethod.apply(this, args), labels);
		};

		return descriptor;
	};
}
