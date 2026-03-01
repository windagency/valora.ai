/**
 * Log retention and cleanup manager
 * Handles automated cleanup of log files based on configurable policies
 */

import { BYTES_PER_MB, MCP_ID, MS_PER_DAY } from 'config/constants';
import * as fs from 'fs';
import * as path from 'path';
import {
	type BaseCleanupResult,
	type BaseFileInfo,
	BaseRetentionManager,
	type BaseRetentionPolicy,
	type RetentionLogger
} from 'utils/base-retention-manager';
import { formatErrorMessage } from 'utils/error-utils';

import { getConsoleOutput } from './console-output';
import { getLogger } from './logger';

// Re-export base types with log-specific aliases for backward compatibility
export interface CleanupResult extends BaseCleanupResult {
	compressedFiles: string[];
	deletedFiles: string[];
}

export interface FileInfo extends BaseFileInfo {
	path: string; // Alias for filePath for backward compatibility
}

export interface RetentionPolicy extends BaseRetentionPolicy {
	maxFiles?: number; // Alias for maxCount for backward compatibility
}

/**
 * Log retention manager extending the base retention manager
 */
export class RetentionManager extends BaseRetentionManager<RetentionPolicy, CleanupResult, FileInfo> {
	protected readonly logger: RetentionLogger = getLogger();

	/**
	 * Analyse log directory and return file information
	 */
	async analyzeDirectory(logDir: string): Promise<FileInfo[]> {
		try {
			const entries = await fs.promises.readdir(logDir, { withFileTypes: true });

			// Filter valid entries and process in parallel
			const validEntries = entries.filter(
				(entry) =>
					entry.isFile() && !entry.name.startsWith('.') && !entry.name.includes('.tmp') && !entry.name.includes('.lock')
			);

			const files = await Promise.all(
				validEntries.map(async (entry) => {
					const filePath = path.join(logDir, entry.name);
					const stats = await fs.promises.stat(filePath);
					const isCompressed = entry.name.endsWith('.gz');

					return {
						filePath,
						isCompressed,
						modifiedTime: stats.mtime,
						path: filePath, // Backward compatibility alias
						size: stats.size
					};
				})
			);

			// Sort by modification time (oldest first)
			return files.sort((a, b) => a.modifiedTime.getTime() - b.modifiedTime.getTime());
		} catch (error) {
			this.logger.error('Failed to analyze log directory', error instanceof Error ? error : undefined, { logDir });
			throw error;
		}
	}

	/**
	 * Group files by date for daily file management
	 * Handles rotated files like ai-YYYY-MM-DD.log, ai-YYYY-MM-DD.1.log, ai-YYYY-MM-DD.2.log, etc.
	 */
	private groupFilesByDate(files: FileInfo[]): Record<string, FileInfo[]> {
		return files.reduce<Record<string, FileInfo[]>>((groups, file) => {
			// Extract date from filename (for ai-YYYY-MM-DD.log and ai-YYYY-MM-DD.N.log formats)
			const filename = path.basename(file.path);
			const dateMatch = filename.match(/ai-(\d{4}-\d{2}-\d{2})(?:\.\d+)?/);

			// Extract date: prefer filename date, fallback to modification date
			const dateFromFilename = dateMatch?.[1];
			const dateFromModTime = file.modifiedTime.toISOString().split('T')[0];
			const dateKey = dateFromFilename ?? dateFromModTime ?? '';

			groups[dateKey] ??= [];
			groups[dateKey].push(file);

			return groups;
		}, {});
	}

	/**
	 * Clean up empty or corrupted log files
	 */
	private async cleanupEmptyFiles(files: FileInfo[], result: CleanupResult): Promise<FileInfo[]> {
		// Validate all files in parallel
		const validationResults = await Promise.allSettled(
			files.map(async (file) => {
				// Check if file is empty (0 bytes)
				if (file.size === 0) {
					this.logger.debug('Found empty log file', { file: path.basename(file.path) });
					return { file, reason: 'empty', shouldDelete: true };
				}

				// For uncompressed files, check if they contain valid JSON
				if (!file.isCompressed) {
					const content = await fs.promises.readFile(file.path, 'utf8');
					const lines = content
						.trim()
						.split('\n')
						.filter((line) => line.trim());

					// Count valid vs invalid JSON lines
					const { invalidLines, validLines } = lines.reduce(
						(counts, line) => {
							try {
								JSON.parse(line);
								return { ...counts, validLines: counts.validLines + 1 };
							} catch {
								return { ...counts, invalidLines: counts.invalidLines + 1 };
							}
						},
						{ invalidLines: 0, validLines: 0 }
					);

					// If more than 50% of lines are invalid, consider file corrupted
					if (validLines > 0 && invalidLines > validLines) {
						this.logger.warn('Found corrupted log file (too many invalid JSON lines)', {
							file: path.basename(file.path),
							invalidLines,
							validLines
						});
						return { file, reason: 'corrupted', shouldDelete: true };
					}
				}

				return { file, shouldDelete: false };
			})
		);

		// Separate valid files from files to delete
		const { toDelete, validFiles } = validationResults.reduce<{
			toDelete: FileInfo[];
			validFiles: FileInfo[];
		}>(
			(acc, validationResult) => {
				if (validationResult.status === 'fulfilled') {
					if (validationResult.value.shouldDelete) {
						acc.toDelete.push(validationResult.value.file);
					} else {
						acc.validFiles.push(validationResult.value.file);
					}
				} else {
					// If we can't read the file, consider it corrupted
					const fileIndex = validationResults.indexOf(validationResult);
					const file = files[fileIndex];
					if (file) {
						this.logger.warn('Found unreadable log file', {
							error: formatErrorMessage(validationResult.reason),
							file: path.basename(file.path)
						});
						acc.toDelete.push(file);
					}
				}
				return acc;
			},
			{ toDelete: [], validFiles: [] }
		);

		// Delete the empty/corrupted files in parallel
		const deletionResults = await Promise.allSettled(
			toDelete.map(async (file) => {
				if (!this.dryRun) {
					await fs.promises.unlink(file.path);
				}
				result.deletedFiles.push(path.basename(file.path));
				this.logger.debug('Deleted empty/corrupted log file', { file: path.basename(file.path) });
			})
		);

		// Log deletion errors
		deletionResults.forEach((deleteResult, index) => {
			if (deleteResult.status === 'rejected') {
				const file = toDelete[index];
				if (file) {
					const errorMsg = `Failed to delete ${path.basename(file.path)}: ${formatErrorMessage(deleteResult.reason)}`;
					result.errors.push(errorMsg);
					this.logger.warn('Failed to delete empty/corrupted log file', {
						error: errorMsg,
						file: path.basename(file.path)
					});
				}
			}
		});

		return validFiles;
	}

	/**
	 * Execute cleanup based on retention policies
	 */
	async cleanup(logDir: string): Promise<CleanupResult> {
		const result: CleanupResult = {
			compressedFiles: [],
			compressedItems: [],
			deletedFiles: [],
			deletedItems: [],
			errors: [],
			totalSizeAfter: 0,
			totalSizeBefore: 0
		};

		try {
			let files = await this.analyzeDirectory(logDir);
			result.totalSizeBefore = this.calculateTotalSize(files);

			// Use ConsoleOutput for cleanup operations (respects MCP mode)
			// Only log in verbose mode to avoid cluttering output during session cleanup
			if (process.env['NODE_ENV'] !== 'test' && process.env['AI_VERBOSE'] === 'true') {
				const consoleOut = getConsoleOutput();
				consoleOut.dim(
					`[${MCP_ID}] Starting log cleanup - ${files.length} files, ${(result.totalSizeBefore / BYTES_PER_MB).toFixed(2)}MB`
				);
			}

			// Clean up empty/corrupted files first (log-specific)
			files = await this.cleanupEmptyFiles(files, result);

			// Apply retention policies using base class methods with log-specific overrides
			files = await this.applyAgeBasedCleanup(files, result);
			files = await this.applySizeBasedCleanup(files, result);
			files = await this.applyCountBasedCleanup(files, result);
			files = await this.applyLogCompressionPolicy(files, result);

			result.totalSizeAfter = this.calculateTotalSize(files);

			// Sync compressedItems/deletedItems with compressedFiles/deletedFiles
			result.compressedItems = [...result.compressedFiles];
			result.deletedItems = [...result.deletedFiles];

			// Use ConsoleOutput for cleanup operations (respects MCP mode)
			// Only log in verbose mode to avoid cluttering output during session cleanup
			if (process.env['NODE_ENV'] !== 'test' && process.env['AI_VERBOSE'] === 'true') {
				const consoleOut = getConsoleOutput();
				consoleOut.dim(
					`[${MCP_ID}] Log cleanup completed - deleted: ${result.deletedFiles.length}, compressed: ${result.compressedFiles.length}, saved: ${((result.totalSizeBefore - result.totalSizeAfter) / BYTES_PER_MB).toFixed(2)}MB`
				);
			}
		} catch (error) {
			const errorMsg = `Cleanup failed: ${formatErrorMessage(error)}`;
			result.errors.push(errorMsg);
			// Use ConsoleOutput for cleanup errors (respects MCP mode)
			if (process.env['NODE_ENV'] !== 'test') {
				const consoleOut = getConsoleOutput();
				consoleOut.error(`[${MCP_ID}] Log cleanup failed: ${formatErrorMessage(error)}`);
			}
		}

		return result;
	}

	/**
	 * Apply age-based cleanup: delete files older than maxAgeDays
	 * Enhanced for daily files - delete entire daily sets that are too old
	 */
	private async applyAgeBasedCleanup(files: FileInfo[], result: CleanupResult): Promise<FileInfo[]> {
		if (!this.policy.maxAgeDays) return files;

		const cutoffDate = this.calculateCutoffDate(this.policy.maxAgeDays);
		const cutoffDateStr = cutoffDate.toISOString().split('T')[0] ?? '';

		// Group files by date for daily file handling
		const filesByDate = this.groupFilesByDate(files);

		// Separate files to delete and keep from daily files
		const { toDelete: dailyToDelete, toKeep: dailyToKeep } = Object.entries(filesByDate).reduce<{
			toDelete: FileInfo[];
			toKeep: FileInfo[];
		}>(
			(acc, [dateStr, dateFiles]) => {
				// For daily files, if the date itself is older than cutoff, delete ALL files for that date
				if (dateStr < cutoffDateStr) {
					acc.toDelete.push(...dateFiles);
				} else {
					acc.toKeep.push(...dateFiles);
				}
				return acc;
			},
			{ toDelete: [], toKeep: [] }
		);

		// Handle non-daily files (legacy or special files) individually
		const nonDailyFiles = files.filter((file) => {
			const filename = path.basename(file.path);
			return !filename.match(/ai-\d{4}-\d{2}-\d{2}/);
		});

		const { toDelete: nonDailyToDelete, toKeep: nonDailyToKeep } = nonDailyFiles.reduce<{
			toDelete: FileInfo[];
			toKeep: FileInfo[];
		}>(
			(acc, file) => {
				if (file.modifiedTime < cutoffDate) {
					acc.toDelete.push(file);
				} else {
					acc.toKeep.push(file);
				}
				return acc;
			},
			{ toDelete: [], toKeep: [] }
		);

		const toDelete = [...dailyToDelete, ...nonDailyToDelete];
		const toKeep = [...dailyToKeep, ...nonDailyToKeep];

		// Delete files in parallel
		await Promise.allSettled(
			toDelete.map(async (file) => {
				try {
					if (!this.dryRun) {
						await fs.promises.unlink(file.path);
					}
					result.deletedFiles.push(path.basename(file.path));
					const ageDays = Math.floor((Date.now() - file.modifiedTime.getTime()) / MS_PER_DAY);
					this.logger.debug('Deleted old log file (age-based)', {
						ageDays,
						file: path.basename(file.path),
						maxAgeDays: this.policy.maxAgeDays
					});
				} catch (error) {
					const errorMsg = `Failed to delete ${path.basename(file.path)}: ${formatErrorMessage(error)}`;
					result.errors.push(errorMsg);
					this.logger.warn('Failed to delete old log file', { error: errorMsg, file: path.basename(file.path) });
				}
			})
		);

		return toKeep;
	}

	/**
	 * Apply size-based cleanup: keep total size under maxSizeMB
	 */
	private async applySizeBasedCleanup(files: FileInfo[], result: CleanupResult): Promise<FileInfo[]> {
		if (!this.policy.maxSizeMB) return files;

		const maxSizeBytes = this.policy.maxSizeMB * BYTES_PER_MB;
		const currentSize = files.reduce((sum, file) => sum + file.size, 0);

		if (currentSize <= maxSizeBytes) return files;

		// Sort by age (oldest first) and remove until under limit using reduce
		const { toDelete, toKeep } = files.reduce<{
			currentSize: number;
			toDelete: FileInfo[];
			toKeep: FileInfo[];
		}>(
			(acc, file) => {
				if (acc.currentSize <= maxSizeBytes) {
					return {
						...acc,
						toKeep: [...acc.toKeep, file]
					};
				} else {
					return {
						currentSize: acc.currentSize - file.size,
						toDelete: [...acc.toDelete, file],
						toKeep: acc.toKeep
					};
				}
			},
			{ currentSize, toDelete: [], toKeep: [] }
		);

		// Delete files in parallel
		await Promise.allSettled(
			toDelete.map(async (file) => {
				try {
					if (!this.dryRun) {
						await fs.promises.unlink(file.path);
					}
					result.deletedFiles.push(path.basename(file.path));
					this.logger.debug('Deleted log file to reduce size', {
						file: path.basename(file.path),
						sizeMB: (file.size / BYTES_PER_MB).toFixed(2)
					});
				} catch (error) {
					const errorMsg = `Failed to delete ${path.basename(file.path)}: ${formatErrorMessage(error)}`;
					result.errors.push(errorMsg);
					this.logger.warn('Failed to delete log file for size reduction', {
						error: errorMsg,
						file: path.basename(file.path)
					});
				}
			})
		);

		return toKeep;
	}

	/**
	 * Apply count-based cleanup: keep maximum maxFiles files
	 */
	private async applyCountBasedCleanup(files: FileInfo[], result: CleanupResult): Promise<FileInfo[]> {
		const maxFiles = this.policy.maxFiles ?? this.policy.maxCount;
		if (!maxFiles || files.length <= maxFiles) return files;

		const toDelete = files.slice(0, files.length - maxFiles);
		const toKeep = files.slice(-maxFiles);

		// Delete files in parallel
		await Promise.allSettled(
			toDelete.map(async (file) => {
				try {
					if (!this.dryRun) {
						await fs.promises.unlink(file.path);
					}
					result.deletedFiles.push(path.basename(file.path));
					this.logger.debug('Deleted log file to enforce count limit', {
						file: path.basename(file.path),
						maxFiles
					});
				} catch (error) {
					const errorMsg = `Failed to delete ${path.basename(file.path)}: ${formatErrorMessage(error)}`;
					result.errors.push(errorMsg);
					this.logger.warn('Failed to delete log file for count limit', {
						error: errorMsg,
						file: path.basename(file.path)
					});
				}
			})
		);

		return toKeep;
	}

	/**
	 * Apply compression policy: compress files older than compressAfterDays
	 * Enhanced for daily log files - compress entire daily files
	 */
	private async applyLogCompressionPolicy(files: FileInfo[], result: CleanupResult): Promise<FileInfo[]> {
		if (!this.policy.compressAfterDays) return files;

		const cutoffDate = this.calculateCutoffDate(this.policy.compressAfterDays);
		const cutoffDateStr = cutoffDate.toISOString().split('T')[0] ?? '';
		const today = new Date().toISOString().split('T')[0] ?? '';

		// Group files by date for daily file handling
		const filesByDate = this.groupFilesByDate(files);

		// Collect all files to compress
		const filesToCompress = Object.entries(filesByDate).flatMap(([dateStr, dateFiles]) => {
			// Only compress if the date is older than the cutoff (but not today's date)
			if (dateStr >= cutoffDateStr || dateStr === today) return [];

			// For daily files, compress all uncompressed files for this date (including rotated ones)
			return dateFiles.filter((file) => !file.isCompressed).map((file) => ({ dateStr, file }));
		});

		// Compress all files in parallel
		await Promise.allSettled(
			filesToCompress.map(async ({ dateStr, file }) => {
				try {
					if (!this.dryRun) {
						await this.compressFile(file.path);
					}
					result.compressedFiles.push(path.basename(file.path));
					this.logger.debug('Compressed daily log file', {
						ageDays: Math.floor((Date.now() - file.modifiedTime.getTime()) / MS_PER_DAY),
						date: dateStr,
						file: path.basename(file.path)
					});
				} catch (error) {
					const errorMsg = `Failed to compress ${path.basename(file.path)}: ${formatErrorMessage(error)}`;
					result.errors.push(errorMsg);
					this.logger.warn('Failed to compress daily log file', { error: errorMsg, file: path.basename(file.path) });
				}
			})
		);

		return files;
	}

	// Implement abstract methods from base class

	protected async deleteItem(item: FileInfo): Promise<void> {
		await fs.promises.unlink(item.path);
	}

	protected getItemAgeDays(item: FileInfo): number {
		return Math.floor((Date.now() - item.modifiedTime.getTime()) / MS_PER_DAY);
	}

	protected getItemDisplayId(item: FileInfo): string {
		return path.basename(item.path);
	}

	protected recordCompression(item: FileInfo, result: CleanupResult): void {
		result.compressedFiles.push(path.basename(item.path));
	}

	protected recordDeletion(item: FileInfo, result: CleanupResult): void {
		result.deletedFiles.push(path.basename(item.path));
	}
}
