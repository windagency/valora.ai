/**
 * System Monitor Service
 *
 * Handles system monitoring and resource alerting for the MCP server.
 * Separated from MCPOrchestratorServer for better modularity.
 */

import type { Logger } from 'output/logger';

import {
	DEFAULT_PROCESS_MEMORY_THRESHOLD_MB,
	MS_PER_HOUR,
	RESOURCE_MONITOR_INTERVAL_MS,
	SYSTEM_MONITOR_INTERVAL_MS
} from 'config/constants';
import { createHeapSnapshot } from 'utils/heap-profiler';
import { startSystemMonitoring } from 'utils/performance-profiler';
import { type ResourceAlert as MonitorResourceAlert, startResourceMonitoring } from 'utils/resource-monitor';

export interface ResourceAlert {
	message: string;
	metric: string;
	resource: string;
	severity: 'critical' | 'warning';
	threshold: number;
	value: number;
}

export class SystemMonitorService {
	private readonly HEAP_DUMP_COOLDOWN_MS = MS_PER_HOUR;
	private lastHeapDumpTime = 0;

	constructor(private logger: Logger) {}

	/**
	 * Start system monitoring
	 */
	startMonitoring(): void {
		this.logger.debug('Starting performance monitoring');
		startSystemMonitoring(SYSTEM_MONITOR_INTERVAL_MS);

		startResourceMonitoring({
			alertCallback: (alert) => this.handleResourceAlert(alert),
			enableDiskMonitoring: false,
			intervalMs: RESOURCE_MONITOR_INTERVAL_MS,
			thresholds: {
				processMemoryMB: DEFAULT_PROCESS_MEMORY_THRESHOLD_MB
			}
		});
	}

	/**
	 * Handle resource alerts
	 */
	private handleResourceAlert(alert: MonitorResourceAlert): void {
		this.logger.warn('Resource alert from MCP server', {
			message: alert.message,
			metric: alert.metric,
			resource: alert.resource,
			severity: alert.severity,
			threshold: alert.threshold,
			value: alert.value
		});

		// Check for critical memory issues and trigger heap dump
		if (
			alert.severity === 'critical' &&
			(alert.resource === 'memory' || alert.resource === 'process') &&
			alert.metric.includes('memory')
		) {
			this.triggerHeapDump();
		}
	}

	/**
	 * Trigger a heap dump if cooldown has passed
	 */
	private triggerHeapDump(): void {
		const now = Date.now();
		if (now - this.lastHeapDumpTime < this.HEAP_DUMP_COOLDOWN_MS) {
			this.logger.debug('Skipping heap dump due to cooldown');
			return;
		}

		try {
			this.logger.info('Triggering emergency heap dump due to critical memory usage');
			const path = createHeapSnapshot({ prefix: 'oom-protection' });
			this.lastHeapDumpTime = now;
			this.logger.info(`Emergency heap dump created at: ${path}`);
		} catch (error) {
			this.logger.error('Failed to create emergency heap dump', error as Error);
		}
	}

	/**
	 * Stop monitoring (useful for cleanup)
	 */
	stopMonitoring(): void {
		// Note: The monitoring functions don't provide stop methods yet
		// This is a placeholder for future enhancement
		this.logger.debug('System monitoring stop requested (not yet implemented)');
	}
}
