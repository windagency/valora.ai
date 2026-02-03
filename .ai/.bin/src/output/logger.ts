/**
 * Structured logging system
 */

import type { LogEntry, LogLevel } from 'types/logger.types';

import { getLogCleanupScheduler } from 'cleanup/coordinator';
import {
	BYTES_PER_MB,
	DAILY_FILE_ROTATION_ENABLED,
	DEFAULT_DAILY_FILE_MAX_SIZE_MB,
	LOG_BUFFER_SIZE,
	LOG_FILE_EXTENSION,
	LOG_FILE_PREFIX,
	MCP_ID
} from 'config/constants';
import { getConfigLoader } from 'config/loader';
import * as path from 'path';
import { sanitizeForLogging } from 'utils/data-sanitizer';
import { appendFile, fileExists, getFileStats, resolveAIPath } from 'utils/file-utils';

import type { CleanupScheduler } from './cleanup-scheduler';

import { getColorAdapter } from './color-adapter.interface';
import { getProcessingFeedback } from './processing-feedback';

// Re-export types for backward compatibility
export type { LogEntry, LogLevel };

// Auto-flush configuration (imported from constants)
const BUFFER_FLUSH_THRESHOLD = LOG_BUFFER_SIZE;

export class Logger {
	maxDailyFileSizeBytes: number = DEFAULT_DAILY_FILE_MAX_SIZE_MB * BYTES_PER_MB;
	private buffer: LogEntry[] = [];
	private bufferFlushThreshold: number = BUFFER_FLUSH_THRESHOLD;
	private level: LogLevel;
	private logFile?: string;

	constructor(level: LogLevel = 'info', logFile?: string) {
		this.level = level;
		this.logFile = logFile;
	}

	/**
	 * Log debug message
	 */
	debug(message: string, data?: Record<string, unknown>): void {
		this.log('debug', message, data);
	}

	/**
	 * Log info message
	 */
	info(message: string, data?: Record<string, unknown>): void {
		this.log('info', message, data);
	}

	/**
	 * Log warning message
	 */
	warn(message: string, data?: Record<string, unknown>): void {
		this.log('warn', message, data);
	}

	/**
	 * Log error message
	 */
	error(message: string, error?: Error, data?: Record<string, unknown>): void {
		this.log('error', message, { ...data, error: error?.message, stack: error?.stack });
	}

	/**
	 * Always log (bypasses MCP suppression for critical messages)
	 * Use this for flow-critical messages that must always be visible
	 */
	always(message: string, data?: Record<string, unknown>): void {
		this.log('info', message, data);
	}

	/**
	 * Core logging method
	 */
	private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
		// Skip logging during logger initialization to prevent circular dependencies
		if (isInitializingLogger) {
			return;
		}

		if (!this.shouldLog(level)) {
			return;
		}

		// Sanitize sensitive data before logging
		const sanitizedData = data ? sanitizeForLogging(data) : undefined;
		const requestId = data?.['requestId'] as string | undefined;

		const entry: LogEntry = {
			data: sanitizedData,
			level,
			message,
			requestId,
			timestamp: new Date().toISOString()
		};

		// Add to buffer
		this.buffer.push(entry);

		// Console output
		this.logToConsole(entry);

		// Auto-flush buffer when it reaches threshold (prevents memory leaks)
		// Defer flush to avoid async operations in sync logging method
		if (this.buffer.length >= this.bufferFlushThreshold) {
			process.nextTick(() => {
				this.flush().catch((err) => {
					try {
						console.error('Auto-flush failed:', err);
					} catch (error) {
						// Ignore EPIPE errors during shutdown
						if (!(error instanceof Error) || !error.message.includes('EPIPE')) {
							throw error;
						}
					}
				});
			});
		}

		// File output (async, non-blocking)
		if (this.logFile) {
			this.logToFile(entry).catch((err) => {
				try {
					console.error('Failed to write to log file:', err);
				} catch (error) {
					// Ignore EPIPE errors during shutdown
					if (!(error instanceof Error) || !error.message.includes('EPIPE')) {
						throw error;
					}
				}
			});
		}
	}

	/**
	 * Check if should log at this level
	 */
	private shouldLog(level: LogLevel): boolean {
		const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
		const currentLevelIndex = levels.indexOf(this.level);
		const logLevelIndex = levels.indexOf(level);
		return logLevelIndex >= currentLevelIndex;
	}

	/**
	 * Check if should use verbose console output (full structured logs)
	 * Returns true only in verbose mode - otherwise use ProcessingFeedback
	 */
	private shouldLogToConsole(_level: LogLevel): boolean {
		// MCP mode - suppress all console output (ProcessingFeedback also checks this)
		if (process.env['AI_MCP_ENABLED'] === 'true') {
			return false;
		}

		// Quiet mode - suppress all console output
		if (process.env['AI_QUIET'] === 'true') {
			return false;
		}

		// Verbose mode - show all levels with full structured formatting
		if (process.env['AI_VERBOSE'] === 'true') {
			return true;
		}

		// Default mode - all logs go through ProcessingFeedback with status indicators
		return false;
	}

	/**
	 * Log to console with colors
	 * In default mode, messages are shown via ProcessingFeedback with status indicators
	 * In verbose mode, full structured logs are shown
	 */
	private logToConsole(entry: LogEntry): void {
		const color = getColorAdapter();

		// In non-verbose mode, use ProcessingFeedback for cleaner output
		if (!this.shouldLogToConsole(entry.level)) {
			this.showViaProcessingFeedback(entry);
			return;
		}

		// Verbose mode - show full structured logs
		const mcpId = color.blue(MCP_ID);
		const reqId = entry.requestId ? color.gray(`[${entry.requestId}]`) : '';

		const levelFormatters = {
			debug: color.blue('[DEBUG]'),
			error: color.red('[ERROR]'),
			info: color.cyan('[INFO] '),
			warn: color.yellow('[WARN] ')
		} as const;

		const levelStr = levelFormatters[entry.level];

		// CRITICAL: Use stderr to avoid interfering with MCP JSON-RPC on stdout
		try {
			if (entry.message) {
				console.error(`[${mcpId}]${reqId} ${levelStr} ${entry.message}`);
			}

			if (entry.data && Object.keys(entry.data).length > 0) {
				console.error(color.gray(JSON.stringify(entry.data, null, 2)));
			}
		} catch (error) {
			// Ignore EPIPE errors that occur during process shutdown/test cleanup
			if (!(error instanceof Error) || !error.message.includes('EPIPE')) {
				throw error;
			}
		}
	}

	/**
	 * Show log entry via ProcessingFeedback with status indicators
	 */
	private showViaProcessingFeedback(entry: LogEntry): void {
		try {
			const feedback = getProcessingFeedback();
			if (!feedback.isEnabled()) return;

			const levelHandlers: Record<LogLevel, () => void> = {
				debug: () => feedback.showStatus(entry.message),
				error: () => feedback.showError(entry.message, entry.data),
				info: () => feedback.showInfo(entry.message, entry.data),
				warn: () => feedback.showWarn(entry.message, entry.data)
			};

			levelHandlers[entry.level]();
		} catch {
			// Ignore - feedback may not be initialized
		}
	}

	/**
	 * Check if daily file needs rotation and rotate if necessary
	 */
	private async checkAndRotateFile(): Promise<void> {
		if (!this.logFile || !DAILY_FILE_ROTATION_ENABLED) return;

		// Don't attempt rotation if file doesn't exist to avoid logging loops
		if (!fileExists(this.logFile)) return;

		try {
			const stats = await getFileStats(this.logFile);
			if (stats.size >= this.maxDailyFileSizeBytes) {
				await this.rotateLogFile();
			}
		} catch {
			// Silently fail - don't log rotation errors to avoid infinite loops
			// The logger should be resilient and not break the application
		}
	}

	/**
	 * Rotate the current log file by renaming it with a sequence number
	 */
	private async rotateLogFile(): Promise<void> {
		if (!this.logFile) return;

		// Double-check file exists before attempting rotation
		if (!fileExists(this.logFile)) return;

		try {
			const dir = path.dirname(this.logFile);
			const filename = path.basename(this.logFile, LOG_FILE_EXTENSION);

			// Find the next available sequence number (functional approach)
			const findAvailableSequence = (maxAttempts = 1000): number => {
				return (
					Array.from({ length: maxAttempts }, (_, i) => i + 1).find(
						(seq) => !fileExists(path.join(dir, `${filename}.${seq}${LOG_FILE_EXTENSION}`))
					) ?? maxAttempts
				);
			};

			const sequenceNumber = findAvailableSequence();
			const rotatedPath = path.join(dir, `${filename}.${sequenceNumber}${LOG_FILE_EXTENSION}`);

			// Rename current file to rotated file
			const fs = await import('fs/promises');
			await fs.rename(this.logFile, rotatedPath);

			// Don't log rotation success to avoid triggering more cleanup operations
		} catch {
			// Silently fail - rotation is not critical, don't log to avoid loops
		}
	}

	/**
	 * Log to file
	 */
	private async logToFile(entry: LogEntry): Promise<void> {
		if (!this.logFile) return;

		try {
			// Check if file needs rotation before logging
			await this.checkAndRotateFile();

			const logLine = JSON.stringify(entry) + '\n';
			await appendFile(this.logFile, logLine);
		} catch (error) {
			// If file operations fail (e.g., in sandboxed environments or tests),
			// silently continue without file logging
			// The logger will still work for console output
			const errorCode = (error as NodeJS.ErrnoException)?.code;
			const isExpectedError = errorCode === 'EPERM' || errorCode === 'EACCES' || errorCode === 'ENOENT';
			if (!isExpectedError) {
				// Only log unexpected errors to avoid infinite loops
				console.error('Logger file write failed:', error);
			}
		}
	}

	/**
	 * Flush buffer to file
	 */
	async flush(): Promise<void> {
		if (!this.logFile || this.buffer.length === 0) return;

		try {
			const lines = this.buffer.map((entry) => JSON.stringify(entry)).join('\n') + '\n';
			await appendFile(this.logFile, lines);
			this.buffer = [];
		} catch (error) {
			// If file operations fail (e.g., in sandboxed environments or tests),
			// silently continue without file logging but still clear buffer
			const errorCode = (error as NodeJS.ErrnoException)?.code;
			const isExpectedError = errorCode === 'EPERM' || errorCode === 'EACCES' || errorCode === 'ENOENT';
			if (isExpectedError) {
				// Clear buffer to prevent memory buildup even when file write fails
				this.buffer = [];
			} else {
				// Re-throw unexpected errors
				throw error;
			}
		}
	}

	/**
	 * Set log level
	 */
	setLevel(level: LogLevel): void {
		this.level = level;
	}

	/**
	 * Get current log level
	 */
	getLevel(): LogLevel {
		return this.level;
	}

	/**
	 * Get buffer
	 */
	getBuffer(): LogEntry[] {
		return [...this.buffer];
	}

	/**
	 * Get buffer size
	 */
	getBufferSize(): number {
		return this.buffer.length;
	}

	/**
	 * Clear buffer
	 */
	clearBuffer(): void {
		this.buffer = [];
	}

	/**
	 * Set buffer flush threshold
	 */
	setBufferFlushThreshold(threshold: number): void {
		if (threshold < 1) {
			throw new Error('Buffer flush threshold must be at least 1');
		}
		this.bufferFlushThreshold = threshold;
	}

	/**
	 * Get buffer flush threshold
	 */
	getBufferFlushThreshold(): number {
		return this.bufferFlushThreshold;
	}
}

// Singleton logger instance
let loggerInstance: Logger | null = null;

// Flag to prevent logging during initialization
let isInitializingLogger = false;

export function getLogger(): Logger {
	if (!loggerInstance) {
		isInitializingLogger = true;

		const { configLoadError, logFile } = initializeLogFile();
		loggerInstance = new Logger('info', logFile);

		configureLoggerFromConfig(loggerInstance, configLoadError);
		applyMCPSuppressionIfNeeded();

		isInitializingLogger = false;
	}

	return loggerInstance;
}

/**
 * Initialize log file path and determine logs directory
 */
function initializeLogFile(): { configLoadError: unknown; logFile: string } {
	const today = new Date().toISOString().split('T')[0];
	const { configLoadError, logsDir } = getLogsDirectory();
	const logFile = path.join(logsDir, `${LOG_FILE_PREFIX}${today}${LOG_FILE_EXTENSION}`);

	return { configLoadError, logFile };
}

/**
 * Get logs directory from config or use default
 */
function getLogsDirectory(): { configLoadError: unknown; logsDir: string } {
	let logsDir = resolveAIPath('logs');
	let configLoadError: unknown = null;

	try {
		const configLoader = getConfigLoader();
		const config = configLoader.get();
		if (config.logging?.logs_path) {
			logsDir = config.logging.logs_path;
		}
	} catch (error) {
		if (!(error instanceof Error) || !error.message.includes('Configuration not loaded')) {
			configLoadError = error;
		}
	}

	return { configLoadError, logsDir };
}

/**
 * Configure logger settings from config and handle errors
 */
function configureLoggerFromConfig(logger: Logger, existingError: unknown): void {
	let configLoadError = existingError;

	try {
		const configLoader = getConfigLoader();
		const config = configLoader.get();
		if (config.logging?.daily_file_max_size_mb) {
			logger.maxDailyFileSizeBytes = config.logging.daily_file_max_size_mb * BYTES_PER_MB;
		}
	} catch (error) {
		if (!(error instanceof Error) || !error.message.includes('Configuration not loaded')) {
			configLoadError = error;
		}
	}

	if (configLoadError) {
		logger.warn('Failed to load config for logs path, using default', {
			error: configLoadError instanceof Error ? configLoadError.message : String(configLoadError)
		});
	}
}

/**
 * Apply MCP suppression proxy if in MCP context
 */
function applyMCPSuppressionIfNeeded(): void {
	if (!loggerInstance || process.env['AI_MCP_ENABLED'] !== 'true') {
		return;
	}

	try {
		const configLoader = getConfigLoader();
		const config = configLoader.get();
		const logLevel = config.defaults?.log_level ?? 'info';

		if (logLevel !== 'debug') {
			loggerInstance = createMCPSuppressionProxy(loggerInstance);
		}
	} catch {
		loggerInstance = createMCPSuppressionProxy(loggerInstance);
	}
}

/**
 * Create proxy to suppress debug/info logs in MCP mode
 */
export function setLogger(logger: Logger): void {
	loggerInstance = logger;
}

function createMCPSuppressionProxy(logger: Logger): Logger {
	return new Proxy(logger, {
		get(target, prop) {
			const suppressionRules: Record<string, () => unknown> = {
				always: () => target[prop as keyof Logger],
				debug: () => () => {},
				error: () => target[prop as keyof Logger],
				info: () => () => {},
				warn: () => target[prop as keyof Logger]
			};

			if (typeof target[prop as keyof Logger] === 'function' && prop in suppressionRules) {
				const rule = suppressionRules[prop as keyof typeof suppressionRules];
				return rule ? rule() : target[prop as keyof Logger];
			}

			return target[prop as keyof Logger];
		}
	});
}

/**
 * Get the cleanup scheduler instance
 * Note: Scheduler is now initialized via cleanup/coordinator.ts
 */
export function getCleanupScheduler(): CleanupScheduler | null {
	// Import and delegate to coordinator
	return getLogCleanupScheduler();
}
