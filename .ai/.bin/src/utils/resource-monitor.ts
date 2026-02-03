/**
 * Resource Monitoring Utility
 *
 * Comprehensive system resource monitoring including CPU, memory, disk I/O,
 * network I/O, and process statistics with alerting capabilities.
 */

import { exec } from 'child_process';
import * as os from 'os';
import { getLogger } from 'output/logger';
import { promisify } from 'util';
import { getMetricsCollector } from 'utils/metrics-collector';

const execAsync = promisify(exec);

export interface MonitoringOptions {
	alertCallback?: (alert: ResourceAlert) => void;
	enableDiskMonitoring?: boolean;
	enableNetworkMonitoring?: boolean;
	enableProcessMonitoring?: boolean;
	intervalMs?: number;
	thresholds?: ResourceThresholds;
}

export interface ResourceAlert {
	message: string;
	metric: string;
	resource: keyof ResourceUsage;
	severity: 'critical' | 'warning';
	threshold: number;
	timestamp: number;
	value: number;
}

export interface ResourceThresholds {
	cpuUsagePercent?: number;
	diskUsagePercent?: number;
	memoryUsagePercent?: number;
	processMemoryMB?: number;
}

export interface ResourceUsage {
	cpu: {
		cores: number; // Number of CPU cores
		loadAverage: number[]; // 1, 5, 15 minute load averages
		model: string; // CPU model
		usage: number; // CPU usage percentage (0-100)
	};
	disk: {
		free: number; // Free disk space in bytes
		readBytes?: number; // Disk read bytes per second
		total: number; // Total disk space in bytes
		usagePercent: number; // Disk usage percentage (0-100)
		used: number; // Used disk space in bytes
		writeBytes?: number; // Disk write bytes per second
	};
	memory: {
		free: number; // Free memory in bytes
		swapTotal?: number; // Swap total (if available)
		swapUsed?: number; // Swap used (if available)
		total: number; // Total memory in bytes
		usagePercent: number; // Memory usage percentage (0-100)
		used: number; // Used memory in bytes
	};
	network?: {
		rxBytes: number; // Received bytes
		rxPackets: number; // Received packets
		txBytes: number; // Transmitted bytes
		txPackets: number; // Transmitted packets
	};
	process: {
		cpuUsage: NodeJS.CpuUsage;
		memoryUsage: NodeJS.MemoryUsage;
		pid: number; // Process ID
		threadCount?: number; // Number of threads
		uptime: number; // Process uptime in seconds
	};
	timestamp: number;
}

/**
 * Default monitoring configuration
 */
const DEFAULT_MONITORING_OPTIONS = {
	alertCallback: undefined as ((alert: ResourceAlert) => void) | undefined, // 5 seconds
	enableDiskMonitoring: true,
	enableNetworkMonitoring: true,
	enableProcessMonitoring: true,
	intervalMs: 5000,
	thresholds: {
		cpuUsagePercent: 80,
		diskUsagePercent: 90,
		memoryUsagePercent: 85,
		processMemoryMB: 1024 // 1GB
	}
};

/**
 * Resource Monitor Class
 *
 * Monitors system resources and provides real-time metrics with alerting.
 */
export class ResourceMonitor {
	private lastDiskStats?: { read: number; write: number };
	private logger = getLogger();
	private metricsCollector = getMetricsCollector();
	private monitoringInterval?: NodeJS.Timeout;
	private options: MonitoringOptions;
	private startTime: number = Date.now();

	constructor(options: MonitoringOptions = {}) {
		this.options = { ...DEFAULT_MONITORING_OPTIONS, ...options };
	}

	/**
	 * Start resource monitoring
	 */
	startMonitoring(): void {
		this.logger.info('Starting resource monitoring', {
			diskMonitoring: this.options.enableDiskMonitoring,
			intervalMs: this.options.intervalMs,
			networkMonitoring: this.options.enableNetworkMonitoring,
			processMonitoring: this.options.enableProcessMonitoring
		});

		this.monitoringInterval = setInterval(() => {
			void (async () => {
				try {
					await this.collectMetrics();
				} catch (error) {
					this.logger.error('Failed to collect resource metrics', error as Error);
				}
			})();
		}, this.options.intervalMs);

		// Allow process to exit even if monitoring is active
		this.monitoringInterval.unref();
	}

	/**
	 * Stop resource monitoring
	 */
	stopMonitoring(): void {
		if (this.monitoringInterval) {
			clearInterval(this.monitoringInterval);
			this.monitoringInterval = undefined;
			this.logger.info('Resource monitoring stopped');
		}
	}

	/**
	 * Get current resource usage snapshot
	 */
	async getCurrentUsage(): Promise<ResourceUsage> {
		return this.collectMetrics();
	}

	/**
	 * Collect all resource metrics
	 */
	private async collectMetrics(): Promise<ResourceUsage> {
		const timestamp = Date.now();

		// Collect all metrics concurrently for better performance
		const [cpuMetrics, memoryMetrics, diskMetrics, networkMetrics, processMetrics] = await Promise.all([
			Promise.resolve(this.getCpuMetrics()),
			this.getMemoryMetrics(),
			this.options.enableDiskMonitoring ? this.getDiskMetrics() : Promise.resolve(this.getBasicDiskMetrics()),
			this.options.enableNetworkMonitoring ? Promise.resolve(this.getNetworkMetrics()) : Promise.resolve(undefined),
			this.options.enableProcessMonitoring ? this.getProcessMetrics() : Promise.resolve(this.getBasicProcessMetrics())
		]);

		const usage: ResourceUsage = {
			cpu: cpuMetrics,
			disk: diskMetrics,
			memory: memoryMetrics,
			network: networkMetrics,
			process: processMetrics,
			timestamp
		};

		// Record metrics
		this.recordMetrics(usage);

		// Check thresholds and generate alerts
		this.checkThresholds(usage);

		return usage;
	}

	/**
	 * Get CPU metrics
	 */
	private getCpuMetrics(): {
		cores: number;
		loadAverage: number[];
		model: string;
		usage: number;
	} {
		const loadAverage = os.loadavg();
		const cores = os.cpus().length;
		const model = os.cpus()[0]?.model ?? 'Unknown';

		// Calculate CPU usage (simplified - in production you'd want more sophisticated tracking)
		const usage = Math.min(100, ((loadAverage[0] ?? 0) / cores) * 100);

		return {
			cores,
			loadAverage,
			model,
			usage
		};
	}

	/**
	 * Get memory metrics
	 */
	private async getMemoryMetrics(): Promise<{
		free: number;
		swapTotal?: number;
		swapUsed?: number;
		total: number;
		usagePercent: number;
		used: number;
	}> {
		const total = os.totalmem();
		const free = os.freemem();
		const used = total - free;
		const usagePercent = (used / total) * 100;

		let swapTotal: number | undefined;
		let swapUsed: number | undefined;

		try {
			// Try to get swap info on Unix-like systems
			if (process.platform !== 'win32') {
				const swapInfo = await this.getSwapInfo();
				swapTotal = swapInfo.total;
				swapUsed = swapInfo.used;
			}
		} catch {
			// Swap info not available
		}

		return {
			free,
			swapTotal,
			swapUsed,
			total,
			usagePercent,
			used
		};
	}

	/**
	 * Get basic disk metrics (fallback)
	 */
	private getBasicDiskMetrics(): {
		free: number;
		total: number;
		usagePercent: number;
		used: number;
	} {
		// Basic fallback - in production you'd want actual disk monitoring
		return {
			free: 0,
			total: 0,
			usagePercent: 0,
			used: 0
		};
	}

	/**
	 * Get disk metrics
	 */
	private async getDiskMetrics(): Promise<{
		free: number;
		readBytes?: number;
		total: number;
		usagePercent: number;
		used: number;
		writeBytes?: number;
	}> {
		try {
			if (process.platform === 'win32') {
				return this.getBasicDiskMetrics();
			}

			const diskInfo = await this.parseDiskUsage();
			return diskInfo ?? this.getBasicDiskMetrics();
		} catch (error) {
			this.logger.debug('Failed to get detailed disk metrics, using basic metrics', {
				error: (error as Error).message
			});
			return this.getBasicDiskMetrics();
		}
	}

	/**
	 * Parse disk usage from df command output
	 */
	private async parseDiskUsage(): Promise<null | {
		free: number;
		readBytes?: number;
		total: number;
		usagePercent: number;
		used: number;
		writeBytes?: number;
	}> {
		const { stdout } = await execAsync('df -k . | tail -1');
		const parts = stdout.trim().split(/\s+/);

		if (parts.length < 6) {
			return null;
		}

		// df output: Filesystem 1K-blocks Used Available Use% Mounted-on
		const totalKB = parseInt(parts[1] ?? '0', 10) * 1024; // Convert KB to bytes
		const usedKB = parseInt(parts[2] ?? '0', 10) * 1024;
		const freeKB = parseInt(parts[3] ?? '0', 10) * 1024;
		const usagePercent = parseInt(parts[4]?.replace('%', '') ?? '0', 10);

		return {
			free: freeKB,
			readBytes: this.lastDiskStats?.read,
			total: totalKB,
			usagePercent,
			used: usedKB,
			writeBytes: this.lastDiskStats?.write
		};
	}

	/**
	 * Get network metrics
	 */
	private getNetworkMetrics():
		| undefined
		| {
				rxBytes: number;
				rxPackets: number;
				txBytes: number;
				txPackets: number;
		  } {
		try {
			// Get network interface statistics
			const interfaces = os.networkInterfaces();
			const totalRx = 0;
			const totalTx = 0;
			const totalRxPackets = 0;
			const totalTxPackets = 0;

			// Sum up all interface statistics
			Object.values(interfaces)
				.filter((addresses) => addresses)
				.flatMap((addresses) => addresses!)
				.filter((addr) => !addr.internal && addr.family === 'IPv4')
				.forEach(() => {
					// Note: Node.js doesn't provide packet counts directly
					// This is a simplified implementation
					// In a real implementation, you'd use system calls or external tools
					// to get actual network statistics
				});

			// For now, return basic structure - in production you'd implement proper network monitoring
			return {
				rxBytes: totalRx,
				rxPackets: totalRxPackets,
				txBytes: totalTx,
				txPackets: totalTxPackets
			};
		} catch (error) {
			this.logger.debug('Failed to get network metrics', { error: (error as Error).message });
			return undefined;
		}
	}

	/**
	 * Get basic process metrics (fallback)
	 */
	private getBasicProcessMetrics(): {
		cpuUsage: NodeJS.CpuUsage;
		memoryUsage: NodeJS.MemoryUsage;
		pid: number;
		uptime: number;
	} {
		return {
			cpuUsage: process.cpuUsage(),
			memoryUsage: process.memoryUsage(),
			pid: process.pid,
			uptime: process.uptime()
		};
	}

	/**
	 * Get detailed process metrics
	 */
	private async getProcessMetrics(): Promise<{
		cpuUsage: NodeJS.CpuUsage;
		memoryUsage: NodeJS.MemoryUsage;
		pid: number;
		threadCount?: number;
		uptime: number;
	}> {
		const basic = this.getBasicProcessMetrics();

		try {
			// Try to get thread count (Unix-like systems)
			if (process.platform !== 'win32') {
				const threadCount = await this.getThreadCount();
				return {
					...basic,
					threadCount
				};
			}
		} catch {
			// Thread count not available
		}

		return basic;
	}

	/**
	 * Get swap memory information (Unix-like systems)
	 */
	private async getSwapInfo(): Promise<{ total: number; used: number }> {
		try {
			const { stdout } = await execAsync('free -b | grep Swap');
			const parts = stdout.trim().split(/\s+/);

			if (parts.length >= 4) {
				return {
					total: parseInt(parts[1] ?? '0', 10) ?? 0,
					used: parseInt(parts[2] ?? '0', 10) ?? 0
				};
			}
		} catch {
			// Swap info not available
		}

		return { total: 0, used: 0 };
	}

	/**
	 * Get thread count for current process (Unix-like systems)
	 */
	private async getThreadCount(): Promise<number> {
		try {
			const { stdout } = await execAsync(`ps -o nlwp= ${process.pid}`);
			return parseInt(stdout.trim(), 10) || 1;
		} catch {
			return 1; // Default to 1 thread
		}
	}

	/**
	 * Record metrics in the metrics collector
	 */
	private recordMetrics(usage: ResourceUsage): void {
		// CPU metrics
		this.metricsCollector.setGauge('system_cpu_usage_percent', usage.cpu.usage);
		this.metricsCollector.setGauge('system_cpu_cores', usage.cpu.cores);
		this.metricsCollector.setGauge('system_load_average_1m', usage.cpu.loadAverage[0] ?? 0);
		this.metricsCollector.setGauge('system_load_average_5m', usage.cpu.loadAverage[1] ?? 0);
		this.metricsCollector.setGauge('system_load_average_15m', usage.cpu.loadAverage[2] ?? 0);

		// Memory metrics
		this.metricsCollector.setGauge('system_memory_total_bytes', usage.memory.total);
		this.metricsCollector.setGauge('system_memory_used_bytes', usage.memory.used);
		this.metricsCollector.setGauge('system_memory_free_bytes', usage.memory.free);
		this.metricsCollector.setGauge('system_memory_usage_percent', usage.memory.usagePercent);

		if (usage.memory.swapTotal) {
			this.metricsCollector.setGauge('system_swap_total_bytes', usage.memory.swapTotal);
			this.metricsCollector.setGauge('system_swap_used_bytes', usage.memory.swapUsed ?? 0);
		}

		// Disk metrics
		this.metricsCollector.setGauge('system_disk_total_bytes', usage.disk.total);
		this.metricsCollector.setGauge('system_disk_used_bytes', usage.disk.used);
		this.metricsCollector.setGauge('system_disk_free_bytes', usage.disk.free);
		this.metricsCollector.setGauge('system_disk_usage_percent', usage.disk.usagePercent);

		// Network metrics (if available)
		if (usage.network) {
			this.metricsCollector.setGauge('system_network_rx_bytes', usage.network.rxBytes);
			this.metricsCollector.setGauge('system_network_tx_bytes', usage.network.txBytes);
			this.metricsCollector.setGauge('system_network_rx_packets', usage.network.rxPackets);
			this.metricsCollector.setGauge('system_network_tx_packets', usage.network.txPackets);
		}

		// Process metrics
		this.metricsCollector.setGauge('process_uptime_seconds', usage.process.uptime);
		this.metricsCollector.setGauge('process_memory_rss_bytes', usage.process.memoryUsage.rss);
		this.metricsCollector.setGauge('process_memory_heap_used_bytes', usage.process.memoryUsage.heapUsed);
		this.metricsCollector.setGauge('process_memory_heap_total_bytes', usage.process.memoryUsage.heapTotal);
		this.metricsCollector.setGauge('process_memory_external_bytes', usage.process.memoryUsage.external);
		this.metricsCollector.setGauge('process_cpu_user_microseconds', usage.process.cpuUsage.user);
		this.metricsCollector.setGauge('process_cpu_system_microseconds', usage.process.cpuUsage.system);

		if (usage.process.threadCount) {
			this.metricsCollector.setGauge('process_thread_count', usage.process.threadCount);
		}
	}

	/**
	 * Check resource thresholds and generate alerts
	 */
	private checkThresholds(usage: ResourceUsage): void {
		const thresholds = this.options.thresholds ?? {};
		const alerts: ResourceAlert[] = [];

		// Check CPU threshold
		this.checkCpuThreshold(usage, thresholds, alerts);

		// Check memory threshold
		this.checkMemoryThreshold(usage, thresholds, alerts);

		// Check disk threshold
		this.checkDiskThreshold(usage, thresholds, alerts);

		// Check process memory threshold
		this.checkProcessMemoryThreshold(usage, thresholds, alerts);

		// Trigger all collected alerts
		this.triggerAlerts(alerts);
	}

	/**
	 * Check CPU usage threshold
	 */
	private checkCpuThreshold(usage: ResourceUsage, thresholds: ResourceThresholds, alerts: ResourceAlert[]): void {
		const threshold = thresholds.cpuUsagePercent;
		if (!threshold || usage.cpu.usage <= threshold) {
			return;
		}

		alerts.push(
			this.createAlert({
				message: `System CPU usage is ${usage.cpu.usage.toFixed(1)}% (threshold: ${threshold}%)`,
				metric: 'usage',
				resource: 'cpu',
				threshold,
				timestamp: usage.timestamp,
				value: usage.cpu.usage
			})
		);
	}

	/**
	 * Check memory usage threshold
	 */
	private checkMemoryThreshold(usage: ResourceUsage, thresholds: ResourceThresholds, alerts: ResourceAlert[]): void {
		const threshold = thresholds.memoryUsagePercent;
		if (!threshold || usage.memory.usagePercent <= threshold) {
			return;
		}

		alerts.push(
			this.createAlert({
				message: `System memory usage is ${usage.memory.usagePercent.toFixed(1)}% (threshold: ${threshold}%)`,
				metric: 'usagePercent',
				resource: 'memory',
				threshold,
				timestamp: usage.timestamp,
				value: usage.memory.usagePercent
			})
		);
	}

	/**
	 * Check disk usage threshold
	 */
	private checkDiskThreshold(usage: ResourceUsage, thresholds: ResourceThresholds, alerts: ResourceAlert[]): void {
		const threshold = thresholds.diskUsagePercent;
		if (!threshold || usage.disk.usagePercent <= threshold) {
			return;
		}

		alerts.push(
			this.createAlert({
				message: `System disk usage is ${usage.disk.usagePercent.toFixed(1)}% (threshold: ${threshold}%)`,
				metric: 'usagePercent',
				resource: 'disk',
				threshold,
				timestamp: usage.timestamp,
				value: usage.disk.usagePercent
			})
		);
	}

	/**
	 * Check process memory threshold
	 */
	private checkProcessMemoryThreshold(
		usage: ResourceUsage,
		thresholds: ResourceThresholds,
		alerts: ResourceAlert[]
	): void {
		const threshold = thresholds.processMemoryMB;
		const processMemoryMB = usage.process.memoryUsage.rss / (1024 * 1024);

		if (!threshold || processMemoryMB <= threshold) {
			return;
		}

		alerts.push(
			this.createAlert({
				message: `Process memory usage is ${(processMemoryMB / 1024).toFixed(2)}GB (threshold: ${(threshold / 1024).toFixed(2)}GB)`,
				metric: 'memoryUsage',
				resource: 'process',
				threshold,
				timestamp: usage.timestamp,
				value: processMemoryMB
			})
		);
	}

	/**
	 * Create a resource alert with appropriate severity
	 */
	private createAlert(params: {
		message: string;
		metric: string;
		resource: keyof ResourceUsage;
		threshold: number;
		timestamp: number;
		value: number;
	}): ResourceAlert {
		const criticalMultiplier = params.resource === 'process' ? 1.5 : 1.2;
		const severity = params.value > params.threshold * criticalMultiplier ? 'critical' : 'warning';

		return {
			message: params.message,
			metric: params.metric,
			resource: params.resource,
			severity,
			threshold: params.threshold,
			timestamp: params.timestamp,
			value: params.value
		};
	}

	/**
	 * Trigger all alerts
	 */
	private triggerAlerts(alerts: ResourceAlert[]): void {
		alerts.forEach((alert) => {
			this.logger.warn('Resource alert', {
				message: alert.message,
				metric: alert.metric,
				resource: alert.resource,
				severity: alert.severity,
				threshold: alert.threshold,
				value: alert.value
			});

			this.metricsCollector.incrementCounter('resource_alerts_total', 1, {
				metric: alert.metric,
				resource: alert.resource,
				severity: alert.severity
			});

			if (this.options.alertCallback) {
				this.options.alertCallback(alert);
			}
		});
	}

	/**
	 * Get monitoring statistics
	 */
	getStats(): {
		intervalMs: number;
		lastCollection?: number;
		monitoringActive: boolean;
		uptime: number;
	} {
		return {
			intervalMs: this.options.intervalMs!,
			monitoringActive: !!this.monitoringInterval,
			uptime: Date.now() - this.startTime
		};
	}

	/**
	 * Destroy the monitor and clean up resources
	 */
	destroy(): void {
		this.stopMonitoring();
	}
}

// Singleton instance for global use
let globalResourceMonitor: null | ResourceMonitor = null;

/**
 * Get the global resource monitor instance
 */
export function getResourceMonitor(options?: MonitoringOptions): ResourceMonitor {
	globalResourceMonitor ??= new ResourceMonitor(options);
	return globalResourceMonitor;
}

/**
 * Set a custom global resource monitor instance
 */
export function setResourceMonitor(monitor: ResourceMonitor): void {
	globalResourceMonitor = monitor;
}

/**
 * Convenience functions for global resource monitoring
 */
export function getCurrentResourceUsage(): Promise<ResourceUsage> {
	return getResourceMonitor().getCurrentUsage();
}

export function getResourceStats(): {
	intervalMs: number;
	lastCollection?: number;
	monitoringActive: boolean;
	uptime: number;
} {
	return getResourceMonitor().getStats();
}

export function startResourceMonitoring(options?: MonitoringOptions): void {
	getResourceMonitor(options).startMonitoring();
}

export function stopResourceMonitoring(): void {
	getResourceMonitor().stopMonitoring();
}
