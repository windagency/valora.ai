/**
 * Monitoring command definitions for CLI
 *
 * Provides access to performance metrics, profiling data, and system monitoring.
 */

import type { CommandAdapter } from 'cli/command-adapter.interface';

import { getColorAdapter } from 'output/color-adapter.interface';
import { formatError } from 'utils/error-handler';
import { createHeapSnapshot } from 'utils/heap-profiler';
import { exportMetricsPrometheus, getMetricsCollector, getMetricsSnapshot } from 'utils/metrics-collector';
import { generatePerformanceReport, getPerformanceProfiler } from 'utils/performance-profiler';
import { getCurrentResourceUsage, getResourceMonitor, getResourceStats } from 'utils/resource-monitor';

/**
 * Display CPU information
 */
function displayCPUInfo(
	usage: Awaited<ReturnType<typeof getCurrentResourceUsage>>,
	color: ReturnType<typeof getColorAdapter>
): void {
	console.log(`\n${color.green('🧠 CPU:')}`);
	console.log(`Usage: ${usage.cpu.usage.toFixed(1)}%`);
	console.log(`Cores: ${usage.cpu.cores}`);
	console.log(`Model: ${usage.cpu.model}`);
	console.log(`Load Average: ${usage.cpu.loadAverage.map((l) => l.toFixed(2)).join(', ')} (1m, 5m, 15m)`);
}

/**
 * Display memory information
 */
function displayMemoryInfo(
	usage: Awaited<ReturnType<typeof getCurrentResourceUsage>>,
	color: ReturnType<typeof getColorAdapter>
): void {
	console.log(`\n${color.blue('💾 Memory:')}`);
	console.log(`Total: ${(usage.memory.total / 1024 / 1024 / 1024).toFixed(2)}GB`);
	console.log(`Used: ${(usage.memory.used / 1024 / 1024 / 1024).toFixed(2)}GB`);
	console.log(`Free: ${(usage.memory.free / 1024 / 1024 / 1024).toFixed(2)}GB`);
	console.log(`Usage: ${usage.memory.usagePercent.toFixed(1)}%`);

	if (usage.memory.swapTotal) {
		console.log(`Swap Total: ${(usage.memory.swapTotal / 1024 / 1024 / 1024).toFixed(2)}GB`);
		console.log(`Swap Used: ${((usage.memory.swapUsed ?? 0) / 1024 / 1024 / 1024).toFixed(2)}GB`);
	}
}

/**
 * Display disk information
 */
function displayDiskInfo(
	usage: Awaited<ReturnType<typeof getCurrentResourceUsage>>,
	color: ReturnType<typeof getColorAdapter>
): void {
	console.log(`\n${color.yellow('💽 Disk:')}`);
	console.log(`Total: ${usage.disk.total > 0 ? (usage.disk.total / 1024 / 1024 / 1024).toFixed(2) + 'GB' : 'N/A'}`);
	console.log(`Used: ${usage.disk.used > 0 ? (usage.disk.used / 1024 / 1024 / 1024).toFixed(2) + 'GB' : 'N/A'}`);
	console.log(`Free: ${usage.disk.free > 0 ? (usage.disk.free / 1024 / 1024 / 1024).toFixed(2) + 'GB' : 'N/A'}`);
	console.log(`Usage: ${usage.disk.usagePercent > 0 ? usage.disk.usagePercent.toFixed(1) + '%' : 'N/A'}`);
}

/**
 * Display process information
 */
function displayProcessInfo(
	usage: Awaited<ReturnType<typeof getCurrentResourceUsage>>,
	color: ReturnType<typeof getColorAdapter>
): void {
	console.log(`\n${color.magenta('🔧 Process:')}`);
	console.log(`PID: ${usage.process.pid}`);
	console.log(`Uptime: ${(usage.process.uptime / 60).toFixed(1)} minutes`);
	console.log(`Memory RSS: ${(usage.process.memoryUsage.rss / 1024 / 1024).toFixed(2)}MB`);
	console.log(`Heap Used: ${(usage.process.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`);
	console.log(`Heap Total: ${(usage.process.memoryUsage.heapTotal / 1024 / 1024).toFixed(2)}MB`);
	console.log(`External Memory: ${(usage.process.memoryUsage.external / 1024 / 1024).toFixed(2)}MB`);
	console.log(`CPU User: ${(usage.process.cpuUsage.user / 1000000).toFixed(2)}s`);
	console.log(`CPU System: ${(usage.process.cpuUsage.system / 1000000).toFixed(2)}s`);

	if (usage.process.threadCount) {
		console.log(`Threads: ${usage.process.threadCount}`);
	}
}

/**
 * Display monitoring status
 */
function displayMonitoringStatus(
	stats: ReturnType<typeof getResourceStats>,
	color: ReturnType<typeof getColorAdapter>
): void {
	console.log(`\n${color.cyan('📊 Monitoring Status:')}`);
	console.log(`Active: ${stats.monitoringActive ? '✅' : '❌'}`);
	console.log(`Uptime: ${(stats.uptime / 1000 / 60).toFixed(1)} minutes`);
	console.log(`Interval: ${stats.intervalMs}ms`);
}

/**
 * Display network information
 */
function displayNetworkInfo(
	usage: Awaited<ReturnType<typeof getCurrentResourceUsage>>,
	color: ReturnType<typeof getColorAdapter>
): void {
	if (!usage.network) return;

	console.log(`\n${color.gray('🌐 Network (Basic):')}`);
	console.log(`RX Bytes: ${usage.network.rxBytes.toLocaleString()}`);
	console.log(`TX Bytes: ${usage.network.txBytes.toLocaleString()}`);
	console.log(`RX Packets: ${usage.network.rxPackets.toLocaleString()}`);
	console.log(`TX Packets: ${usage.network.txPackets.toLocaleString()}`);
}

/**
 * Configure monitoring command
 */
export function configureMonitoringCommand(program: CommandAdapter): void {
	const monitoringCmd = program.command('monitoring').description('Performance monitoring and metrics');

	// Metrics subcommand
	monitoringCmd
		.command('metrics')
		.description('Show current metrics snapshot')
		.option('-f, --format <format>', 'Output format (json|prometheus)', 'json')
		.action((options: Record<string, unknown>) => {
			const color = getColorAdapter();
			try {
				if (options['format'] === 'prometheus') {
					console.log(exportMetricsPrometheus());
				} else {
					const snapshot = getMetricsSnapshot();

					console.log(JSON.stringify(snapshot, null, 2));

					// Show summary

					console.log(`\n${color.blue('📊 Metrics Summary:')}`);

					console.log(`Counters: ${snapshot.counters.length}`);

					console.log(`Gauges: ${snapshot.gauges.length}`);

					console.log(`Histograms: ${snapshot.histograms.length}`);

					console.log(`Uptime: ${(snapshot.uptime / 1000 / 60).toFixed(1)} minutes`);
				}
			} catch (error) {
				console.error(color.red('Failed to get metrics:'), formatError(error as Error));
				process.exit(1);
			}
		});

	// Performance subcommand
	monitoringCmd
		.command('performance')
		.description('Show performance profiling report')
		.option('-d, --detailed', 'Show detailed profiling data', false)
		.action((options: Record<string, unknown>) => {
			const color = getColorAdapter();
			try {
				const profiler = getPerformanceProfiler();
				const report = generatePerformanceReport();

				console.log(color.blue('🚀 Performance Report'));

				console.log('='.repeat(50));

				console.log(`Total Profiles: ${report.totalProfiles.toLocaleString()}`);

				console.log(`Average Duration: ${report.averageDuration.toFixed(2)}ms`);

				console.log(`Report Generated: ${new Date(report.timestamp).toISOString()}`);

				console.log(`Performance Entries: ${report.performanceEntries.length}`);

				if (report.slowestOperations.length > 0) {
					console.log(`\n${color.yellow('🐌 Slowest Operations:')}`);
					report.slowestOperations.slice(0, 5).forEach((op, i) => {
						console.log(`${i + 1}. ${op.operation}: ${op.duration.toFixed(2)}ms`);
						if (op.labels) {
							console.log(`   Labels: ${JSON.stringify(op.labels)}`);
						}
					});
				}

				console.log(`\n${color.green('💾 Memory Statistics:')}`);

				console.log(`Average Heap Δ: ${(report.memoryStats.averageDelta.heapUsed / 1024).toFixed(2)}KB`);

				console.log(`Peak Heap Usage: ${(report.memoryStats.peakUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`);

				console.log(`\n${color.cyan('⚡ CPU Statistics:')}`);

				console.log(`Average User Time: ${(report.cpuStats.averageUserTime / 1000).toFixed(2)}ms`);

				console.log(`Average System Time: ${(report.cpuStats.averageSystemTime / 1000).toFixed(2)}ms`);

				console.log(`Total User Time: ${(report.cpuStats.totalUserTime / 1000000).toFixed(2)}s`);

				console.log(`Total System Time: ${(report.cpuStats.totalSystemTime / 1000000).toFixed(2)}s`);

				if (options['detailed'] as boolean) {
					console.log(`\n${color.magenta('🔍 Detailed Profiling Data:')}`);
					const recentProfiles = profiler.getRecentProfiles(undefined, 10);
					recentProfiles.forEach((profile, i) => {
						console.log(`${i + 1}. ${profile.operation}`);

						console.log(`   Duration: ${profile.duration.toFixed(2)}ms`);

						console.log(`   Time: ${new Date(profile.startTime).toISOString()}`);

						if (profile.memoryUsage) {
							const delta = profile.memoryUsage.delta;

							console.log(`   Memory Δ: ${(delta.heapUsed / 1024).toFixed(2)}KB heap`);
						}

						if (profile.cpuUsage) {
							const delta = profile.cpuUsage.delta;

							console.log(
								`   CPU Δ: ${(delta.user / 1000).toFixed(2)}ms user, ${(delta.system / 1000).toFixed(2)}ms system`
							);
						}

						if (profile.labels) {
							console.log(`   Labels: ${JSON.stringify(profile.labels)}`);
						}

						console.log('');
					});
				}
			} catch (error) {
				console.error(color.red('Failed to generate performance report:'), formatError(error as Error));
				process.exit(1);
			}
		});

	// Resources subcommand
	monitoringCmd
		.command('resources')
		.description('Show current resource usage')
		.action(async () => {
			const color = getColorAdapter();
			try {
				const usage = await getCurrentResourceUsage();
				const stats = getResourceStats();

				console.log(color.blue('🖥️  System Resource Usage'));
				console.log('='.repeat(50));
				console.log(`Timestamp: ${new Date(usage.timestamp).toISOString()}`);

				displayCPUInfo(usage, color);
				displayMemoryInfo(usage, color);
				displayDiskInfo(usage, color);
				displayProcessInfo(usage, color);
				displayMonitoringStatus(stats, color);
				if (usage.network) {
					displayNetworkInfo(usage, color);
				}
			} catch (err) {
				console.error(color.red('Failed to get resource usage:'), formatError(err as Error));
				process.exit(1);
			}
		});

	// Status subcommand
	monitoringCmd
		.command('status')
		.description('Show monitoring system status')
		.action(() => {
			const color = getColorAdapter();
			try {
				const metricsStats = getMetricsCollector().getStats();
				const profilerStats = getPerformanceProfiler().getStats();
				const resourceStats = getResourceMonitor().getStats();

				console.log(color.blue('📈 Monitoring System Status'));

				console.log('='.repeat(50));

				console.log(`\n${color.green('📊 Metrics Collector:')}`);

				console.log(`Uptime: ${(metricsStats.uptime / 1000 / 60).toFixed(1)} minutes`);

				console.log(`Counters: ${metricsStats.counters}`);

				console.log(`Gauges: ${metricsStats.gauges}`);

				console.log(`Histograms: ${metricsStats.histograms}`);

				console.log(`\n${color.blue('🚀 Performance Profiler:')}`);

				console.log(`Total Profiles: ${profilerStats.totalProfiles}`);

				console.log(`Memory Profiles: ${profilerStats.memoryProfiles}`);

				console.log(`CPU Profiles: ${profilerStats.cpuProfiles}`);

				console.log(`Average Duration: ${profilerStats.averageDuration.toFixed(2)}ms`);

				console.log(
					`Oldest Profile: ${profilerStats.oldestProfile ? new Date(profilerStats.oldestProfile).toISOString() : 'None'}`
				);

				console.log(
					`Newest Profile: ${profilerStats.newestProfile ? new Date(profilerStats.newestProfile).toISOString() : 'None'}`
				);

				console.log(`\n${color.yellow('🖥️  Resource Monitor:')}`);

				console.log(`Monitoring Active: ${resourceStats.monitoringActive ? '✅' : '❌'}`);

				console.log(`Uptime: ${(resourceStats.uptime / 1000 / 60).toFixed(1)} minutes`);

				console.log(`Interval: ${resourceStats.intervalMs}ms`);
			} catch (error) {
				console.error(color.red('Failed to get monitoring status:'), formatError(error as Error));
				process.exit(1);
			}
		});

	// Documentation subcommand
	monitoringCmd
		.command('docs')
		.description('Lint documentation files')
		.option('-f, --format <format>', 'Output format (json|table)', 'table')
		.option('--check-links', 'Enable link validation', true)
		.option('--check-code-examples', 'Enable code example validation', true)
		.option('--check-api-completeness', 'Enable API documentation completeness checks', false)
		.option('--check-freshness', 'Enable documentation freshness checks', false)
		.option('--max-errors <number>', 'Maximum number of errors before failing', '0')
		.option('--max-warnings <number>', 'Maximum number of warnings before failing', '0')
		.action(async (options) => {
			const color = getColorAdapter();
			try {
				const { lintDocumentation } = await import('utils/docs-linter');

				console.log(color.blue('🔍 Linting Documentation Files'));

				console.log('='.repeat(50));

				const { codeValidation, results, stats } = await lintDocumentation({
					checkApiCompleteness: options['checkApiCompleteness'] as boolean | undefined,
					checkCodeExamples: options['checkCodeExamples'] as boolean | undefined,
					checkFreshness: options['checkFreshness'] as boolean | undefined,
					checkLinks: options['checkLinks'] as boolean | undefined
				});

				// Display results
				if (options['format'] === 'json') {
					console.log(JSON.stringify({ codeValidation, results, stats }, null, 2));
				} else {
					// Table format

					console.log(
						`📊 Summary: ${stats.totalFiles} files, ${stats.totalLines} lines, ${stats.totalLinks} links, ${stats.totalCodeBlocks} code blocks`
					);

					console.log(`📈 Issues: ${stats.errors} errors, ${stats.warnings} warnings, ${stats.info} info`);

					if (results.length > 0) {
						console.log(`\n${color.red('🚨 Issues Found:')}`);
						results.slice(0, 20).forEach((result, i) => {
							const severityColor =
								result.severity === 'error' ? color.red : result.severity === 'warning' ? color.yellow : color.blue;

							console.log(
								`${i + 1}. ${severityColor(result.severity.toUpperCase())} ${result.file}:${result.line ?? '?'} - ${result.message}`
							);
							if (result.suggestion) {
								console.log(`   💡 ${result.suggestion}`);
							}
						});

						if (results.length > 20) {
							console.log(`\n... and ${results.length - 20} more issues`);
						}
					}

					if (codeValidation.length > 0) {
						console.log(`\n${color.cyan('💻 Code Validation:')}`);
						codeValidation.slice(0, 5).forEach((validation, i) => {
							if (validation.errors.length > 0 || validation.warnings.length > 0) {
								console.log(`${i + 1}. ${validation.language} (${validation.lineStart}-${validation.lineEnd}):`);
								validation.errors.forEach((error) => {
									console.log(`   ❌ ${error}`);
								});
								validation.warnings.forEach((warning) => {
									console.log(`   ⚠️  ${warning}`);
								});
							}
						});
					}
				}

				// Check thresholds
				const maxErrors = parseInt(options['maxErrors'] as string);
				const maxWarnings = parseInt(options['maxWarnings'] as string);
				const hasTooManyErrors = stats.errors > maxErrors;
				const hasTooManyWarnings = stats.warnings > maxWarnings;

				if (hasTooManyErrors || hasTooManyWarnings) {
					console.log(`\n${color.red('❌ Documentation quality check failed')}`);
					if (hasTooManyErrors) {
						console.log(`   Errors: ${stats.errors} (max allowed: ${maxErrors})`);
					}
					if (hasTooManyWarnings) {
						console.log(`   Warnings: ${stats.warnings} (max allowed: ${maxWarnings})`);
					}
					process.exit(1);
				} else {
					console.log(`\n${color.green('✅ Documentation quality check passed')}`);
				}
			} catch (error) {
				console.error(color.red('Failed to lint documentation:'), formatError(error as Error));
				process.exit(1);
			}
		});

	// Heap dump subcommand
	monitoringCmd
		.command('heap-dump')
		.description('Trigger a V8 heap snapshot')
		.option('-o, --out <path>', 'Output directory', './heap-dumps')
		.option('-p, --prefix <prefix>', 'File prefix', 'manual-dump')
		.action((options: Record<string, unknown>) => {
			const color = getColorAdapter();
			try {
				console.log(color.blue('📸 creating heap snapshot...'));
				const path = createHeapSnapshot({
					directory: options['out'] as string | undefined,
					prefix: options['prefix'] as string | undefined
				});

				console.log(color.green(`✅ Heap snapshot created at: ${path}`));

				console.log(color.gray('You can analyze this file using Chrome DevTools (Memory tab)'));
			} catch (error) {
				console.error(color.red('Failed to create heap snapshot:'), formatError(error as Error));
				process.exit(1);
			}
		});

	// Reset subcommand
	monitoringCmd
		.command('reset')
		.description('Reset all monitoring data')
		.action(() => {
			const color = getColorAdapter();
			try {
				getMetricsCollector().reset();
				getPerformanceProfiler().clearProfiles();

				console.log(color.green('✅ All monitoring data has been reset'));
			} catch (error) {
				console.error(color.red('Failed to reset monitoring data:'), formatError(error as Error));
				process.exit(1);
			}
		});
}
