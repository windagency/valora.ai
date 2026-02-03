/**
 * Base Retention Manager
 *
 * Abstract base class for retention managers that provides shared logic for:
 * - Age-based cleanup
 * - Size-based cleanup
 * - Count-based cleanup
 * - File compression
 * - Policy management
 *
 * Concrete implementations extend this for specific file types (logs, sessions, etc.)
 */

import { BYTES_PER_MB } from 'config/constants';
import * as fs from 'fs';
import { pipeline } from 'stream/promises';

import { formatErrorMessage } from './error-utils';

/**
 * Base interface for retention policies
 */
export interface BaseRetentionPolicy {
	compressAfterDays?: number; // Compress files older than this many days
	maxAgeDays?: number; // Delete files older than this many days
	maxCount?: number; // Keep maximum this many files
	maxSizeMB?: number; // Keep total storage under this many MB
}

/**
 * Base interface for cleanup results
 */
export interface BaseCleanupResult {
	compressedItems: string[];
	deletedItems: string[];
	errors: string[];
	totalSizeAfter: number;
	totalSizeBefore: number;
}

/**
 * Base interface for file info
 */
export interface BaseFileInfo {
	filePath: string;
	isCompressed: boolean;
	modifiedTime: Date;
	size: number;
}

/**
 * Logger interface for retention operations
 */
export interface RetentionLogger {
	debug(message: string, context?: Record<string, unknown>): void;
	error(message: string, error?: Error, context?: Record<string, unknown>): void;
	info(message: string, context?: Record<string, unknown>): void;
	warn(message: string, context?: Record<string, unknown>): void;
}

/**
 * Abstract base class for retention managers
 */
export abstract class BaseRetentionManager<
	TPolicy extends BaseRetentionPolicy,
	TResult extends BaseCleanupResult,
	TFileInfo extends BaseFileInfo
> {
	protected dryRun: boolean;
	protected abstract readonly logger: RetentionLogger;
	protected policy: TPolicy;

	constructor(policy: TPolicy, dryRun = false) {
		this.policy = policy;
		this.dryRun = dryRun;
	}

	/**
	 * Get the age of a file item in days.
	 * Subclasses can override this to use custom date fields (e.g., session.updated_at).
	 */
	protected abstract getItemAgeDays(item: TFileInfo): number;

	/**
	 * Get a display identifier for the file item (for logging).
	 */
	protected abstract getItemDisplayId(item: TFileInfo): string;

	/**
	 * Delete a file item and any associated files (e.g., snapshots).
	 */
	protected abstract deleteItem(item: TFileInfo): Promise<void>;

	/**
	 * Record a deletion in the result.
	 */
	protected abstract recordDeletion(item: TFileInfo, result: TResult): void;

	/**
	 * Record a compression in the result.
	 */
	protected abstract recordCompression(item: TFileInfo, result: TResult): void;

	/**
	 * Compress a file using gzip
	 * Shared implementation for both log and session files
	 */
	protected async compressFile(filePath: string): Promise<void> {
		const zlib = await import('zlib');
		const fsPromises = fs.promises;

		const compressedPath = `${filePath}.gz`;
		const readStream = fs.createReadStream(filePath);
		const writeStream = fs.createWriteStream(compressedPath);
		const gzip = zlib.createGzip();

		// Use stream pipeline for cleaner async handling
		await pipeline(readStream, gzip, writeStream);

		// Remove original file after successful compression
		await fsPromises.unlink(filePath);
	}

	/**
	 * Compress a file with optional size logging
	 */
	protected async compressFileWithStats(filePath: string): Promise<{ compressionRatio: number; savedBytes: number }> {
		const fsPromises = fs.promises;
		const zlib = await import('zlib');

		// Get original file size for logging
		const originalStats = await fsPromises.stat(filePath);
		const originalSizeBytes = originalStats.size;

		const compressedPath = `${filePath}.gz`;
		const readStream = fs.createReadStream(filePath);
		const writeStream = fs.createWriteStream(compressedPath);
		const gzip = zlib.createGzip();

		await pipeline(readStream, gzip, writeStream);

		// Get compressed file size for logging
		const compressedStats = await fsPromises.stat(compressedPath);
		const compressedSizeBytes = compressedStats.size;
		const compressionRatio = (1 - compressedSizeBytes / originalSizeBytes) * 100;
		const savedBytes = originalSizeBytes - compressedSizeBytes;

		// Remove original file after successful compression
		await fsPromises.unlink(filePath);

		return { compressionRatio, savedBytes };
	}

	/**
	 * Apply age-based cleanup: delete items older than maxAgeDays
	 */
	protected async applyAgePolicy(items: TFileInfo[], result: TResult, getCutoffDate: () => Date): Promise<TFileInfo[]> {
		if (!this.policy.maxAgeDays) return items;

		const cutoffDate = getCutoffDate();

		const [toDelete, toKeep] = items.reduce<[TFileInfo[], TFileInfo[]]>(
			([del, keep], item) => {
				if (item.modifiedTime < cutoffDate) {
					del.push(item);
				} else {
					keep.push(item);
				}
				return [del, keep];
			},
			[[], []]
		);

		await this.deleteItemsWithErrorHandling(toDelete, result, 'age-based');

		return toKeep;
	}

	/**
	 * Apply size-based cleanup: keep total size under maxSizeMB
	 */
	protected async applySizePolicy(items: TFileInfo[], result: TResult): Promise<TFileInfo[]> {
		if (!this.policy.maxSizeMB) return items;

		const maxSizeBytes = this.policy.maxSizeMB * BYTES_PER_MB;
		const currentSize = items.reduce((sum, item) => sum + item.size, 0);

		if (currentSize <= maxSizeBytes) return items;

		// Process items and remove until under limit
		const { toDelete, toKeep } = items.reduce<{
			currentSize: number;
			toDelete: TFileInfo[];
			toKeep: TFileInfo[];
		}>(
			(acc, item) => {
				if (acc.currentSize <= maxSizeBytes) {
					acc.toKeep.push(item);
				} else {
					acc.toDelete.push(item);
					acc.currentSize -= item.size;
				}
				return acc;
			},
			{ currentSize, toDelete: [], toKeep: [] }
		);

		await this.deleteItemsWithErrorHandling(toDelete, result, 'size-based');

		return toKeep;
	}

	/**
	 * Apply count-based cleanup: keep maximum maxCount items
	 */
	protected async applyCountPolicy(items: TFileInfo[], result: TResult): Promise<TFileInfo[]> {
		if (!this.policy.maxCount || items.length <= this.policy.maxCount) return items;

		// Items should already be sorted (most recent first)
		const toKeep = items.slice(0, this.policy.maxCount);
		const toDelete = items.slice(this.policy.maxCount);

		await this.deleteItemsWithErrorHandling(toDelete, result, 'count-based');

		return toKeep;
	}

	/**
	 * Apply compression policy: compress items older than compressAfterDays
	 */
	protected async applyCompressionPolicy(
		items: TFileInfo[],
		result: TResult,
		getCutoffDate: () => Date
	): Promise<TFileInfo[]> {
		if (!this.policy.compressAfterDays) return items;

		const cutoffDate = getCutoffDate();

		const filesToCompress = items.filter((item) => {
			if (item.isCompressed) return false;
			return item.modifiedTime < cutoffDate;
		});

		const compressionResults = await Promise.allSettled(
			filesToCompress.map(async (item) => {
				if (!this.dryRun) {
					await this.compressFile(item.filePath);
				}
				this.recordCompression(item, result);
				this.logger.debug(`Compressed file`, {
					ageDays: this.getItemAgeDays(item),
					compressAfterDays: this.policy.compressAfterDays,
					item: this.getItemDisplayId(item)
				});
				return item;
			})
		);

		compressionResults.forEach((compressionResult, index) => {
			if (compressionResult.status === 'rejected') {
				const item = filesToCompress[index];
				if (!item) return;
				const errorMsg = `Failed to compress ${this.getItemDisplayId(item)}: ${formatErrorMessage(compressionResult.reason)}`;
				result.errors.push(errorMsg);
				this.logger.warn('Failed to compress file', {
					error: errorMsg,
					item: this.getItemDisplayId(item)
				});
			}
		});

		return items;
	}

	/**
	 * Delete items with error handling
	 */
	protected async deleteItemsWithErrorHandling(items: TFileInfo[], result: TResult, reason: string): Promise<void> {
		const deleteResults = await Promise.allSettled(
			items.map(async (item) => {
				if (!this.dryRun) {
					await this.deleteItem(item);
				}
				this.recordDeletion(item, result);
				this.logger.debug(`Deleted item (${reason})`, {
					ageDays: this.getItemAgeDays(item),
					item: this.getItemDisplayId(item),
					maxAgeDays: this.policy.maxAgeDays,
					maxCount: this.policy.maxCount,
					maxSizeMB: this.policy.maxSizeMB,
					sizeMB: (item.size / BYTES_PER_MB).toFixed(2)
				});
				return item;
			})
		);

		deleteResults.forEach((deleteResult, index) => {
			if (deleteResult.status === 'rejected') {
				const item = items[index];
				if (!item) return;
				const errorMsg = `Failed to delete ${this.getItemDisplayId(item)}: ${formatErrorMessage(deleteResult.reason)}`;
				result.errors.push(errorMsg);
				this.logger.warn(`Failed to delete item (${reason})`, {
					error: errorMsg,
					item: this.getItemDisplayId(item)
				});
			}
		});
	}

	/**
	 * Update retention policy
	 */
	updatePolicy(policy: Partial<TPolicy>): void {
		this.policy = { ...this.policy, ...policy };
		this.logger.info('Updated retention policy', { policy: this.policy });
	}

	/**
	 * Get current retention policy
	 */
	getPolicy(): TPolicy {
		return { ...this.policy };
	}

	/**
	 * Set dry run mode
	 */
	setDryRun(dryRun: boolean): void {
		this.dryRun = dryRun;
		this.logger.info('Updated dry run mode', { dryRun });
	}

	/**
	 * Check if running in dry run mode
	 */
	isDryRun(): boolean {
		return this.dryRun;
	}

	/**
	 * Calculate cutoff date from days offset
	 */
	protected calculateCutoffDate(days: number): Date {
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - days);
		return cutoffDate;
	}

	/**
	 * Calculate total size of items
	 */
	protected calculateTotalSize(items: TFileInfo[]): number {
		return items.reduce((sum, item) => sum + item.size, 0);
	}
}
