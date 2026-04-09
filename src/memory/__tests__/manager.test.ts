/**
 * Unit tests for MemoryManager
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MemoryCategory, MemoryEntry, MemoryStoreFile } from 'types/memory.types';

import { MemoryManager } from '../manager';
import type { MemoryStore } from '../store';

function makeEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
	const now = new Date(Date.now() - 1000).toISOString(); // 1 second ago — has a small, non-zero age
	return {
		id: `mem-${Math.random().toString(36).slice(2, 14)}`,
		category: 'episodic',
		content: 'Test memory',
		tags: ['test'],
		source: { command: 'test' },
		confidence: 'observed',
		halfLifeDays: 7,
		createdAt: now,
		lastAccessedAt: now,
		updatedAt: now,
		accessCount: 0,
		agentRole: 'lead',
		sessionId: 'session-1',
		relatedPaths: [],
		isError: false,
		...overrides
	};
}

function makeMockStore(): MemoryStore {
	const storage = new Map<MemoryCategory, MemoryEntry[]>();

	const getOrInit = (category: MemoryCategory): MemoryEntry[] => {
		if (!storage.has(category)) {
			storage.set(category, []);
		}
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return storage.get(category)!;
	};

	return {
		getEntries: vi.fn(async (category: MemoryCategory) => [...getOrInit(category)]),
		appendEntry: vi.fn(async (category: MemoryCategory, entry: MemoryEntry) => {
			getOrInit(category).push(entry);
		}),
		updateEntry: vi.fn(async (category: MemoryCategory, id: string, patch: Partial<MemoryEntry>) => {
			const entries = getOrInit(category);
			const entry = entries.find((e) => e.id === id);
			if (entry === undefined) return false;
			Object.assign(entry, patch);
			return true;
		}),
		removeEntry: vi.fn(async (category: MemoryCategory, id: string) => {
			const entries = getOrInit(category);
			const idx = entries.findIndex((e) => e.id === id);
			if (idx === -1) return false;
			entries.splice(idx, 1);
			return true;
		}),
		removeEntries: vi.fn(async (category: MemoryCategory, ids: Set<string>) => {
			const entries = getOrInit(category);
			const before = entries.length;
			const filtered = entries.filter((e) => !ids.has(e.id));
			storage.set(category, filtered);
			return before - filtered.length;
		}),
		setEntries: vi.fn(async (category: MemoryCategory, entries: MemoryEntry[]) => {
			storage.set(category, entries);
		}),
		load: vi.fn(
			async (category: MemoryCategory): Promise<MemoryStoreFile> => ({
				version: 1,
				lastWrittenAt: new Date().toISOString(),
				entries: getOrInit(category)
			})
		),
		getMetadata: vi.fn(async (_category: MemoryCategory) => ({
			version: 1,
			lastWrittenAt: new Date().toISOString()
		})),
		setLastConsolidatedAt: vi.fn(async (_timestamp: string) => {
			// no-op
		}),
		save: vi.fn(),
		flush: vi.fn(async () => {
			// no-op
		})
	} as unknown as MemoryStore;
}

describe('MemoryManager', () => {
	let store: MemoryStore;
	let manager: MemoryManager;

	beforeEach(() => {
		store = makeMockStore();
		manager = new MemoryManager(store);
	});

	describe('create()', () => {
		it('generates an id, sets correct timestamps, defaults accessCount=0', async () => {
			const before = Date.now();
			const entry = await manager.create('episodic', {
				content: 'Hello memory',
				tags: ['hello'],
				source: { command: 'test' },
				confidence: 'observed',
				agentRole: 'lead',
				sessionId: 'sess-1'
			});
			const after = Date.now();

			expect(entry.id).toMatch(/^mem-/);
			expect(entry.accessCount).toBe(0);
			expect(new Date(entry.createdAt).getTime()).toBeGreaterThanOrEqual(before);
			expect(new Date(entry.createdAt).getTime()).toBeLessThanOrEqual(after);
			expect(entry.createdAt).toBe(entry.updatedAt);
			expect(entry.createdAt).toBe(entry.lastAccessedAt);
			expect(vi.mocked(store.appendEntry)).toHaveBeenCalledWith('episodic', entry);
		});

		it('gives 2× halfLife when isError=true', async () => {
			const normalEntry = await manager.create('episodic', {
				content: 'Normal',
				tags: [],
				source: { command: 'test' },
				confidence: 'observed',
				agentRole: 'lead',
				sessionId: 'sess-1',
				isError: false
			});

			const errorEntry = await manager.create('episodic', {
				content: 'Error',
				tags: [],
				source: { command: 'test' },
				confidence: 'observed',
				agentRole: 'lead',
				sessionId: 'sess-1',
				isError: true
			});

			expect(errorEntry.halfLifeDays).toBe(normalEntry.halfLifeDays * 2);
		});

		it('marks old entry as stale when supersedes is provided', async () => {
			const old = makeEntry({ id: 'mem-oldoldold1234' });
			await store.appendEntry('episodic', old);

			const newEntry = await manager.create('episodic', {
				content: 'New superseding content',
				tags: [],
				source: { command: 'test' },
				confidence: 'verified',
				agentRole: 'lead',
				sessionId: 'sess-1',
				supersedes: old.id
			});

			expect(vi.mocked(store.updateEntry)).toHaveBeenCalledWith(
				'episodic',
				old.id,
				expect.objectContaining({ supersededBy: newEntry.id, confidence: 'stale' })
			);

			const entries = await store.getEntries('episodic');
			const oldEntry = entries.find((e) => e.id === old.id);
			expect(oldEntry?.confidence).toBe('stale');
			expect(oldEntry?.supersededBy).toBe(newEntry.id);
		});
	});

	describe('query()', () => {
		it('returns entries matching tags (OR logic)', async () => {
			const e1 = makeEntry({ id: 'mem-e1e1e1e1e1e1', tags: ['alpha', 'beta'] });
			const e2 = makeEntry({ id: 'mem-e2e2e2e2e2e2', tags: ['gamma'] });
			const e3 = makeEntry({ id: 'mem-e3e3e3e3e3e3', tags: ['delta'] });
			await store.appendEntry('episodic', e1);
			await store.appendEntry('episodic', e2);
			await store.appendEntry('episodic', e3);

			const results = await manager.query({ tags: ['alpha', 'gamma'], strengthen: false });
			const ids = results.map((r) => r.entry.id);
			expect(ids).toContain(e1.id);
			expect(ids).toContain(e2.id);
			expect(ids).not.toContain(e3.id);
		});

		it('filters out entries below minStrength', async () => {
			// Entry with very old createdAt — near zero strength
			const old = makeEntry({
				id: 'mem-oldoldold1234',
				createdAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
				halfLifeDays: 1
			});
			const fresh = makeEntry({ id: 'mem-freshfreshfr' });
			await store.appendEntry('episodic', old);
			await store.appendEntry('episodic', fresh);

			const results = await manager.query({ minStrength: 0.5, strengthen: false });
			const ids = results.map((r) => r.entry.id);
			expect(ids).not.toContain(old.id);
			expect(ids).toContain(fresh.id);
		});

		it('calls strengthenEntry for returned entries (accessCount increments)', async () => {
			const entry = makeEntry({ id: 'mem-strengthtest' });
			await store.appendEntry('episodic', entry);

			await manager.query({ strengthen: true });

			expect(vi.mocked(store.updateEntry)).toHaveBeenCalledWith(
				'episodic',
				entry.id,
				expect.objectContaining({ accessCount: 1 })
			);
		});
	});

	describe('invalidateByPaths()', () => {
		it('halves halfLife for matching entries and returns count', async () => {
			const e1 = makeEntry({ id: 'mem-path1path1pa', relatedPaths: ['src/foo.ts'], halfLifeDays: 14 });
			const e2 = makeEntry({ id: 'mem-path2path2pa', relatedPaths: ['src/bar.ts'], halfLifeDays: 10 });
			await store.appendEntry('episodic', e1);
			await store.appendEntry('episodic', e2);

			const count = await manager.invalidateByPaths(['src/foo.ts']);
			expect(count).toBe(1);

			expect(vi.mocked(store.updateEntry)).toHaveBeenCalledWith(
				'episodic',
				e1.id,
				expect.objectContaining({ halfLifeDays: 7 })
			);
		});

		it('enforces minimum halfLife of 1 day', async () => {
			const e = makeEntry({ id: 'mem-minhalflife1', relatedPaths: ['src/x.ts'], halfLifeDays: 1 });
			await store.appendEntry('episodic', e);

			await manager.invalidateByPaths(['src/x.ts']);

			expect(vi.mocked(store.updateEntry)).toHaveBeenCalledWith(
				'episodic',
				e.id,
				expect.objectContaining({ halfLifeDays: 1 })
			);
		});
	});

	describe('markStaleByPaths()', () => {
		it('sets confidence to stale for matching entries and returns count', async () => {
			const e1 = makeEntry({ id: 'mem-stale1stale1', relatedPaths: ['src/a.ts'] });
			const e2 = makeEntry({ id: 'mem-stale2stale2', relatedPaths: ['src/b.ts'] });
			await store.appendEntry('episodic', e1);
			await store.appendEntry('episodic', e2);

			const count = await manager.markStaleByPaths(['src/a.ts']);
			expect(count).toBe(1);

			expect(vi.mocked(store.updateEntry)).toHaveBeenCalledWith(
				'episodic',
				e1.id,
				expect.objectContaining({ confidence: 'stale' })
			);
		});
	});

	describe('promote()', () => {
		it('creates a semantic entry and marks episodic as superseded', async () => {
			const episodic = makeEntry({ id: 'mem-epis01epis01', category: 'episodic', tags: ['ts', 'error'] });
			await store.appendEntry('episodic', episodic);

			const promoted = await manager.promote(episodic.id, 'Consolidated semantic knowledge', ['consolidated']);

			expect(promoted.category).toBe('semantic');
			expect(promoted.content).toBe('Consolidated semantic knowledge');
			expect(promoted.tags).toContain('ts');
			expect(promoted.tags).toContain('error');
			expect(promoted.tags).toContain('consolidated');

			expect(vi.mocked(store.updateEntry)).toHaveBeenCalledWith(
				'episodic',
				episodic.id,
				expect.objectContaining({ supersededBy: promoted.id, confidence: 'stale' })
			);
		});
	});

	describe('pruneCategory()', () => {
		it('removes entries below prune threshold and returns count', async () => {
			// Very old entry with tiny half-life → near-zero strength
			const weak = makeEntry({
				id: 'mem-weakweakweak',
				createdAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
				halfLifeDays: 0.01 // 0.01 days → strength essentially 0 after 1 year
			});
			// Very fresh entry → strength ~1
			const strong = makeEntry({ id: 'mem-strongstrong' });
			await store.appendEntry('episodic', weak);
			await store.appendEntry('episodic', strong);

			const count = await manager.pruneCategory('episodic');
			expect(count).toBe(1);

			expect(vi.mocked(store.removeEntries)).toHaveBeenCalledWith('episodic', expect.any(Set));
			const callArgs = vi.mocked(store.removeEntries).mock.calls[0];
			const removedIds = callArgs?.[1] as Set<string>;
			expect(removedIds.has(weak.id)).toBe(true);
			expect(removedIds.has(strong.id)).toBe(false);
		});
	});
});
