/**
 * Session cleanup scheduler service
 * Runs session cleanup operations on a configurable schedule
 */

import { type BaseCleanupSchedule, BaseCleanupScheduler } from 'utils/base-cleanup-scheduler';

import type { SessionCleanupResult, SessionRetentionManager } from './retention-manager';
import type { SessionStore } from './store';

export type SessionCleanupSchedule = BaseCleanupSchedule;

export class SessionCleanupScheduler extends BaseCleanupScheduler<SessionCleanupSchedule, SessionCleanupResult> {
	private retentionManager: SessionRetentionManager;
	private sessionStore: SessionStore;

	constructor(retentionManager: SessionRetentionManager, sessionStore: SessionStore, schedule: SessionCleanupSchedule) {
		super(schedule, 'Session cleanup scheduler');
		this.retentionManager = retentionManager;
		this.sessionStore = sessionStore;
	}

	/**
	 * Run cleanup on all sessions
	 */
	protected async runCleanup(): Promise<void> {
		if (!this.isRunning) return;

		const startTime = Date.now();
		let totalDeleted = 0;
		let totalCompressed = 0;
		let totalErrors = 0;

		this.logger.debug('Running scheduled session cleanup');

		try {
			const sessions = await this.sessionStore.listSessions();
			const sessionDir = this.sessionStore.getSessionsDir();

			const result = await this.retentionManager.cleanup(sessionDir, sessions);

			totalDeleted += result.deletedSessions.length;
			totalCompressed += result.compressedSessions.length;
			totalErrors += result.errors.length;

			// Show user notification when cleanup actually does something
			const hasActions = result.deletedSessions.length > 0 || result.compressedSessions.length > 0;

			if (result.errors.length > 0) {
				this.logger.warn('Session cleanup completed with errors', {
					compressedCount: result.compressedSessions.length,
					deletedCount: result.deletedSessions.length,
					errorCount: result.errors.length,
					errors: result.errors
				});
			} else if (hasActions) {
				// Log at INFO level when cleanup actually modified sessions
				this.logger.info('Automatic session cleanup completed', {
					compressedCount: result.compressedSessions.length,
					deletedCount: result.deletedSessions.length
				});
				this.logger.debug('Session cleanup details', {
					sizeAfterMB: (result.totalSizeAfter / (1024 * 1024)).toFixed(2),
					sizeBeforeMB: (result.totalSizeBefore / (1024 * 1024)).toFixed(2),
					sizeSavedMB: ((result.totalSizeBefore - result.totalSizeAfter) / (1024 * 1024)).toFixed(2)
				});
			} else {
				// No actions taken - log at debug level only
				this.logger.debug('Session cleanup completed successfully - no sessions to clean');
			}
		} catch (error) {
			totalErrors++;
			this.logger.error('Failed to run session cleanup', error instanceof Error ? error : undefined);
		}

		const duration = Date.now() - startTime;

		// Log simple message at info level
		this.logger.debug('Scheduled session cleanup cycle completed');

		// Log detailed statistics only at debug level (requires log_level='debug' in config)
		this.logger.debug('Session cleanup statistics', {
			durationMs: duration,
			totalCompressed,
			totalDeleted,
			totalErrors
		});
	}

	/**
	 * Run cleanup immediately (manual trigger)
	 */
	async runNow(): Promise<SessionCleanupResult> {
		this.logger.info('Running manual session cleanup');

		try {
			const sessions = await this.sessionStore.listSessions();
			const sessionDir = this.sessionStore.getSessionsDir();

			const result = await this.retentionManager.cleanup(sessionDir, sessions);

			this.logger.info('Manual session cleanup completed');
			this.logger.info('Manual cleanup details', {
				compressedCount: result.compressedSessions.length,
				deletedCount: result.deletedSessions.length
			});

			return result;
		} catch (error) {
			this.logger.error('Manual session cleanup failed', error instanceof Error ? error : undefined);
			throw error;
		}
	}
}
