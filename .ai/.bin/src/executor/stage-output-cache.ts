/**
 * Stage Output Cache - Persistent caching of stage outputs to eliminate redundant LLM calls
 *
 * Caches stage outputs based on input file contents, allowing subsequent command
 * executions to skip expensive LLM calls when inputs haven't changed.
 *
 * Cache invalidation:
 * - Input file content changes (detected via hash)
 * - TTL expiration (default: 1 hour)
 * - Manual invalidation via cache.clear()
 */

import { createHash } from 'crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { getLogger } from 'output/logger';
import { join } from 'path';

/**
 * Configuration for stage-level caching
 */
export interface StageCacheConfig {
	/** Whether caching is enabled for this stage */
	enabled: boolean;
	/** TTL in milliseconds (default: 1 hour) */
	ttl_ms?: number;
	/** Input keys that should be used for cache key generation */
	cache_key_inputs?: string[];
	/** File paths to include in cache key hash (monitors file changes) */
	file_dependencies?: string[];
}

/**
 * Cached stage output entry
 */
export interface StageCacheEntry {
	/** Stage identifier (stage.prompt) */
	stageId: string;
	/** Hash of inputs used to generate this cache entry */
	inputHash: string;
	/** Timestamp when entry was created */
	createdAt: number;
	/** TTL in milliseconds */
	ttl_ms: number;
	/** The cached stage outputs */
	outputs: Record<string, unknown>;
	/** Duration of original execution in ms (for metrics) */
	originalDuration_ms: number;
}

/**
 * Result of a cache lookup
 */
export interface StageCacheLookupResult {
	entry?: StageCacheEntry;
	hit: boolean;
	reason?: 'expired' | 'file_changed' | 'input_changed' | 'no_entry';
	savedTime_ms?: number;
}

/**
 * Default TTL: 1 hour
 */
const DEFAULT_TTL_MS = 60 * 60 * 1000;

/**
 * Cache directory relative to .ai/
 */
const CACHE_DIR = '.ai/cache/stages';

/**
 * Maximum number of cache entries to keep
 */
const MAX_CACHE_ENTRIES = 100;

/**
 * Stage Output Cache Service
 *
 * Provides persistent file-based caching of stage outputs.
 * Cache entries are stored in .ai/cache/stages/ as JSON files.
 */
export class StageOutputCache {
	private static instance: null | StageOutputCache = null;
	private cacheDir: string;
	private cleanupTimer: NodeJS.Timeout | null = null;
	private defaultTtl: number;

	constructor(projectRoot: string = process.cwd(), defaultTtl: number = DEFAULT_TTL_MS) {
		this.cacheDir = join(projectRoot, CACHE_DIR);
		this.defaultTtl = defaultTtl;
		this.ensureCacheDir();
		this.startCleanupTimer();
	}

	/**
	 * Get singleton instance
	 */
	static getInstance(projectRoot?: string): StageOutputCache {
		StageOutputCache.instance ??= new StageOutputCache(projectRoot);
		return StageOutputCache.instance;
	}

	/**
	 * Reset singleton instance (for testing)
	 */
	static resetInstance(): void {
		if (StageOutputCache.instance) {
			StageOutputCache.instance.stop();
		}
		StageOutputCache.instance = null;
	}

	/**
	 * Generate a cache key from stage ID and inputs
	 */
	generateCacheKey(stageId: string, inputs: Record<string, unknown>, config?: StageCacheConfig): string {
		const keyInputs = this.collectKeyInputs(inputs, config);

		// Add file dependency hashes if specified
		if (config?.file_dependencies) {
			keyInputs['__file_hashes__'] = this.computeFileDependencyHashes(config.file_dependencies);
		}

		// Generate hash from stage ID and inputs
		const keyData = JSON.stringify({
			inputs: this.sortObjectKeys(keyInputs),
			stageId
		});

		return createHash('sha256').update(keyData).digest('hex').substring(0, 24);
	}

	/**
	 * Collect inputs to use for cache key generation
	 */
	private collectKeyInputs(inputs: Record<string, unknown>, config?: StageCacheConfig): Record<string, unknown> {
		const keyInputs: Record<string, unknown> = {};

		if (config?.cache_key_inputs && config.cache_key_inputs.length > 0) {
			// Use only specified inputs
			for (const key of config.cache_key_inputs) {
				if (key in inputs) {
					keyInputs[key] = inputs[key];
				}
			}
		} else {
			// Use all inputs (excluding large content fields)
			for (const [key, value] of Object.entries(inputs)) {
				// Skip content fields (they're derived from file paths)
				if (!key.endsWith('_content')) {
					keyInputs[key] = value;
				}
			}
		}

		return keyInputs;
	}

	/**
	 * Compute hashes for file dependencies
	 */
	private computeFileDependencyHashes(filePaths: string[]): Record<string, string> {
		const logger = getLogger();
		const fileHashes: Record<string, string> = {};

		for (const filePath of filePaths) {
			try {
				if (existsSync(filePath)) {
					const content = readFileSync(filePath, 'utf-8');
					fileHashes[filePath] = this.hashContent(content);
				}
			} catch (error) {
				logger.debug(`Failed to hash file dependency: ${filePath}`, { error: (error as Error).message });
			}
		}

		return fileHashes;
	}

	/**
	 * Store a stage output in the cache
	 */
	set(
		stageId: string,
		inputs: Record<string, unknown>,
		outputs: Record<string, unknown>,
		durationMs: number,
		config?: StageCacheConfig
	): void {
		const logger = getLogger();
		const cacheKey = this.generateCacheKey(stageId, inputs, config);
		const inputHash = this.hashContent(JSON.stringify(inputs));

		const entry: StageCacheEntry = {
			createdAt: Date.now(),
			inputHash,
			originalDuration_ms: durationMs,
			outputs,
			stageId,
			ttl_ms: config?.ttl_ms ?? this.defaultTtl
		};

		try {
			// Enforce max cache size
			this.evictIfNeeded();

			const filePath = this.getCacheFilePath(cacheKey);
			writeFileSync(filePath, JSON.stringify(entry, null, 2), 'utf-8');

			logger.info('Stage output cached', {
				cacheKey,
				durationMs,
				stageId,
				ttl_ms: entry.ttl_ms
			});
		} catch (error) {
			logger.warn('Failed to cache stage output', {
				error: (error as Error).message,
				stageId
			});
		}
	}

	/**
	 * Look up a cached stage output
	 */
	get(stageId: string, inputs: Record<string, unknown>, config?: StageCacheConfig): StageCacheLookupResult {
		const logger = getLogger();
		const cacheKey = this.generateCacheKey(stageId, inputs, config);
		const filePath = this.getCacheFilePath(cacheKey);

		if (!existsSync(filePath)) {
			return { hit: false, reason: 'no_entry' };
		}

		try {
			const content = readFileSync(filePath, 'utf-8');
			const entry = JSON.parse(content) as StageCacheEntry;

			// Check TTL
			const now = Date.now();
			if (now - entry.createdAt > entry.ttl_ms) {
				unlinkSync(filePath);
				logger.debug('Stage cache entry expired', { cacheKey, stageId });
				return { hit: false, reason: 'expired' };
			}

			// Check input hash matches
			const currentInputHash = this.hashContent(JSON.stringify(inputs));
			if (currentInputHash !== entry.inputHash) {
				unlinkSync(filePath);
				logger.debug('Stage cache entry invalidated (inputs changed)', { cacheKey, stageId });
				return { hit: false, reason: 'input_changed' };
			}

			// Check file dependencies if specified
			if (config?.file_dependencies) {
				const currentKey = this.generateCacheKey(stageId, inputs, config);
				if (currentKey !== cacheKey) {
					unlinkSync(filePath);
					logger.debug('Stage cache entry invalidated (file changed)', { cacheKey, stageId });
					return { hit: false, reason: 'file_changed' };
				}
			}

			logger.info('Stage cache hit', {
				ageMs: now - entry.createdAt,
				cacheKey,
				savedTime_ms: entry.originalDuration_ms,
				stageId
			});

			return {
				entry,
				hit: true,
				savedTime_ms: entry.originalDuration_ms
			};
		} catch (error) {
			logger.warn('Failed to read stage cache entry', {
				error: (error as Error).message,
				stageId
			});
			return { hit: false, reason: 'no_entry' };
		}
	}

	/**
	 * Invalidate a specific cache entry
	 */
	invalidate(stageId: string, inputs: Record<string, unknown>, config?: StageCacheConfig): boolean {
		const cacheKey = this.generateCacheKey(stageId, inputs, config);
		const filePath = this.getCacheFilePath(cacheKey);

		if (existsSync(filePath)) {
			unlinkSync(filePath);
			return true;
		}
		return false;
	}

	/**
	 * Invalidate all cache entries for a stage
	 */
	invalidateStage(stageId: string): number {
		let count = 0;
		try {
			const files = readdirSync(this.cacheDir);
			for (const file of files) {
				if (file.endsWith('.json')) {
					const filePath = join(this.cacheDir, file);
					try {
						const content = readFileSync(filePath, 'utf-8');
						const entry = JSON.parse(content) as StageCacheEntry;
						if (entry.stageId === stageId) {
							unlinkSync(filePath);
							count++;
						}
					} catch {
						// Ignore parse errors
					}
				}
			}
		} catch {
			// Ignore directory errors
		}
		return count;
	}

	/**
	 * Clear all cache entries
	 */
	clear(): void {
		try {
			const files = readdirSync(this.cacheDir);
			for (const file of files) {
				if (file.endsWith('.json')) {
					unlinkSync(join(this.cacheDir, file));
				}
			}
		} catch {
			// Ignore errors
		}
	}

	/**
	 * Get cache statistics
	 */
	getStats(): { entries: Array<{ ageMs: number; savedTime_ms: number; stageId: string }>; size: number } {
		const now = Date.now();
		const entries: Array<{ ageMs: number; savedTime_ms: number; stageId: string }> = [];

		try {
			const files = readdirSync(this.cacheDir);
			for (const file of files) {
				if (file.endsWith('.json')) {
					try {
						const content = readFileSync(join(this.cacheDir, file), 'utf-8');
						const entry = JSON.parse(content) as StageCacheEntry;
						entries.push({
							ageMs: now - entry.createdAt,
							savedTime_ms: entry.originalDuration_ms,
							stageId: entry.stageId
						});
					} catch {
						// Ignore parse errors
					}
				}
			}
		} catch {
			// Ignore directory errors
		}

		return { entries, size: entries.length };
	}

	/**
	 * Ensure cache directory exists
	 */
	private ensureCacheDir(): void {
		if (!existsSync(this.cacheDir)) {
			mkdirSync(this.cacheDir, { recursive: true });
		}
	}

	/**
	 * Get file path for a cache entry
	 */
	private getCacheFilePath(cacheKey: string): string {
		return join(this.cacheDir, `${cacheKey}.json`);
	}

	/**
	 * Hash content for comparison
	 */
	private hashContent(content: string): string {
		return createHash('sha256').update(content).digest('hex').substring(0, 16);
	}

	/**
	 * Sort object keys for consistent hashing
	 */
	private sortObjectKeys(obj: Record<string, unknown>): Record<string, unknown> {
		const sorted: Record<string, unknown> = {};
		for (const key of Object.keys(obj).sort()) {
			const value = obj[key];
			if (value && typeof value === 'object' && !Array.isArray(value)) {
				sorted[key] = this.sortObjectKeys(value as Record<string, unknown>);
			} else {
				sorted[key] = value;
			}
		}
		return sorted;
	}

	/**
	 * Evict oldest entries if cache is too large
	 */
	private evictIfNeeded(): void {
		const logger = getLogger();

		try {
			const files = readdirSync(this.cacheDir).filter((f) => f.endsWith('.json'));

			if (files.length < MAX_CACHE_ENTRIES) {
				return;
			}

			// Sort by modification time (oldest first)
			const filesWithStats = files
				.map((file) => ({
					file,
					mtime: statSync(join(this.cacheDir, file)).mtime.getTime()
				}))
				.sort((a, b) => a.mtime - b.mtime);

			// Remove oldest 10%
			const toRemove = Math.max(1, Math.floor(filesWithStats.length * 0.1));
			for (let i = 0; i < toRemove; i++) {
				const { file } = filesWithStats[i]!;
				unlinkSync(join(this.cacheDir, file));
				logger.debug('Evicted stage cache entry', { file });
			}
		} catch {
			// Ignore errors
		}
	}

	/**
	 * Clean up expired cache entries
	 * @returns Number of entries cleaned
	 */
	cleanupExpired(): number {
		const logger = getLogger();
		let cleaned = 0;
		const now = Date.now();

		try {
			const files = readdirSync(this.cacheDir).filter((f) => f.endsWith('.json'));

			for (const file of files) {
				try {
					const filePath = join(this.cacheDir, file);
					const content = readFileSync(filePath, 'utf-8');
					const entry = JSON.parse(content) as StageCacheEntry;

					// Check if expired
					if (now - entry.createdAt > entry.ttl_ms) {
						unlinkSync(filePath);
						cleaned++;
					}
				} catch {
					// Ignore parse errors or file access issues
				}
			}

			if (cleaned > 0) {
				logger.debug('Stage cache cleanup completed', { cleaned });
			}
		} catch (error) {
			logger.debug('Stage cache cleanup failed', {
				error: (error as Error).message
			});
		}

		return cleaned;
	}

	/**
	 * Start periodic cleanup timer
	 */
	private startCleanupTimer(): void {
		// Run cleanup every 5 minutes
		this.cleanupTimer = setInterval(
			() => {
				this.cleanupExpired();
			},
			5 * 60 * 1000
		);

		// Don't keep process alive for cleanup
		this.cleanupTimer.unref();
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
}

/**
 * Get the singleton stage output cache instance
 */
export function getStageOutputCache(projectRoot?: string): StageOutputCache {
	return StageOutputCache.getInstance(projectRoot);
}
