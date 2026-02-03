/**
 * Idempotency Store Service
 *
 * Provides idempotency key validation and result caching for tool execution.
 * Ensures that duplicate tool calls with the same parameters return cached results
 * instead of re-executing, preventing unintended side effects.
 *
 */

import type { LLMToolCall } from 'types/llm.types';

import { createHash } from 'crypto';
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { getLogger } from 'output/logger';
import { join } from 'path';
import {
	type IdempotencyCheckResult,
	type IdempotencyOptions,
	type IdempotencyRecord,
	type IdempotencyResult,
	type IdempotencyStoreConfig,
	isIdempotentTool
} from 'types/idempotency.types';
import { formatErrorMessage } from 'utils/error-handler';
import { getFileLockManager } from 'utils/file-lock';

const logger = getLogger();

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: IdempotencyStoreConfig = {
	cleanup_interval_ms: 5 * 60 * 1000, // 5 minutes
	default_ttl_ms: 60 * 60 * 1000, // 1 hour
	max_records: 10000,
	store_dir: '.ai/idempotency'
};

export class IdempotencyStoreService {
	private cleanupTimer: NodeJS.Timeout | null = null;
	private readonly config: IdempotencyStoreConfig;
	private readonly lockerId = `idempotency-${process.pid}`;
	private readonly lockManager = getFileLockManager();
	private recordCount = 0;

	constructor(config?: Partial<IdempotencyStoreConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...config };
		this.ensureStoreDirectory();
		this.startCleanupTimer();
	}

	/**
	 * Generate an idempotency key from a tool call
	 * The key is a hash of the tool name and sorted arguments
	 */
	generateKey(toolCall: LLMToolCall, sessionId?: string): string {
		const keyData = {
			args: this.sortObject(toolCall.arguments),
			name: toolCall.name,
			session_id: sessionId
		};

		const hash = createHash('sha256').update(JSON.stringify(keyData)).digest('hex').substring(0, 32);

		return `${toolCall.name}-${hash}`;
	}

	/**
	 * Generate a hash of the arguments for verification
	 */
	private generateArgsHash(args: Record<string, unknown>): string {
		return createHash('sha256')
			.update(JSON.stringify(this.sortObject(args)))
			.digest('hex')
			.substring(0, 16);
	}

	/**
	 * Check if a tool call has a cached result
	 * Returns the cached result if found and not expired
	 */
	async check(toolCall: LLMToolCall, options?: IdempotencyOptions): Promise<IdempotencyCheckResult> {
		const key = this.generateKey(toolCall, options?.session_id);

		// Skip check for non-idempotent tools
		if (!isIdempotentTool(toolCall.name)) {
			return { found: false, key };
		}

		// Skip if force_execute is set
		if (options?.force_execute) {
			logger.debug('Idempotency check skipped (force_execute)', { key });
			return { found: false, key };
		}

		const recordPath = this.getRecordPath(key);

		try {
			const record = await this.lockManager.readWithLock<IdempotencyRecord>(recordPath, this.lockerId, {
				retries: 2,
				timeout_ms: 2000
			});

			if (!record) {
				return { found: false, key };
			}

			// Check if expired
			if (new Date(record.expires_at) < new Date()) {
				logger.debug('Idempotency record expired', { key });
				this.delete(key);
				return { found: false, key };
			}

			// Verify args hash matches (defense against hash collisions)
			const currentArgsHash = this.generateArgsHash(toolCall.arguments);
			if (record.args_hash !== currentArgsHash) {
				logger.warn('Idempotency key collision detected', {
					current_hash: currentArgsHash,
					key,
					stored_hash: record.args_hash
				});
				return { found: false, key };
			}

			logger.info('Idempotency cache hit', {
				age_ms: Date.now() - new Date(record.created_at).getTime(),
				key,
				tool: toolCall.name
			});

			return { found: true, key, record };
		} catch (error) {
			logger.debug('Idempotency check failed', {
				error: formatErrorMessage(error),
				key
			});
			return { found: false, key };
		}
	}

	/**
	 * Store a result for an idempotency key
	 */
	async store(toolCall: LLMToolCall, result: IdempotencyResult, options?: IdempotencyOptions): Promise<void> {
		// Only store results for idempotent tools
		if (!isIdempotentTool(toolCall.name)) {
			return;
		}

		const key = this.generateKey(toolCall, options?.session_id);
		const ttl = options?.ttl_ms ?? this.config.default_ttl_ms;

		const record: IdempotencyRecord = {
			args_hash: this.generateArgsHash(toolCall.arguments),
			created_at: new Date().toISOString(),
			expires_at: new Date(Date.now() + ttl).toISOString(),
			key,
			result,
			session_id: options?.session_id,
			tool_name: toolCall.name
		};

		const recordPath = this.getRecordPath(key);

		try {
			await this.lockManager.writeWithLock(recordPath, record, this.lockerId, {
				pretty: false,
				retries: 2,
				timeout_ms: 2000
			});

			this.recordCount++;

			logger.debug('Idempotency record stored', {
				key,
				tool: toolCall.name,
				ttl_ms: ttl
			});

			// Trigger cleanup if we exceed max records
			if (this.recordCount > this.config.max_records) {
				this.cleanup().catch(() => {
					// Cleanup errors are non-fatal
				});
			}
		} catch (error) {
			logger.warn('Failed to store idempotency record', {
				error: formatErrorMessage(error),
				key
			});
			// Non-fatal - execution continues without caching
		}
	}

	/**
	 * Delete an idempotency record
	 */
	delete(key: string): void {
		const recordPath = this.getRecordPath(key);

		try {
			if (existsSync(recordPath)) {
				unlinkSync(recordPath);
				this.recordCount = Math.max(0, this.recordCount - 1);
				logger.debug('Idempotency record deleted', { key });
			}
		} catch (error) {
			logger.debug('Failed to delete idempotency record', {
				error: formatErrorMessage(error),
				key
			});
		}
	}

	/**
	 * Invalidate all records for a specific tool
	 */
	invalidateTool(toolName: string): number {
		let invalidated = 0;

		try {
			const files = readdirSync(this.config.store_dir);

			for (const file of files) {
				if (file.startsWith(`${toolName}-`) && file.endsWith('.json')) {
					const key = file.replace('.json', '');
					this.delete(key);
					invalidated++;
				}
			}

			logger.info('Idempotency records invalidated', { count: invalidated, toolName });
		} catch (error) {
			logger.warn('Failed to invalidate tool records', {
				error: formatErrorMessage(error),
				toolName
			});
		}

		return invalidated;
	}

	/**
	 * Invalidate all records for a session
	 */
	async invalidateSession(sessionId: string): Promise<number> {
		let invalidated = 0;

		try {
			const files = readdirSync(this.config.store_dir);

			for (const file of files) {
				if (!file.endsWith('.json')) continue;

				const recordPath = join(this.config.store_dir, file);
				try {
					const record = await this.lockManager.readWithLock<IdempotencyRecord>(recordPath, this.lockerId, {
						retries: 1,
						timeout_ms: 1000
					});

					if (record?.session_id === sessionId) {
						this.delete(record.key);
						invalidated++;
					}
				} catch {
					// Skip records we can't read
				}
			}

			logger.info('Session idempotency records invalidated', { count: invalidated, sessionId });
		} catch (error) {
			logger.warn('Failed to invalidate session records', {
				error: formatErrorMessage(error),
				sessionId
			});
		}

		return invalidated;
	}

	/**
	 * Clean up expired records
	 */
	async cleanup(): Promise<number> {
		let cleaned = 0;
		const now = new Date();

		try {
			const files = readdirSync(this.config.store_dir);

			for (const file of files) {
				if (!file.endsWith('.json') || file.endsWith('.lock')) continue;

				const recordPath = join(this.config.store_dir, file);
				const wasDeleted = await this.cleanupExpiredRecord(recordPath, now);
				if (wasDeleted) cleaned++;
			}

			this.updateRecordCount();

			if (cleaned > 0) {
				logger.debug('Idempotency cleanup completed', { cleaned, remaining: this.recordCount });
			}

			await this.lockManager.cleanupExpiredLocks(this.config.store_dir);
		} catch (error) {
			logger.debug('Idempotency cleanup failed', {
				error: formatErrorMessage(error)
			});
		}

		return cleaned;
	}

	/**
	 * Clean up a single expired record
	 */
	private async cleanupExpiredRecord(recordPath: string, now: Date): Promise<boolean> {
		try {
			const record = await this.lockManager.readWithLock<IdempotencyRecord>(recordPath, this.lockerId, {
				retries: 1,
				timeout_ms: 1000
			});

			if (record && new Date(record.expires_at) < now) {
				this.delete(record.key);
				return true;
			}
			return false;
		} catch {
			// Skip files we can't read (may be locked or temporarily unavailable)
			// Only delete files we can confirm are expired
			return false;
		}
	}

	/**
	 * Update the record count from the store directory
	 */
	private updateRecordCount(): void {
		this.recordCount = readdirSync(this.config.store_dir).filter(
			(f) => f.endsWith('.json') && !f.endsWith('.lock')
		).length;
	}

	/**
	 * Clear all idempotency records
	 */
	clear(): number {
		let cleared = 0;

		try {
			const files = readdirSync(this.config.store_dir);

			for (const file of files) {
				if (file.endsWith('.json')) {
					try {
						unlinkSync(join(this.config.store_dir, file));
						cleared++;
					} catch {
						// Ignore
					}
				}
			}

			this.recordCount = 0;
			logger.info('Idempotency store cleared', { count: cleared });
		} catch (error) {
			logger.warn('Failed to clear idempotency store', {
				error: formatErrorMessage(error)
			});
		}

		return cleared;
	}

	/**
	 * Get store statistics
	 */
	getStats(): { max_records: number; record_count: number; store_dir: string } {
		return {
			max_records: this.config.max_records,
			record_count: this.recordCount,
			store_dir: this.config.store_dir
		};
	}

	/**
	 * Stop the cleanup timer (for graceful shutdown)
	 */
	stop(): void {
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer);
			this.cleanupTimer = null;
		}
	}

	/**
	 * Ensure the store directory exists
	 */
	private ensureStoreDirectory(): void {
		if (!existsSync(this.config.store_dir)) {
			mkdirSync(this.config.store_dir, { recursive: true });
		}

		// Count existing records
		try {
			this.recordCount = readdirSync(this.config.store_dir).filter(
				(f) => f.endsWith('.json') && !f.endsWith('.lock')
			).length;
		} catch {
			this.recordCount = 0;
		}
	}

	/**
	 * Start the periodic cleanup timer
	 */
	private startCleanupTimer(): void {
		this.cleanupTimer = setInterval(() => {
			this.cleanup().catch(() => {
				// Cleanup errors are non-fatal
			});
		}, this.config.cleanup_interval_ms);

		// Don't keep the process alive for cleanup
		this.cleanupTimer.unref();
	}

	/**
	 * Get the file path for a record
	 */
	private getRecordPath(key: string): string {
		return join(this.config.store_dir, `${key}.json`);
	}

	/**
	 * Sort an object's keys recursively for consistent hashing
	 */
	private sortObject(obj: Record<string, unknown>): Record<string, unknown> {
		if (typeof obj !== 'object' || obj === null) {
			return obj;
		}

		if (Array.isArray(obj)) {
			const sortedArray: unknown[] = obj.map((item): unknown =>
				typeof item === 'object' && item !== null ? this.sortObject(item as Record<string, unknown>) : item
			);
			return sortedArray as unknown as Record<string, unknown>;
		}

		const sorted: Record<string, unknown> = {};
		for (const key of Object.keys(obj).sort()) {
			const value = obj[key];
			sorted[key] =
				typeof value === 'object' && value !== null ? this.sortObject(value as Record<string, unknown>) : value;
		}
		return sorted;
	}
}

/**
 * Singleton instance
 */
let idempotencyStore: IdempotencyStoreService | null = null;

/**
 * Get the global idempotency store instance
 */
export function getIdempotencyStore(config?: Partial<IdempotencyStoreConfig>): IdempotencyStoreService {
	if (!idempotencyStore || config) {
		idempotencyStore = new IdempotencyStoreService(config);
	}
	return idempotencyStore;
}

/**
 * Reset the singleton (for testing)
 */
export function resetIdempotencyStore(): void {
	if (idempotencyStore) {
		idempotencyStore.stop();
		idempotencyStore = null;
	}
}
