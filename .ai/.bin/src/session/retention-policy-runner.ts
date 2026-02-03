/**
 * Retention Policy Runner
 * Synchronous utility to run session retention policy from config
 */

import { getConfigLoader } from 'config/loader';
import { getLogger } from 'output/logger';
import { formatErrorMessage } from 'utils/error-utils';

import { type SessionCleanupResult, SessionRetentionManager, type SessionRetentionPolicy } from './retention-manager';
import { SessionStore } from './store';

/**
 * Run the retention policy from config synchronously
 */
export async function runRetentionPolicy(dryRun = false): Promise<SessionCleanupResult> {
	const logger = getLogger();
	const configLoader = getConfigLoader();
	const config = await configLoader.load();

	// Get retention policy from config
	const policy: SessionRetentionPolicy = {
		compressAfterDays: config.sessions?.compress_after_days,
		maxAgeDays: config.sessions?.max_age_days,
		maxCount: config.sessions?.max_count,
		maxSizeMB: config.sessions?.max_size_mb
	};

	logger.debug('Running session retention policy', { dryRun, policy });

	// Create retention manager
	const retentionManager = new SessionRetentionManager(policy, dryRun);
	const sessionStore = new SessionStore();

	// Load sessions and run cleanup
	const sessions = await sessionStore.listSessions();
	const sessionDir = sessionStore.getSessionsDir();

	const result = await retentionManager.cleanup(sessionDir, sessions);

	logger.debug('Session retention policy completed', {
		compressed: result.compressedSessions.length,
		deleted: result.deletedSessions.length,
		errors: result.errors.length
	});

	return result;
}

/**
 * Check if retention policy limits are exceeded and cleanup is needed
 */
export async function shouldRunAutomaticCleanup(): Promise<boolean> {
	const configLoader = getConfigLoader();
	const config = await configLoader.load();

	// Check if retention is enabled
	if (!config.sessions?.enabled) {
		return false;
	}

	const sessionStore = new SessionStore();
	const sessions = await sessionStore.listSessions();

	// Check max_count limit
	if (config.sessions.max_count && sessions.length > config.sessions.max_count) {
		return true;
	}

	// Check max_size_mb limit
	if (config.sessions.max_size_mb) {
		const totalSize = sessions.reduce((sum, s) => sum + (s.size_bytes ?? 0), 0);
		const totalSizeMB = totalSize / (1024 * 1024);
		if (totalSizeMB > config.sessions.max_size_mb) {
			return true;
		}
	}

	// Check max_age_days limit
	if (config.sessions.max_age_days) {
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - config.sessions.max_age_days);

		const hasOldSessions = sessions.some((s) => new Date(s.updated_at) < cutoffDate);
		if (hasOldSessions) {
			return true;
		}
	}

	return false;
}

/**
 * Run automatic cleanup silently in the background if needed
 * This is meant to be called during CLI initialization
 */
export async function runAutomaticCleanupIfNeeded(): Promise<void> {
	const logger = getLogger();

	try {
		const shouldRun = await shouldRunAutomaticCleanup();

		if (!shouldRun) {
			return;
		}

		logger.debug('Running automatic session cleanup (limits exceeded)');

		// Run cleanup in background (non-blocking)
		const result = await runRetentionPolicy(false);

		if (result.deletedSessions.length > 0 || result.compressedSessions.length > 0) {
			logger.debug('Automatic cleanup completed', {
				compressed: result.compressedSessions.length,
				deleted: result.deletedSessions.length
			});
		}

		if (result.errors.length > 0) {
			logger.warn('Automatic cleanup had errors', { errorCount: result.errors.length });
		}
	} catch (error) {
		// Don't fail CLI initialization if cleanup fails
		logger.warn('Automatic cleanup failed', { error: formatErrorMessage(error) });
	}
}
