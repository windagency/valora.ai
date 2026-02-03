/**
 * File Lock Utility - Atomic file operations with locking
 *
 * Provides thread-safe file operations for shared volumes across containers
 */

import type { FileLock } from 'types/exploration.types';

import { promises as fs } from 'fs';
import { getLogger } from 'output/logger';
import * as path from 'path';

const logger = getLogger();

/**
 * Type guard to check if error has a code property (NodeJS error)
 */
function hasErrorCode(error: unknown): error is { code: string } {
	return typeof error === 'object' && error !== null && 'code' in error;
}

/**
 * Get error message from unknown error
 */
export interface LockOptions {
	retries?: number; // Default: 3
	retry_delay_ms?: number; // Default: 100ms (exponential backoff)
	timeout_ms?: number; // Default: 5000ms
}

export interface WriteOptions extends LockOptions {
	pretty?: boolean; // Pretty-print JSON
}

export class FileLockManager {
	private defaultOptions: Required<LockOptions> = {
		retries: 3,
		retry_delay_ms: 100,
		timeout_ms: 5000
	};

	/**
	 * Acquire a lock on a file
	 */
	async acquireLock(filePath: string, lockerId: string, options?: LockOptions): Promise<FileLock> {
		const opts = { ...this.defaultOptions, ...options };
		const lockPath = this.getLockPath(filePath);
		const expiresAt = new Date(Date.now() + opts.timeout_ms).toISOString();

		const lock: FileLock = {
			acquired_at: new Date().toISOString(),
			acquired_by: lockerId,
			expires_at: expiresAt,
			lock_id: this.generateLockId()
		};

		let attempt = 0;
		let delay = opts.retry_delay_ms;

		while (attempt <= opts.retries) {
			try {
				// Try to create lock file exclusively (fails if exists)
				await fs.writeFile(lockPath, JSON.stringify(lock, null, 2), { flag: 'wx' });
				logger.debug(`Lock acquired: ${lockPath} by ${lockerId}`);
				return lock;
			} catch (error) {
				if (hasErrorCode(error) && error.code === 'EEXIST') {
					// Lock file exists, check if it's expired
					try {
						const existingLockData = await fs.readFile(lockPath, 'utf-8');
						const existingLock = JSON.parse(existingLockData) as FileLock;

						// Check if lock is expired
						if (new Date(existingLock.expires_at) < new Date()) {
							logger.debug(`Lock expired, removing: ${lockPath}`);
							await this.releaseLock(filePath, existingLock.lock_id, true);
							// Retry immediately
							continue;
						}

						// Lock is still valid, wait and retry
						if (attempt < opts.retries) {
							logger.debug(
								`Lock held by ${existingLock.acquired_by}, retrying in ${delay}ms (attempt ${attempt + 1}/${opts.retries})`
							);
							await this.sleep(delay);
							delay *= 2; // Exponential backoff
							attempt++;
							continue;
						}
					} catch {
						// If we can't read the lock file, try to remove it
						try {
							await fs.unlink(lockPath);
							continue;
						} catch {
							// Ignore
						}
					}
				}

				// Final attempt failed
				if (attempt >= opts.retries) {
					throw new Error(
						`Failed to acquire lock on ${filePath} after ${opts.retries} retries: ${getErrorMessage(error)}`
					);
				}

				attempt++;
			}
		}

		throw new Error(`Failed to acquire lock on ${filePath}: maximum retries exceeded`);
	}

	/**
	 * Release a lock
	 */
	async releaseLock(filePath: string, lockId: string, force: boolean = false): Promise<void> {
		const lockPath = this.getLockPath(filePath);

		try {
			if (!force) {
				// Verify lock belongs to the caller
				const lockData = await fs.readFile(lockPath, 'utf-8');
				const lock = JSON.parse(lockData) as FileLock;

				if (lock.lock_id !== lockId) {
					throw new Error(`Cannot release lock: lock ID mismatch (expected ${lockId}, got ${lock.lock_id})`);
				}
			}

			// Remove lock file
			await fs.unlink(lockPath);
			logger.debug(`Lock released: ${lockPath}`);
		} catch (error) {
			if (!hasErrorCode(error) || error.code !== 'ENOENT') {
				throw new Error(`Failed to release lock on ${filePath}: ${getErrorMessage(error)}`);
			}
			// Lock file doesn't exist, which is fine
		}
	}

	/**
	 * Read a file with locking
	 */
	async readWithLock<T = unknown>(filePath: string, lockerId: string, options?: LockOptions): Promise<null | T> {
		let lock: FileLock | null = null;

		try {
			// Acquire lock
			lock = await this.acquireLock(filePath, lockerId, options);

			// Read file
			const data = await fs.readFile(filePath, 'utf-8');
			return JSON.parse(data) as T;
		} catch (error) {
			if (hasErrorCode(error) && error.code === 'ENOENT') {
				return null; // File doesn't exist
			}
			throw new Error(`Failed to read file ${filePath}: ${getErrorMessage(error)}`);
		} finally {
			// Always release lock
			if (lock) {
				await this.releaseLock(filePath, lock.lock_id);
			}
		}
	}

	/**
	 * Write a file with locking (atomic write)
	 */
	async writeWithLock<T = unknown>(filePath: string, data: T, lockerId: string, options?: WriteOptions): Promise<void> {
		let lock: FileLock | null = null;

		try {
			// Acquire lock
			lock = await this.acquireLock(filePath, lockerId, options);

			// Write to temporary file first (atomic operation)
			const tempPath = `${filePath}.tmp.${lock.lock_id}`;
			const jsonData = options?.pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);

			await fs.writeFile(tempPath, jsonData, 'utf-8');

			// Atomic rename (this is the key operation)
			await fs.rename(tempPath, filePath);

			logger.debug(`File written atomically: ${filePath}`);
		} catch (error) {
			throw new Error(`Failed to write file ${filePath}: ${getErrorMessage(error)}`);
		} finally {
			// Always release lock
			if (lock) {
				await this.releaseLock(filePath, lock.lock_id);
			}
		}
	}

	/**
	 * Update a file with locking (read-modify-write)
	 */
	async updateWithLock<T = unknown>(
		filePath: string,
		lockerId: string,
		updater: (current: null | T) => T,
		options?: WriteOptions
	): Promise<T> {
		let lock: FileLock | null = null;

		try {
			// Acquire lock
			lock = await this.acquireLock(filePath, lockerId, options);

			// Read current data
			let currentData: null | T = null;
			try {
				const fileContent = await fs.readFile(filePath, 'utf-8');
				currentData = JSON.parse(fileContent) as T;
			} catch (error) {
				if (!hasErrorCode(error) || error.code !== 'ENOENT') {
					throw error;
				}
				// File doesn't exist, currentData stays null
			}

			// Apply update
			const updatedData = updater(currentData);

			// Write updated data atomically
			const tempPath = `${filePath}.tmp.${lock.lock_id}`;
			const jsonData = options?.pretty ? JSON.stringify(updatedData, null, 2) : JSON.stringify(updatedData);

			await fs.writeFile(tempPath, jsonData, 'utf-8');
			await fs.rename(tempPath, filePath);

			logger.debug(`File updated atomically: ${filePath}`);
			return updatedData;
		} catch (error) {
			throw new Error(`Failed to update file ${filePath}: ${getErrorMessage(error)}`);
		} finally {
			// Always release lock
			if (lock) {
				await this.releaseLock(filePath, lock.lock_id);
			}
		}
	}

	/**
	 * Append to an array in a JSON file with locking
	 */
	async appendToArray<T = unknown>(
		filePath: string,
		item: T,
		lockerId: string,
		arrayKey: string = 'items',
		options?: WriteOptions
	): Promise<void> {
		await this.updateWithLock<Record<string, unknown>>(
			filePath,
			lockerId,
			(current: null | Record<string, unknown>) => {
				const data = current ?? {};
				const currentArray = data[arrayKey];

				if (!Array.isArray(currentArray)) {
					data[arrayKey] = [item];
				} else {
					const typedArray = currentArray as unknown[];
					data[arrayKey] = [...typedArray, item];
				}

				return data;
			},
			options
		);
	}

	/**
	 * Check if a file is locked
	 */
	async isLocked(filePath: string): Promise<boolean> {
		const lockPath = this.getLockPath(filePath);

		try {
			const lockData = await fs.readFile(lockPath, 'utf-8');
			const lock = JSON.parse(lockData) as FileLock;

			// Check if lock is expired
			if (new Date(lock.expires_at) < new Date()) {
				return false;
			}

			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Get lock information
	 */
	async getLockInfo(filePath: string): Promise<FileLock | null> {
		const lockPath = this.getLockPath(filePath);

		try {
			const lockData = await fs.readFile(lockPath, 'utf-8');
			const lock = JSON.parse(lockData) as FileLock;

			// Check if lock is expired
			if (new Date(lock.expires_at) < new Date()) {
				return null;
			}

			return lock;
		} catch {
			return null;
		}
	}

	/**
	 * Clean up expired locks
	 */
	async cleanupExpiredLocks(directory: string): Promise<number> {
		let cleaned = 0;

		try {
			const files = await fs.readdir(directory);

			for (const file of files) {
				if (file.endsWith('.lock')) {
					const lockPath = path.join(directory, file);

					try {
						const lockData = await fs.readFile(lockPath, 'utf-8');
						const lock = JSON.parse(lockData) as FileLock;

						// Check if lock is expired
						if (new Date(lock.expires_at) < new Date()) {
							await fs.unlink(lockPath);
							logger.debug(`Cleaned up expired lock: ${lockPath}`);
							cleaned++;
						}
					} catch {
						// If we can't read/parse the lock, remove it
						try {
							await fs.unlink(lockPath);
							cleaned++;
						} catch {
							// Ignore
						}
					}
				}
			}
		} catch (error) {
			logger.error(`Failed to cleanup expired locks in ${directory}: ${getErrorMessage(error)}`);
		}

		return cleaned;
	}

	/**
	 * Force remove all locks in a directory
	 */
	async forceRemoveAllLocks(directory: string): Promise<number> {
		let removed = 0;

		try {
			const files = await fs.readdir(directory);

			for (const file of files) {
				if (file.endsWith('.lock')) {
					const lockPath = path.join(directory, file);
					try {
						await fs.unlink(lockPath);
						removed++;
					} catch {
						// Ignore
					}
				}
			}
		} catch (error) {
			logger.error(`Failed to remove locks in ${directory}: ${getErrorMessage(error)}`);
		}

		return removed;
	}

	/**
	 * Get lock file path
	 */
	private getLockPath(filePath: string): string {
		return `${filePath}.lock`;
	}

	/**
	 * Generate unique lock ID
	 */
	private generateLockId(): string {
		return `lock-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
	}

	/**
	 * Sleep helper
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === 'string') {
		return error;
	}
	return String(error);
}

// Singleton instance for convenience
let globalLockManager: FileLockManager | null = null;

/**
 * Get global file lock manager instance
 */
export function getFileLockManager(): FileLockManager {
	globalLockManager ??= new FileLockManager();
	return globalLockManager;
}
