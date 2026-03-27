/**
 * LSP Result Cache
 *
 * LRU cache for LSP responses to avoid redundant server calls.
 */

import type { CacheEntry, LSPCacheOptions } from './lsp.types';

/** Default cache settings */
const DEFAULT_OPTIONS: LSPCacheOptions = {
	maxEntries: 500,
	ttlMs: 30_000 // 30 seconds
};

/**
 * LRU cache for LSP results
 */
export class LSPResultCache {
	private readonly cache = new Map<string, CacheEntry<unknown>>();
	private readonly options: LSPCacheOptions;

	constructor(options?: Partial<LSPCacheOptions>) {
		this.options = { ...DEFAULT_OPTIONS, ...options };
	}

	/**
	 * Get a cached result
	 */
	get<T>(key: string): null | T {
		const entry = this.cache.get(key);
		if (!entry) return null;

		// Check TTL
		if (Date.now() - entry.timestamp > this.options.ttlMs) {
			this.cache.delete(key);
			return null;
		}

		// Move to end (most recently used)
		this.cache.delete(key);
		this.cache.set(key, entry);

		return entry.value as T;
	}

	/**
	 * Set a cached result
	 */
	set<T>(key: string, value: T): void {
		// Evict oldest if at capacity
		if (this.cache.size >= this.options.maxEntries) {
			const oldest = this.cache.keys().next().value;
			if (oldest !== undefined) {
				this.cache.delete(oldest);
			}
		}

		this.cache.set(key, {
			key,
			timestamp: Date.now(),
			value
		});
	}

	/**
	 * Invalidate entries for a file (e.g., when file is modified)
	 */
	invalidateFile(filePath: string): void {
		for (const [key] of this.cache) {
			if (key.startsWith(filePath)) {
				this.cache.delete(key);
			}
		}
	}

	/**
	 * Clear the entire cache
	 */
	clear(): void {
		this.cache.clear();
	}

	/**
	 * Get cache statistics
	 */
	getStats(): { maxEntries: number; size: number; ttlMs: number } {
		return {
			maxEntries: this.options.maxEntries,
			size: this.cache.size,
			ttlMs: this.options.ttlMs
		};
	}

	/**
	 * Generate a cache key for an LSP request
	 */
	static makeKey(method: string, filePath: string, ...extra: Array<number | string>): string {
		return [filePath, method, ...extra.map(String)].join(':');
	}
}
