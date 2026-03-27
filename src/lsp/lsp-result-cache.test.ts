/**
 * LSP Result Cache Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LSPResultCache } from './lsp-result-cache';

describe('LSPResultCache', () => {
	let cache: LSPResultCache;

	beforeEach(() => {
		cache = new LSPResultCache();
	});

	it('should store and retrieve values', () => {
		cache.set('key1', 'value1');
		expect(cache.get('key1')).toBe('value1');
	});

	it('should return null for missing keys', () => {
		expect(cache.get('nonexistent')).toBeNull();
	});

	it('should evict oldest entries when at capacity', () => {
		const smallCache = new LSPResultCache({ maxEntries: 3, ttlMs: 30000 });
		smallCache.set('a', 1);
		smallCache.set('b', 2);
		smallCache.set('c', 3);
		smallCache.set('d', 4); // Should evict 'a'

		expect(smallCache.get<number>('a')).toBeNull();
		expect(smallCache.get<number>('b')).toBe(2);
		expect(smallCache.get<number>('d')).toBe(4);
	});

	it('should expire entries after TTL', () => {
		const shortTtlCache = new LSPResultCache({ maxEntries: 100, ttlMs: 50 });
		shortTtlCache.set('key', 'value');

		expect(shortTtlCache.get('key')).toBe('value');

		// Advance time past TTL
		vi.useFakeTimers();
		vi.advanceTimersByTime(100);

		expect(shortTtlCache.get('key')).toBeNull();
		vi.useRealTimers();
	});

	it('should invalidate entries by file path', () => {
		cache.set('src/foo.ts:definition:10:5', 'def1');
		cache.set('src/foo.ts:hover:20:0', 'hover1');
		cache.set('src/bar.ts:definition:5:0', 'def2');

		cache.invalidateFile('src/foo.ts');

		expect(cache.get('src/foo.ts:definition:10:5')).toBeNull();
		expect(cache.get('src/foo.ts:hover:20:0')).toBeNull();
		expect(cache.get('src/bar.ts:definition:5:0')).toBe('def2');
	});

	it('should clear all entries', () => {
		cache.set('a', 1);
		cache.set('b', 2);
		cache.clear();

		expect(cache.get('a')).toBeNull();
		expect(cache.get('b')).toBeNull();
		expect(cache.getStats().size).toBe(0);
	});

	it('should report correct stats', () => {
		cache.set('x', 1);
		cache.set('y', 2);

		const stats = cache.getStats();
		expect(stats.size).toBe(2);
		expect(stats.maxEntries).toBe(500);
		expect(stats.ttlMs).toBe(30000);
	});

	it('should generate correct cache keys', () => {
		const key = LSPResultCache.makeKey('definition', 'src/foo.ts', 10, 5);
		expect(key).toBe('src/foo.ts:definition:10:5');
	});

	it('should move accessed entries to most recent position', () => {
		const smallCache = new LSPResultCache({ maxEntries: 3, ttlMs: 30000 });
		smallCache.set('a', 1);
		smallCache.set('b', 2);
		smallCache.set('c', 3);

		// Access 'a' to move it to most recent
		smallCache.get('a');

		// Add new entry — should evict 'b' (oldest not recently accessed)
		smallCache.set('d', 4);

		expect(smallCache.get<number>('a')).toBe(1); // Recently accessed, not evicted
		expect(smallCache.get<number>('b')).toBeNull(); // Evicted
		expect(smallCache.get<number>('c')).toBe(3);
		expect(smallCache.get<number>('d')).toBe(4);
	});
});
