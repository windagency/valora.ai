import { beforeEach, describe, expect, it } from 'vitest';

import { EphemeralMemoryProvider } from './ephemeral';

function makeCreateOptions(overrides: Partial<Parameters<EphemeralMemoryProvider['create']>[1]> = {}) {
	return {
		agentRole: 'coder',
		confidence: 'observed' as const,
		content: 'test entry content',
		sessionId: 'sess-1',
		source: { command: 'test', label: 'Test' },
		tags: ['tag-a'],
		...overrides
	};
}

describe('EphemeralMemoryProvider', () => {
	let provider: EphemeralMemoryProvider;

	beforeEach(() => {
		provider = new EphemeralMemoryProvider();
	});

	describe('create', () => {
		it('returns an entry with the supplied content and category', async () => {
			const entry = await provider.create('episodic', makeCreateOptions({ content: 'hello' }));
			expect(entry.content).toBe('hello');
			expect(entry.category).toBe('episodic');
		});

		it('assigns a unique id to each entry', async () => {
			const a = await provider.create('episodic', makeCreateOptions());
			const b = await provider.create('episodic', makeCreateOptions());
			expect(a.id).not.toBe(b.id);
		});

		it('sets timestamps to ISO strings', async () => {
			const entry = await provider.create('semantic', makeCreateOptions());
			expect(() => new Date(entry.createdAt)).not.toThrow();
			expect(entry.createdAt).toBe(entry.updatedAt);
			expect(entry.createdAt).toBe(entry.lastAccessedAt);
		});
	});

	describe('get', () => {
		it('returns null for an unknown id', async () => {
			const result = await provider.get('episodic', 'no-such-id');
			expect(result).toBeNull();
		});

		it('returns the entry with strength 1.0 after creation', async () => {
			const entry = await provider.create('episodic', makeCreateOptions());
			const result = await provider.get('episodic', entry.id);
			expect(result).not.toBeNull();
			expect(result!.entry.id).toBe(entry.id);
			expect(result!.strength).toBe(1.0);
		});

		it('returns null when looking up an id in the wrong category', async () => {
			const entry = await provider.create('episodic', makeCreateOptions());
			const result = await provider.get('semantic', entry.id);
			expect(result).toBeNull();
		});
	});

	describe('update', () => {
		it('returns false for an unknown id', async () => {
			const updated = await provider.update('episodic', 'no-such-id', { content: 'new' });
			expect(updated).toBe(false);
		});

		it('merges the patch and returns true', async () => {
			const entry = await provider.create('episodic', makeCreateOptions({ content: 'old' }));
			const updated = await provider.update('episodic', entry.id, { content: 'new' });
			expect(updated).toBe(true);
			const result = await provider.get('episodic', entry.id);
			expect(result!.entry.content).toBe('new');
		});
	});

	describe('delete', () => {
		it('returns false for an unknown id', async () => {
			const deleted = await provider.delete('episodic', 'no-such-id');
			expect(deleted).toBe(false);
		});

		it('removes the entry and returns true', async () => {
			const entry = await provider.create('episodic', makeCreateOptions());
			const deleted = await provider.delete('episodic', entry.id);
			expect(deleted).toBe(true);
			expect(await provider.get('episodic', entry.id)).toBeNull();
		});
	});

	describe('query', () => {
		beforeEach(async () => {
			await provider.create('episodic', makeCreateOptions({ content: 'ep-1', tags: ['a'] }));
			await provider.create('episodic', makeCreateOptions({ content: 'ep-2', tags: ['b'] }));
			await provider.create('semantic', makeCreateOptions({ content: 'sem-1', tags: ['a'] }));
		});

		it('returns all entries when no filters are specified', async () => {
			const results = await provider.query({});
			expect(results).toHaveLength(3);
		});

		it('filters by category', async () => {
			const results = await provider.query({ category: 'episodic' });
			expect(results).toHaveLength(2);
			expect(results.every((r) => r.entry.category === 'episodic')).toBe(true);
		});

		it('filters by tag intersection', async () => {
			const results = await provider.query({ tags: ['a'] });
			expect(results).toHaveLength(2);
		});

		it('respects limit', async () => {
			const results = await provider.query({ limit: 1 });
			expect(results).toHaveLength(1);
		});

		it('returns strength 1.0 for all results', async () => {
			const results = await provider.query({});
			expect(results.every((r) => r.strength === 1.0)).toBe(true);
		});
	});

	describe('findByPaths', () => {
		it('returns entries whose relatedPaths overlap with the query paths', async () => {
			await provider.create('episodic', makeCreateOptions({ relatedPaths: ['src/foo.ts'] }));
			await provider.create('episodic', makeCreateOptions({ relatedPaths: ['src/bar.ts'] }));
			const results = await provider.findByPaths(['src/foo.ts']);
			expect(results).toHaveLength(1);
			expect(results[0]!.entry.relatedPaths).toContain('src/foo.ts');
		});

		it('returns empty array when no paths match', async () => {
			const results = await provider.findByPaths(['no/match.ts']);
			expect(results).toHaveLength(0);
		});
	});

	describe('info', () => {
		it('returns zero counts for an empty provider', async () => {
			const info = await provider.info();
			expect(info.counts).toEqual({ decisions: 0, episodic: 0, semantic: 0 });
			expect(info.name).toBe('ephemeral');
			expect(info.capabilities).toEqual([]);
		});

		it('reflects created entries in counts', async () => {
			await provider.create('episodic', makeCreateOptions());
			await provider.create('episodic', makeCreateOptions());
			await provider.create('semantic', makeCreateOptions());
			const info = await provider.info();
			expect(info.counts).toEqual({ decisions: 0, episodic: 2, semantic: 1 });
		});
	});

	describe('purge', () => {
		it('returns zero deleted when store is empty', async () => {
			const result = await provider.purge({ all: true });
			expect(result.totalDeleted).toBe(0);
		});

		it('clears all entries when all: true', async () => {
			await provider.create('episodic', makeCreateOptions());
			await provider.create('semantic', makeCreateOptions());
			const result = await provider.purge({ all: true });
			expect(result.totalDeleted).toBe(2);
			const info = await provider.info();
			expect(info.counts).toEqual({ decisions: 0, episodic: 0, semantic: 0 });
		});

		it('respects dryRun: reports count without deleting', async () => {
			await provider.create('episodic', makeCreateOptions());
			const result = await provider.purge({ all: true, dryRun: true });
			expect(result.totalWouldDelete).toBe(1);
			expect(result.totalDeleted).toBe(0);
			const info = await provider.info();
			expect(info.counts.episodic).toBe(1);
		});

		it('purges only the requested category', async () => {
			await provider.create('episodic', makeCreateOptions());
			await provider.create('semantic', makeCreateOptions());
			await provider.purge({ categories: ['episodic'] });
			const info = await provider.info();
			expect(info.counts).toEqual({ decisions: 0, episodic: 0, semantic: 1 });
		});
	});

	describe('verify', () => {
		it('always returns ok: true with correct counts', async () => {
			await provider.create('episodic', makeCreateOptions());
			const report = await provider.verify();
			expect(report.ok).toBe(true);
			expect(report.issues).toHaveLength(0);
			expect(report.counts.episodic).toBe(1);
		});
	});

	describe('flush', () => {
		it('resolves without error (no-op)', async () => {
			await expect(provider.flush()).resolves.toBeUndefined();
		});
	});

	describe('invalidateByPaths / markStaleByPaths / prune', () => {
		it('invalidateByPaths returns 0', async () => {
			expect(await provider.invalidateByPaths(['any/path.ts'])).toBe(0);
		});

		it('markStaleByPaths returns 0', async () => {
			expect(await provider.markStaleByPaths(['any/path.ts'])).toBe(0);
		});

		it('prune returns 0', async () => {
			expect(await provider.prune(0.5)).toBe(0);
		});
	});
});
