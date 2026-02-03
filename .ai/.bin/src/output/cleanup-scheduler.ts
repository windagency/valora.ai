/**
 * Automated cleanup scheduler service
 * Runs log cleanup operations on a configurable schedule
 */

import { BYTES_PER_MB } from 'config/constants';
import { type BaseCleanupSchedule, BaseCleanupScheduler } from 'utils/base-cleanup-scheduler';
import { formatErrorMessage } from 'utils/error-handler';

import type { CleanupResult, RetentionManager } from './retention-manager';

export interface CleanupSchedule extends BaseCleanupSchedule {
	logDirs: string[]; // Directories to clean
}

export class CleanupScheduler extends BaseCleanupScheduler<CleanupSchedule, { [logDir: string]: CleanupResult }> {
	private retentionManager: RetentionManager;

	constructor(retentionManager: RetentionManager, schedule: CleanupSchedule) {
		super(schedule, 'Log cleanup scheduler');
		this.retentionManager = retentionManager;
	}

	/**
	 * Run cleanup on all configured directories
	 */
	protected async runCleanup(): Promise<void> {
		if (!this.isRunning) return;

		const startTime = Date.now();

		this.logger.debug('Running scheduled log cleanup');

		// Process all directories in parallel
		const results = await Promise.allSettled(
			this.schedule.logDirs.map(async (logDir) => {
				const result = await this.retentionManager.cleanup(logDir);

				if (result.errors.length > 0) {
					this.logger.warn('Cleanup completed with errors', {
						compressedCount: result.compressedFiles.length,
						deletedCount: result.deletedFiles.length,
						errorCount: result.errors.length,
						errors: result.errors,
						logDir
					});
				} else {
					this.logger.debug('Cleanup completed successfully', {
						compressedCount: result.compressedFiles.length,
						deletedCount: result.deletedFiles.length,
						logDir,
						sizeAfterMB: (result.totalSizeAfter / BYTES_PER_MB).toFixed(2),
						sizeBeforeMB: (result.totalSizeBefore / BYTES_PER_MB).toFixed(2)
					});
				}

				return result;
			})
		);

		// Aggregate totals from all results
		const { totalCompressed, totalDeleted, totalErrors } = results.reduce(
			(totals, result, index) => {
				if (result.status === 'fulfilled') {
					return {
						totalCompressed: totals.totalCompressed + result.value.compressedFiles.length,
						totalDeleted: totals.totalDeleted + result.value.deletedFiles.length,
						totalErrors: totals.totalErrors + result.value.errors.length
					};
				} else {
					this.logger.error('Failed to cleanup directory', result.reason instanceof Error ? result.reason : undefined, {
						logDir: this.schedule.logDirs[index]
					});
					return {
						...totals,
						totalErrors: totals.totalErrors + 1
					};
				}
			},
			{ totalCompressed: 0, totalDeleted: 0, totalErrors: 0 }
		);

		const duration = Date.now() - startTime;
		this.logger.debug('Scheduled cleanup cycle completed', {
			durationMs: duration,
			totalCompressed,
			totalDeleted,
			totalDirectories: this.schedule.logDirs.length,
			totalErrors
		});
	}

	/**
	 * Run cleanup immediately (manual trigger)
	 */
	async runNow(): Promise<{ [logDir: string]: CleanupResult }> {
		this.logger.info('Running manual cleanup');

		// Process all directories in parallel
		const cleanupResults = await Promise.allSettled(
			this.schedule.logDirs.map((logDir) =>
				this.retentionManager.cleanup(logDir).then((result) => ({ logDir, result }))
			)
		);

		// Build results object from settled promises
		const results = cleanupResults.reduce<{ [logDir: string]: CleanupResult }>((acc, settledResult, index) => {
			const logDir = this.schedule.logDirs[index];

			// Guard against undefined logDir (should never happen but satisfies TypeScript)
			if (logDir === undefined) {
				this.logger.error('Unexpected undefined logDir at index', undefined, { index });
				return acc;
			}

			if (settledResult.status === 'fulfilled') {
				acc[logDir] = settledResult.value.result;
			} else {
				const error: unknown = settledResult.reason;
				this.logger.error('Manual cleanup failed for directory', error instanceof Error ? error : undefined, {
					logDir
				});
				acc[logDir] = {
					compressedFiles: [],
					compressedItems: [],
					deletedFiles: [],
					deletedItems: [],
					errors: [formatErrorMessage(error)],
					totalSizeAfter: 0,
					totalSizeBefore: 0
				};
			}

			return acc;
		}, {});

		this.logger.info('Manual cleanup completed');
		this.logger.debug('Manual cleanup details', {
			directoryCount: Object.keys(results).length
		});

		return results;
	}
}
