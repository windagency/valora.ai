/**
 * Unit tests for MemoryManager
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { MemoryCategory, MemoryEntry, MemoryStoreFile } from '@windagency/valora-plugin-api';

import { MemoryManager } from './manager';
import type { MemoryStore } from './store';
import { resetSigningKeyPathForTests, setSigningKeyPathForTests, verifyProvenance } from './vault/provenance';

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

function makeInMemoryStore(): MemoryStore {
	const storage = new Map<MemoryCategory, MemoryEntry[]>();

	const getOrInit = (category: MemoryCategory): MemoryEntry[] => {
		if (!storage.has(category)) {
			storage.set(category, []);
		}
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return storage.get(category)!;
	};

	return {
		getEntries: async (category: MemoryCategory) => [...getOrInit(category)],
		appendEntry: async (category: MemoryCategory, entry: MemoryEntry) => {
			getOrInit(category).push(entry);
		},
		updateEntry: async (category: MemoryCategory, id: string, patch: Partial<MemoryEntry>) => {
			const entries = getOrInit(category);
			const entry = entries.find((e) => e.id === id);
			if (entry === undefined) return false;
			Object.assign(entry, patch);
			return true;
		},
		removeEntry: async (category: MemoryCategory, id: string) => {
			const entries = getOrInit(category);
			const idx = entries.findIndex((e) => e.id === id);
			if (idx === -1) return false;
			entries.splice(idx, 1);
			return true;
		},
		removeEntries: async (category: MemoryCategory, ids: Set<string>) => {
			const entries = getOrInit(category);
			const before = entries.length;
			const filtered = entries.filter((e) => !ids.has(e.id));
			storage.set(category, filtered);
			return before - filtered.length;
		},
		setEntries: async (category: MemoryCategory, entries: MemoryEntry[]) => {
			storage.set(category, entries);
		},
		load: async (category: MemoryCategory): Promise<MemoryStoreFile> => ({
			version: 1,
			lastWrittenAt: new Date().toISOString(),
			entries: getOrInit(category)
		}),
		getMetadata: async (_category: MemoryCategory) => ({
			version: 1,
			lastWrittenAt: new Date().toISOString()
		}),
		setLastConsolidatedAt: async (_timestamp: string) => {
			// no-op
		},
		save: async () => {
			// no-op
		},
		flush: async () => {
			// no-op
		}
	} as unknown as MemoryStore;
}

describe('MemoryManager', () => {
	let store: MemoryStore;
	let manager: MemoryManager;
	let signingKeyDir: string;

	beforeEach(() => {
		store = makeInMemoryStore();
		manager = new MemoryManager(store);
		signingKeyDir = mkdtempSync(join(tmpdir(), 'valora-vault-signing-'));
		setSigningKeyPathForTests(join(signingKeyDir, 'vault-signing.key'));
	});

	afterEach(() => {
		resetSigningKeyPathForTests();
		rmSync(signingKeyDir, { recursive: true, force: true });
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

			// Entry is persisted in the store
			const stored = await store.getEntries('episodic');
			expect(stored.some((e) => e.id === entry.id)).toBe(true);
		});

		it('stamps a provenance signature that verifies against the created entry', async () => {
			const entry = await manager.create('episodic', {
				content: 'Hello memory',
				tags: ['hello'],
				source: { command: 'test' },
				confidence: 'observed',
				agentRole: 'lead',
				sessionId: 'sess-1'
			});

			expect(entry.provenanceSignature).toBeDefined();
			expect(verifyProvenance(entry.content, entry.agentRole, entry.createdAt, entry.provenanceSignature)).toBe(true);
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

			// Observable outcome: the old entry is stale and references the new entry
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

		it('strengthens returned entries — accessCount increments in the store', async () => {
			const entry = makeEntry({ id: 'mem-strengthtest' });
			await store.appendEntry('episodic', entry);

			await manager.query({ strengthen: true });

			// Observable outcome: the store now holds the entry with incremented accessCount
			const stored = await store.getEntries('episodic');
			const updated = stored.find((e) => e.id === entry.id);
			expect(updated?.accessCount).toBe(1);
		});

		it('excludes entries whose provenance signature failed verification', async () => {
			const untrusted = makeEntry({ id: 'mem-untrustedtest', trusted: false });
			const trusted = makeEntry({ id: 'mem-trustedtest01', trusted: true });
			await store.appendEntry('episodic', untrusted);
			await store.appendEntry('episodic', trusted);

			const results = await manager.query({ strengthen: false });
			const ids = results.map((r) => r.entry.id);
			expect(ids).not.toContain(untrusted.id);
			expect(ids).toContain(trusted.id);
		});

		it('does not exclude entries with trusted === undefined (legacy/unsigned entries)', async () => {
			const legacy = makeEntry({ id: 'mem-legacytest01' });
			await store.appendEntry('episodic', legacy);

			const results = await manager.query({ strengthen: false });
			expect(results.map((r) => r.entry.id)).toContain(legacy.id);
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

			// Observable outcome: the matching entry's halfLife was halved in the store
			const stored = await store.getEntries('episodic');
			const updated = stored.find((e) => e.id === e1.id);
			expect(updated?.halfLifeDays).toBe(7);

			// Non-matching entry is unchanged
			const unchanged = stored.find((e) => e.id === e2.id);
			expect(unchanged?.halfLifeDays).toBe(10);
		});

		it('enforces minimum halfLife of 1 day', async () => {
			const e = makeEntry({ id: 'mem-minhalflife1', relatedPaths: ['src/x.ts'], halfLifeDays: 1 });
			await store.appendEntry('episodic', e);

			await manager.invalidateByPaths(['src/x.ts']);

			// Observable outcome: halfLife does not drop below 1
			const stored = await store.getEntries('episodic');
			const updated = stored.find((entry) => entry.id === e.id);
			expect(updated?.halfLifeDays).toBe(1);
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

			// Observable outcome: the matching entry is stale; the other is not
			const stored = await store.getEntries('episodic');
			expect(stored.find((e) => e.id === e1.id)?.confidence).toBe('stale');
			expect(stored.find((e) => e.id === e2.id)?.confidence).not.toBe('stale');
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

			// Observable outcome: the episodic source entry is marked stale in the store
			const episodics = await store.getEntries('episodic');
			const source = episodics.find((e) => e.id === episodic.id);
			expect(source?.confidence).toBe('stale');
			expect(source?.supersededBy).toBe(promoted.id);
		});

		it('refuses to promote an episodic entry whose provenance signature failed verification', async () => {
			const untrusted = makeEntry({
				id: 'mem-untrustedpromote',
				category: 'episodic',
				tags: ['ts'],
				trusted: false
			});
			await store.appendEntry('episodic', untrusted);

			await expect(manager.promote(untrusted.id, 'Laundered content', ['consolidated'])).rejects.toThrow(
				/untrusted|provenance/i
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

			// Observable outcome: only the strong entry remains in the store
			const remaining = await store.getEntries('episodic');
			expect(remaining.some((e) => e.id === weak.id)).toBe(false);
			expect(remaining.some((e) => e.id === strong.id)).toBe(true);
		});
	});
});
