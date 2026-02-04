/**
 * MCP Approval Cache Service
 *
 * Caches MCP server approval decisions for session or persistent reuse.
 * Prevents repeated approval prompts for the same server.
 */

import type { MCPApprovalCacheEntry, MCPApprovalMemory, MCPApprovalResult } from 'types/mcp-client.types';

import { existsSync } from 'fs';
import { getLogger } from 'output/logger';
import { resolve } from 'path';
import { readFile, writeFile } from 'utils/file-utils';

/**
 * Default path for persistent approval cache
 */
const DEFAULT_CACHE_PATH = '.ai/.mcp-approvals.json';

/**
 * Session expiry time (8 hours)
 */
const SESSION_EXPIRY_MS = 8 * 60 * 60 * 1000;

/**
 * MCP Approval Cache Service
 *
 * Responsibilities:
 * - Cache approved servers per session
 * - Support persistent approval storage
 * - Check if approval already granted before prompting
 * - Handle approval expiry
 */
export class MCPApprovalCacheService {
	private persistentCache = new Map<string, MCPApprovalCacheEntry>();
	private persistentCacheLoaded = false;
	private sessionCache = new Map<string, MCPApprovalCacheEntry>();
	private sessionStartTime = Date.now();

	constructor(private persistentCachePath: string = DEFAULT_CACHE_PATH) {}

	/**
	 * Check if a server is approved
	 */
	isApproved(serverId: string): boolean {
		// Check session cache first
		const sessionEntry = this.sessionCache.get(serverId);
		if (sessionEntry && this.isSessionEntryValid(sessionEntry)) {
			return sessionEntry.approved;
		}

		// Check persistent cache
		const persistentEntry = this.persistentCache.get(serverId);
		if (persistentEntry && this.isPersistentEntryValid(persistentEntry)) {
			return persistentEntry.approved;
		}

		return false;
	}

	/**
	 * Get cached approval entry for a server
	 */
	getApproval(serverId: string): MCPApprovalCacheEntry | null {
		// Check session cache first
		const sessionEntry = this.sessionCache.get(serverId);
		if (sessionEntry && this.isSessionEntryValid(sessionEntry)) {
			return sessionEntry;
		}

		// Check persistent cache
		const persistentEntry = this.persistentCache.get(serverId);
		if (persistentEntry && this.isPersistentEntryValid(persistentEntry)) {
			return persistentEntry;
		}

		return null;
	}

	/**
	 * Get allowed tools for an approved server
	 */
	getAllowedTools(serverId: string): null | string[] {
		const entry = this.getApproval(serverId);
		return entry?.allowedTools ?? null;
	}

	/**
	 * Cache an approval decision
	 */
	async cacheApproval(serverId: string, result: MCPApprovalResult, memoryType: MCPApprovalMemory): Promise<void> {
		const logger = getLogger();

		const entry: MCPApprovalCacheEntry = {
			allowedTools: result.allowedTools,
			approved: result.approved,
			expiresAt: this.calculateExpiry(memoryType),
			serverId,
			timestamp: result.timestamp
		};

		if (memoryType === 'always_ask') {
			// Don't cache at all
			logger.debug('Approval not cached (always_ask)', { serverId });
			return;
		}

		if (memoryType === 'session') {
			this.sessionCache.set(serverId, entry);
			logger.debug('Approval cached for session', { serverId });
			return;
		}

		if (memoryType === 'persistent') {
			this.persistentCache.set(serverId, entry);
			await this.savePersistentCache();
			logger.debug('Approval cached persistently', { serverId });
		}
	}

	/**
	 * Revoke approval for a server
	 */
	async revokeApproval(serverId: string): Promise<void> {
		const logger = getLogger();

		this.sessionCache.delete(serverId);
		this.persistentCache.delete(serverId);
		await this.savePersistentCache();

		logger.info('Approval revoked', { serverId });
	}

	/**
	 * Clear all session approvals
	 */
	clearSessionApprovals(): void {
		const logger = getLogger();
		const count = this.sessionCache.size;
		this.sessionCache.clear();
		logger.debug('Session approvals cleared', { count });
	}

	/**
	 * Clear all approvals (session and persistent)
	 */
	async clearAllApprovals(): Promise<void> {
		const logger = getLogger();
		const sessionCount = this.sessionCache.size;
		const persistentCount = this.persistentCache.size;

		this.sessionCache.clear();
		this.persistentCache.clear();
		await this.savePersistentCache();

		logger.info('All approvals cleared', { persistentCount, sessionCount });
	}

	/**
	 * Load persistent cache from disk
	 */
	async loadPersistentCache(): Promise<void> {
		const logger = getLogger();

		if (this.persistentCacheLoaded) {
			return;
		}

		const fullPath = resolve(process.cwd(), this.persistentCachePath);

		if (!existsSync(fullPath)) {
			this.persistentCacheLoaded = true;
			return;
		}

		try {
			const content = await readFile(fullPath);
			const data = JSON.parse(content) as { entries: MCPApprovalCacheEntry[] };

			for (const entry of data.entries) {
				// Convert date strings back to Date objects
				entry.timestamp = new Date(entry.timestamp);
				if (entry.expiresAt) {
					entry.expiresAt = new Date(entry.expiresAt);
				}

				// Only load valid entries
				if (this.isPersistentEntryValid(entry)) {
					this.persistentCache.set(entry.serverId, entry);
				}
			}

			this.persistentCacheLoaded = true;

			logger.debug('Loaded persistent approval cache', {
				entryCount: this.persistentCache.size,
				path: fullPath
			});
		} catch (error) {
			logger.warn('Failed to load persistent approval cache', {
				error: (error as Error).message,
				path: fullPath
			});
			this.persistentCacheLoaded = true;
		}
	}

	/**
	 * Save persistent cache to disk
	 */
	private async savePersistentCache(): Promise<void> {
		const logger = getLogger();
		const fullPath = resolve(process.cwd(), this.persistentCachePath);

		try {
			const entries = Array.from(this.persistentCache.values());
			const data = { entries, savedAt: new Date().toISOString() };
			await writeFile(fullPath, JSON.stringify(data, null, 2));

			logger.debug('Saved persistent approval cache', {
				entryCount: entries.length,
				path: fullPath
			});
		} catch (error) {
			logger.warn('Failed to save persistent approval cache', {
				error: (error as Error).message,
				path: fullPath
			});
		}
	}

	/**
	 * Check if a session cache entry is still valid
	 */
	private isSessionEntryValid(entry: MCPApprovalCacheEntry): boolean {
		const sessionAge = Date.now() - this.sessionStartTime;
		const entryAge = Date.now() - entry.timestamp.getTime();

		// Entry is valid if it was created in this session and hasn't expired
		return entryAge < SESSION_EXPIRY_MS && sessionAge < SESSION_EXPIRY_MS;
	}

	/**
	 * Check if a persistent cache entry is still valid
	 */
	private isPersistentEntryValid(entry: MCPApprovalCacheEntry): boolean {
		if (!entry.expiresAt) {
			return true; // No expiry means valid forever
		}
		return new Date() < entry.expiresAt;
	}

	/**
	 * Calculate expiry time based on memory type
	 */
	private calculateExpiry(memoryType: MCPApprovalMemory): Date | undefined {
		if (memoryType === 'session') {
			return new Date(Date.now() + SESSION_EXPIRY_MS);
		}
		if (memoryType === 'persistent') {
			// Persistent approvals expire after 30 days
			return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
		}
		return undefined;
	}

	/**
	 * Get cache statistics
	 */
	getStats(): { persistentCount: number; sessionCount: number } {
		return {
			persistentCount: this.persistentCache.size,
			sessionCount: this.sessionCache.size
		};
	}
}

/**
 * Singleton instance
 */
let instance: MCPApprovalCacheService | null = null;

/**
 * Get the MCP Approval Cache service instance
 */
export function getMCPApprovalCache(cachePath?: string): MCPApprovalCacheService {
	instance ??= new MCPApprovalCacheService(cachePath);
	return instance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetMCPApprovalCache(): void {
	instance = null;
}
