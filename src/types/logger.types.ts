/**
 * Logger-related type definitions
 *
 * These types are extracted from the logger implementation to prevent
 * circular dependencies. Types layer must remain independent of
 * implementation layers.
 */

import type { LogLevel } from './common.types';

// Re-export for convenience
export type { LogLevel };

/**
 * Structured log entry
 */
export interface LogEntry {
	data?: Record<string, unknown>;
	error?: Error;
	level: LogLevel;
	message: string;
	requestId?: string;
	timestamp: string;
}
