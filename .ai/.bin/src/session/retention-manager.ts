/**
 * Session retention and cleanup manager
 * Handles automated cleanup of session files based on configurable policies
 */

import type { SessionSummary } from 'types/session.types';

import { BYTES_PER_MB, MS_PER_DAY } from 'config/constants';
import * as fs from 'fs';
import { getLogger } from 'output/logger';
import * as path from 'path';
import {
	type BaseCleanupResult,
	type BaseFileInfo,
	BaseRetentionManager,
	type BaseRetentionPolicy,
	type RetentionLogger
} from 'utils/base-retention-manager';
import { formatErrorMessage } from 'utils/error-utils';

// Re-export base types with session-specific aliases
export interface SessionCleanupResult extends BaseCleanupResult {
	compressedSessions: string[];
	deletedSessions: string[];
}

export interface SessionFileInfo extends BaseFileInfo {
	session: SessionSummary;
	sessionId: string;
}

// SessionRetentionPolicy uses all fields from base (maxAgeDays, maxSizeMB, maxCount, compressAfterDays)
export type SessionRetentionPolicy = BaseRetentionPolicy;

/**
 * Session retention manager extending the base retention manager
 */
export class SessionRetentionManager extends BaseRetentionManager<
	SessionRetentionPolicy,
	SessionCleanupResult,
	SessionFileInfo
> {
	protected readonly logger: RetentionLogger = getLogger();

	/**
	 * Analyse session directory and return session file information
	 */
	async analyzeSessionDirectory(sessionDir: string, sessions: SessionSummary[]): Promise<SessionFileInfo[]> {
		try {
			const files = await fs.promises.readdir(sessionDir);

			const sessionFiles = await Promise.all(
				files
					// Filter to only main session files, excluding snapshots
					.filter((file) => file.endsWith('.json') && !file.endsWith('.snapshot.json'))
					.map(async (file) => {
						const sessionId = file.replace('.json', '');
						const session = sessions.find((s) => s.session_id === sessionId);

						if (!session) return null; // Skip sessions that aren't in the summary

						const filePath = path.join(sessionDir, file);
						const stats = await fs.promises.stat(filePath);
						const isCompressed = file.endsWith('.json.gz');

						return {
							filePath,
							isCompressed,
							modifiedTime: stats.mtime,
							session,
							sessionId,
							size: stats.size
						};
					})
			).then((results) => results.filter((file): file is SessionFileInfo => file !== null));

			// Sort by updated_at (most recent first)
			return sessionFiles.sort(
				(a, b) => new Date(b.session.updated_at).getTime() - new Date(a.session.updated_at).getTime()
			);
		} catch (error) {
			this.logger.error('Failed to analyze session directory', error instanceof Error ? error : undefined, {
				sessionDir
			});
			throw error;
		}
	}

	/**
	 * Execute cleanup based on retention policies
	 */
	async cleanup(sessionDir: string, sessions: SessionSummary[]): Promise<SessionCleanupResult> {
		const result: SessionCleanupResult = {
			compressedItems: [],
			compressedSessions: [],
			deletedItems: [],
			deletedSessions: [],
			errors: [],
			totalSizeAfter: 0,
			totalSizeBefore: 0
		};

		try {
			let sessionFiles = await this.analyzeSessionDirectory(sessionDir, sessions);
			result.totalSizeBefore = this.calculateTotalSize(sessionFiles);

			this.logger.debug('Starting session cleanup');
			this.logger.debug('Session cleanup configuration', {
				dryRun: this.dryRun,
				policy: this.policy,
				sessionCount: sessionFiles.length,
				sessionDir,
				totalSizeMB: (result.totalSizeBefore / BYTES_PER_MB).toFixed(2)
			});

			// Apply retention policies in order
			sessionFiles = await this.applyAgeBasedCleanup(sessionFiles, result);
			sessionFiles = await this.applySizeBasedCleanup(sessionFiles, result);
			sessionFiles = await this.applyCountBasedCleanup(sessionFiles, result);
			sessionFiles = await this.applySessionCompressionPolicy(sessionFiles, result);

			result.totalSizeAfter = this.calculateTotalSize(sessionFiles);

			// Sync base result fields with session-specific fields
			result.compressedItems = [...result.compressedSessions];
			result.deletedItems = [...result.deletedSessions];

			this.logger.debug('Session cleanup completed');
			this.logger.debug('Session cleanup results', {
				compressedCount: result.compressedSessions.length,
				deletedCount: result.deletedSessions.length,
				errors: result.errors.length,
				sizeAfterMB: (result.totalSizeAfter / BYTES_PER_MB).toFixed(2),
				sizeBeforeMB: (result.totalSizeBefore / BYTES_PER_MB).toFixed(2),
				sizeSavedMB: ((result.totalSizeBefore - result.totalSizeAfter) / BYTES_PER_MB).toFixed(2)
			});
		} catch (error) {
			const errorMsg = `Session cleanup failed: ${formatErrorMessage(error)}`;
			result.errors.push(errorMsg);
			this.logger.error('Session cleanup failed', error instanceof Error ? error : undefined, { sessionDir });
		}

		return result;
	}

	/**
	 * Apply age-based cleanup: delete sessions older than maxAgeDays
	 */
	private async applyAgeBasedCleanup(
		sessionFiles: SessionFileInfo[],
		result: SessionCleanupResult
	): Promise<SessionFileInfo[]> {
		if (!this.policy.maxAgeDays) return sessionFiles;

		const cutoffDate = this.calculateCutoffDate(this.policy.maxAgeDays);

		const [toDelete, toKeep] = sessionFiles.reduce<[SessionFileInfo[], SessionFileInfo[]]>(
			([del, keep], file) => {
				const sessionDate = new Date(file.session.updated_at);
				if (sessionDate < cutoffDate) {
					del.push(file);
				} else {
					keep.push(file);
				}
				return [del, keep];
			},
			[[], []]
		);

		const deleteResults = await Promise.allSettled(
			toDelete.map(async (file) => {
				if (!this.dryRun) {
					await this.deleteSessionWithSnapshot(file.filePath);
				}
				result.deletedSessions.push(file.sessionId);
				const ageDays = Math.floor((Date.now() - new Date(file.session.updated_at).getTime()) / MS_PER_DAY);
				this.logger.debug('Deleted old session (age-based)', {
					ageDays,
					maxAgeDays: this.policy.maxAgeDays,
					sessionId: file.sessionId,
					status: file.session.status
				});
				return file;
			})
		);

		deleteResults.forEach((deleteResult, index) => {
			if (deleteResult.status === 'rejected') {
				const file = toDelete[index];
				if (!file) return;
				const errorMsg = `Failed to delete session ${file.sessionId}: ${formatErrorMessage(deleteResult.reason)}`;
				result.errors.push(errorMsg);
				this.logger.warn('Failed to delete old session', { error: errorMsg, sessionId: file.sessionId });
			}
		});

		return toKeep;
	}

	/**
	 * Apply size-based cleanup: keep total size under maxSizeMB
	 */
	private async applySizeBasedCleanup(
		sessionFiles: SessionFileInfo[],
		result: SessionCleanupResult
	): Promise<SessionFileInfo[]> {
		if (!this.policy.maxSizeMB) return sessionFiles;

		const maxSizeBytes = this.policy.maxSizeMB * BYTES_PER_MB;
		const currentSize = sessionFiles.reduce((sum, file) => sum + file.size, 0);

		if (currentSize <= maxSizeBytes) return sessionFiles;

		// Sort by age (oldest first) and remove until under limit
		const { toDelete, toKeep } = sessionFiles.reduce<{
			currentSize: number;
			toDelete: SessionFileInfo[];
			toKeep: SessionFileInfo[];
		}>(
			(acc, file) => {
				if (acc.currentSize <= maxSizeBytes) {
					acc.toKeep.push(file);
				} else {
					acc.toDelete.push(file);
					acc.currentSize -= file.size;
				}
				return acc;
			},
			{ currentSize, toDelete: [], toKeep: [] }
		);

		const deleteResults = await Promise.allSettled(
			toDelete.map(async (file) => {
				if (!this.dryRun) {
					await this.deleteSessionWithSnapshot(file.filePath);
				}
				result.deletedSessions.push(file.sessionId);
				this.logger.debug('Deleted session to reduce size', {
					maxSizeMB: this.policy.maxSizeMB,
					sessionId: file.sessionId,
					sizeMB: (file.size / BYTES_PER_MB).toFixed(2)
				});
				return file;
			})
		);

		deleteResults.forEach((deleteResult, index) => {
			if (deleteResult.status === 'rejected') {
				const file = toDelete[index];
				if (!file) return;
				const errorMsg = `Failed to delete session ${file.sessionId}: ${formatErrorMessage(deleteResult.reason)}`;
				result.errors.push(errorMsg);
				this.logger.warn('Failed to delete session for size reduction', {
					error: errorMsg,
					sessionId: file.sessionId
				});
			}
		});

		return toKeep;
	}

	/**
	 * Apply count-based cleanup: keep maximum maxCount sessions
	 */
	private async applyCountBasedCleanup(
		sessionFiles: SessionFileInfo[],
		result: SessionCleanupResult
	): Promise<SessionFileInfo[]> {
		if (!this.policy.maxCount || sessionFiles.length <= this.policy.maxCount) return sessionFiles;

		const toDelete = sessionFiles.slice(this.policy.maxCount);
		const toKeep = sessionFiles.slice(0, this.policy.maxCount);

		const deleteResults = await Promise.allSettled(
			toDelete.map(async (file) => {
				if (!this.dryRun) {
					await this.deleteSessionWithSnapshot(file.filePath);
				}
				result.deletedSessions.push(file.sessionId);
				this.logger.debug('Deleted session to enforce count limit', {
					maxCount: this.policy.maxCount,
					sessionId: file.sessionId,
					status: file.session.status
				});
				return file;
			})
		);

		deleteResults.forEach((deleteResult, index) => {
			if (deleteResult.status === 'rejected') {
				const file = toDelete[index];
				if (!file) return;
				const errorMsg = `Failed to delete session ${file.sessionId}: ${formatErrorMessage(deleteResult.reason)}`;
				result.errors.push(errorMsg);
				this.logger.warn('Failed to delete session for count limit', {
					error: errorMsg,
					sessionId: file.sessionId
				});
			}
		});

		return toKeep;
	}

	/**
	 * Apply compression policy: compress sessions older than compressAfterDays
	 */
	private async applySessionCompressionPolicy(
		sessionFiles: SessionFileInfo[],
		result: SessionCleanupResult
	): Promise<SessionFileInfo[]> {
		if (!this.policy.compressAfterDays) return sessionFiles;

		const cutoffDate = this.calculateCutoffDate(this.policy.compressAfterDays);

		const filesToCompress = sessionFiles.filter((file) => {
			if (file.isCompressed) return false;
			const sessionDate = new Date(file.session.updated_at);
			return sessionDate < cutoffDate;
		});

		const compressionResults = await Promise.allSettled(
			filesToCompress.map(async (file) => {
				if (!this.dryRun) {
					await this.compressFileWithStats(file.filePath);
				}
				result.compressedSessions.push(file.sessionId);
				const sessionDate = new Date(file.session.updated_at);
				const ageDays = Math.floor((Date.now() - sessionDate.getTime()) / MS_PER_DAY);
				this.logger.debug('Compressed old session file', {
					ageDays,
					compressAfterDays: this.policy.compressAfterDays,
					sessionId: file.sessionId
				});
				return file;
			})
		);

		compressionResults.forEach((compressionResult, index) => {
			if (compressionResult.status === 'rejected') {
				const file = filesToCompress[index];
				if (!file) return;
				const errorMsg = `Failed to compress session ${file.sessionId}: ${formatErrorMessage(compressionResult.reason)}`;
				result.errors.push(errorMsg);
				this.logger.warn('Failed to compress session file', { error: errorMsg, sessionId: file.sessionId });
			}
		});

		return sessionFiles;
	}

	/**
	 * Delete a session file and its associated snapshot
	 */
	private async deleteSessionWithSnapshot(filePath: string): Promise<void> {
		// Delete the main session file
		await fs.promises.unlink(filePath);

		// Also delete the snapshot if it exists
		const snapshotPath = filePath.replace('.json', '.snapshot.json');
		try {
			await fs.promises.unlink(snapshotPath);
		} catch {
			// Ignore errors when deleting snapshot (may not exist)
		}
	}

	// Implement abstract methods from base class

	protected async deleteItem(item: SessionFileInfo): Promise<void> {
		await this.deleteSessionWithSnapshot(item.filePath);
	}

	protected getItemAgeDays(item: SessionFileInfo): number {
		return Math.floor((Date.now() - new Date(item.session.updated_at).getTime()) / MS_PER_DAY);
	}

	protected getItemDisplayId(item: SessionFileInfo): string {
		return item.sessionId;
	}

	protected recordCompression(item: SessionFileInfo, result: SessionCleanupResult): void {
		result.compressedSessions.push(item.sessionId);
	}

	protected recordDeletion(item: SessionFileInfo, result: SessionCleanupResult): void {
		result.deletedSessions.push(item.sessionId);
	}
}
