/**
 * Cleanup Coordinator - Unified initialization for all cleanup schedulers
 *
 * This module manages both log and session cleanup schedulers from a single
 * entry point, ensuring consistent initialization and lifecycle management.
 */

import type { Config } from 'config/schema';

import { getConfigLoader } from 'config/loader';
import { type CleanupSchedule, CleanupScheduler } from 'output/cleanup-scheduler';
import { getLogger } from 'output/logger';
import { RetentionManager, type RetentionPolicy } from 'output/retention-manager';
import { type SessionCleanupSchedule, SessionCleanupScheduler } from 'session/cleanup-scheduler';
import { SessionRetentionManager, type SessionRetentionPolicy } from 'session/retention-manager';
import { SessionStore } from 'session/store';
import { resolveAIPath } from 'utils/file-utils';

// Global scheduler instances
let logCleanupScheduler: CleanupScheduler | null = null;
let sessionCleanupScheduler: null | SessionCleanupScheduler = null;
let isInitialized = false;
let initializationPromise: null | Promise<void> = null;

/**
 * Initialize all cleanup schedulers
 * Uses singleton pattern to prevent multiple concurrent initializations
 */
export async function initializeCleanupSchedulers(): Promise<void> {
	// If already initialized, return immediately
	if (isInitialized) {
		return;
	}

	// If initialization is in progress, wait for it
	if (initializationPromise) {
		return initializationPromise;
	}

	// Start initialization
	initializationPromise = (async () => {
		try {
			const logger = getLogger();
			const configLoader = getConfigLoader();
			const config = await configLoader.load();

			// Initialize log cleanup scheduler
			if (config.logging?.enabled) {
				initializeLogCleanupScheduler(config);
				logger.debug('Log cleanup scheduler initialized');
			}

			// Initialize session cleanup scheduler
			if (config.sessions?.enabled) {
				initializeSessionCleanupScheduler(config);
				logger.debug('Session cleanup scheduler initialized');
			}

			isInitialized = true;
		} catch (error) {
			const logger = getLogger();
			logger.error('Failed to initialize cleanup schedulers', error instanceof Error ? error : undefined);
			// Reset promise so failed initialization can be retried
			initializationPromise = null;
			throw error;
		}
	})();

	return initializationPromise;
}

/**
 * Initialize log cleanup scheduler
 */
function initializeLogCleanupScheduler(config: Config): void {
	const loggingConfig = config.logging;

	// Guard: ensure loggingConfig exists
	if (!loggingConfig) {
		throw new Error('Logging config is required but was not provided');
	}

	// Convert config format to RetentionPolicy
	const retentionPolicy: RetentionPolicy = {
		compressAfterDays: loggingConfig.compress_after_days,
		maxAgeDays: loggingConfig.max_age_days,
		maxFiles: loggingConfig.max_files,
		maxSizeMB: loggingConfig.max_size_mb
	};

	// Create retention manager
	const retentionManager = new RetentionManager(retentionPolicy, loggingConfig.dry_run);

	// Determine logs directory
	const logsDir = loggingConfig.logs_path ?? resolveAIPath('logs');

	// Create cleanup schedule
	const cleanupSchedule: CleanupSchedule = {
		enabled: loggingConfig.enabled,
		intervalHours: loggingConfig.cleanup_interval_hours,
		logDirs: [logsDir],
		startDelayMinutes: loggingConfig.start_delay_minutes
	};

	// Create and start cleanup scheduler
	logCleanupScheduler = new CleanupScheduler(retentionManager, cleanupSchedule);
	logCleanupScheduler.start();
}

/**
 * Initialize session cleanup scheduler
 */
function initializeSessionCleanupScheduler(config: Config): void {
	const sessionConfig = config.sessions;

	// Guard: ensure sessionConfig exists
	if (!sessionConfig) {
		throw new Error('Session config is required but was not provided');
	}

	// Convert config format to SessionRetentionPolicy
	const retentionPolicy: SessionRetentionPolicy = {
		compressAfterDays: sessionConfig.compress_after_days,
		maxAgeDays: sessionConfig.max_age_days,
		maxCount: sessionConfig.max_count,
		maxSizeMB: sessionConfig.max_size_mb
	};

	// Get session store instance
	const sessionStore = new SessionStore();

	// Create retention manager
	const retentionManager = new SessionRetentionManager(retentionPolicy, sessionConfig.dry_run);

	// Create cleanup schedule
	const cleanupSchedule: SessionCleanupSchedule = {
		enabled: sessionConfig.enabled,
		intervalHours: sessionConfig.cleanup_interval_hours,
		startDelayMinutes: sessionConfig.start_delay_minutes
	};

	// Create and start cleanup scheduler
	sessionCleanupScheduler = new SessionCleanupScheduler(retentionManager, sessionStore, cleanupSchedule);
	sessionCleanupScheduler.start();
}

/**
 * Get the log cleanup scheduler instance
 */
export function getLogCleanupScheduler(): CleanupScheduler | null {
	return logCleanupScheduler;
}

/**
 * Get the session cleanup scheduler instance
 */
export function getSessionCleanupScheduler(): null | SessionCleanupScheduler {
	return sessionCleanupScheduler;
}

/**
 * Stop all cleanup schedulers
 */
export function stopAllCleanupSchedulers(): void {
	if (logCleanupScheduler) {
		logCleanupScheduler.stop();
		logCleanupScheduler = null;
	}

	if (sessionCleanupScheduler) {
		sessionCleanupScheduler.stop();
		sessionCleanupScheduler = null;
	}

	// Stop idempotency store cleanup timer (lazy import to avoid circular dependency)
	import('services/idempotency-store.service')
		.then(({ resetIdempotencyStore }) => {
			resetIdempotencyStore();
		})
		.catch(() => {
			// Ignore errors during shutdown - the timer is unref'd anyway
		});

	// Stop stage cache cleanup timer (lazy import to avoid circular dependency)
	import('executor/stage-output-cache')
		.then(({ getStageOutputCache }) => {
			const cache = getStageOutputCache();
			cache.stop();
		})
		.catch(() => {
			// Ignore errors during shutdown - the timer is unref'd anyway
		});

	isInitialized = false;
	initializationPromise = null;
}
