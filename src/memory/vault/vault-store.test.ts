import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { MemoryEntry } from 'types/memory.types';

import { VaultStore } from './vault-store';

function makeEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
	const now = new Date().toISOString();
	return {
		accessCount: 0,
		agentRole: 'implementer',
		category: 'episodic',
		confidence: 'observed',
		content: 'test memory content',
		createdAt: now,
		halfLifeDays: 7,
		id: 'mem-test01',
		isError: false,
		lastAccessedAt: now,
		relatedPaths: [],
		sessionId: 'ses-001',
		source: { command: 'test' },
		tags: ['test'],
		updatedAt: now,
		...overrides
	};
}

describe('VaultStore', () => {
	let tmpDir: string;
	let store: VaultStore;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-vault-store-'));
		store = new VaultStore(tmpDir);
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { force: true, recursive: true });
	});

	describe('appendEntry / getEntries', () => {
		it('makes an appended entry retrievable', async () => {
			const entry = makeEntry();
			await store.appendEntry('episodic', entry);
			const entries = await store.getEntries('episodic');
			expect(entries).toHaveLength(1);
			expect(entries[0]!.id).toBe(entry.id);
		});

		it('writes a .md file for the entry', async () => {
			const entry = makeEntry({ id: 'mem-test01' });
			await store.appendEntry('episodic', entry);
			const mdPath = path.join(tmpDir, 'episodic', 'mem-test01.md');
			expect(fs.existsSync(mdPath)).toBe(true);
		});

		it('preserves all entry fields after a write-read cycle', async () => {
			const entry = makeEntry({ tags: ['alpha', 'beta'], relatedPaths: ['src/foo.ts'] });
			await store.appendEntry('episodic', entry);

			const freshStore = new VaultStore(tmpDir);
			const entries = await freshStore.getEntries('episodic');
			expect(entries[0]!.tags).toEqual(['alpha', 'beta']);
			expect(entries[0]!.relatedPaths).toEqual(['src/foo.ts']);
			expect(entries[0]!.content).toBe(entry.content);
		});

		it('returns an empty array for a category with no entries', async () => {
			const entries = await store.getEntries('semantic');
			expect(entries).toHaveLength(0);
		});
	});

	describe('updateEntry', () => {
		it('returns true and patches the entry when found', async () => {
			const entry = makeEntry();
			await store.appendEntry('episodic', entry);

			const updated = await store.updateEntry('episodic', entry.id, { confidence: 'verified' });
			expect(updated).toBe(true);

			const [retrieved] = await store.getEntries('episodic');
			expect(retrieved!.confidence).toBe('verified');
		});

		it('returns false when the id does not exist', async () => {
			const updated = await store.updateEntry('episodic', 'mem-missing', { confidence: 'stale' });
			expect(updated).toBe(false);
		});

		it('persists the patch to disk', async () => {
			const entry = makeEntry();
			await store.appendEntry('episodic', entry);
			await store.updateEntry('episodic', entry.id, { accessCount: 5 });

			const freshStore = new VaultStore(tmpDir);
			const [retrieved] = await freshStore.getEntries('episodic');
			expect(retrieved!.accessCount).toBe(5);
		});
	});

	describe('removeEntry', () => {
		it('returns true and removes the entry when found', async () => {
			const entry = makeEntry();
			await store.appendEntry('episodic', entry);

			const removed = await store.removeEntry('episodic', entry.id);
			expect(removed).toBe(true);

			const entries = await store.getEntries('episodic');
			expect(entries).toHaveLength(0);
		});

		it('returns false when the entry does not exist', async () => {
			const removed = await store.removeEntry('episodic', 'mem-missing');
			expect(removed).toBe(false);
		});

		it('deletes the .md file from disk', async () => {
			const entry = makeEntry({ id: 'mem-del' });
			await store.appendEntry('episodic', entry);
			await store.removeEntry('episodic', 'mem-del');
			const mdPath = path.join(tmpDir, 'episodic', 'mem-del.md');
			expect(fs.existsSync(mdPath)).toBe(false);
		});
	});

	describe('removeEntries', () => {
		it('removes all entries in the provided id set', async () => {
			await store.appendEntry('episodic', makeEntry({ id: 'mem-a' }));
			await store.appendEntry('episodic', makeEntry({ id: 'mem-b' }));
			await store.appendEntry('episodic', makeEntry({ id: 'mem-c' }));

			const count = await store.removeEntries('episodic', new Set(['mem-a', 'mem-c']));
			expect(count).toBe(2);

			const entries = await store.getEntries('episodic');
			expect(entries.map((e) => e.id)).toEqual(['mem-b']);
		});
	});

	describe('setLastConsolidatedAt', () => {
		it('records the timestamp and exposes it via getMetadata', async () => {
			const ts = '2026-04-27T10:00:00.000Z';
			await store.setLastConsolidatedAt(ts);
			const meta = await store.getMetadata('episodic');
			expect(meta.lastConsolidatedAt).toBe(ts);
		});

		it('preserves lastConsolidatedAt across a process restart (loaded from meta.json)', async () => {
			const ts = '2026-05-01T12:00:00.000Z';
			await store.setLastConsolidatedAt(ts);

			const fresh = new VaultStore(tmpDir);
			const meta = await fresh.getMetadata('episodic');
			expect(meta.lastConsolidatedAt).toBe(ts);
		});

		it('writes meta.json atomically — no .tmp file remains afterwards', async () => {
			await store.setLastConsolidatedAt('2026-05-01T12:00:00.000Z');
			const stragglers = fs.readdirSync(tmpDir).filter((f) => f.endsWith('.tmp'));
			expect(stragglers).toEqual([]);
		});
	});

	describe('updateEntry — link maintenance', () => {
		it('extracts wikilinks from a patched content body and writes them to the file', async () => {
			const entry = makeEntry({ content: 'original body', id: 'mem-link-1' });
			await store.appendEntry('episodic', entry);

			await store.updateEntry('episodic', entry.id, {
				content: 'new body\n\n[[mem-other|related]]'
			});

			const md = fs.readFileSync(path.join(tmpDir, 'episodic', 'mem-link-1.md'), 'utf-8');
			expect(md).toContain('[[mem-other|related]]');

			const fresh = new VaultStore(tmpDir);
			const index = await fresh.getVaultIndex();
			const outEdges = index.outEdges.get('mem-link-1') ?? [];
			expect(outEdges.some((e) => e.toId === 'mem-other' && e.kind === 'related')).toBe(true);
		});

		it('refreshes the in-memory outEdges index after a content patch so spreading activation uses current links', async () => {
			const entry = makeEntry({ content: 'original body', id: 'mem-edge-live' });
			await store.appendEntry('episodic', entry);

			await store.updateEntry('episodic', entry.id, {
				content: 'updated body\n\n[[mem-edge-target|related]]'
			});

			// Check the in-memory index on the SAME store instance (not a fresh one).
			const index = await store.getVaultIndex();
			const outEdges = index.outEdges.get('mem-edge-live') ?? [];
			expect(outEdges.some((e) => e.toId === 'mem-edge-target' && e.kind === 'related')).toBe(true);
		});

		it('removes stale in-memory edges when content patch drops a wikilink', async () => {
			const entry = makeEntry({
				content: 'body\n\n[[mem-old-target|related]]',
				id: 'mem-edge-drop'
			});
			await store.appendEntryWithLinks('episodic', entry, [
				{ fromId: 'mem-edge-drop', kind: 'related', toId: 'mem-old-target' }
			]);

			await store.updateEntry('episodic', entry.id, { content: 'body without link' });

			const index = await store.getVaultIndex();
			const outEdges = index.outEdges.get('mem-edge-drop') ?? [];
			expect(outEdges).toHaveLength(0);
		});
	});

	describe('setEntries — rollback', () => {
		it('restores entries that were removed before the failure', async () => {
			// Bug: when setEntries removes some entries and then errors mid-loop,
			// the rollback must reinstate every pre-existing entry — not only the
			// ones still present in the partly-mutated index.
			const survives = makeEntry({ content: 'survives', id: 'mem-rb-survives' });
			const dropped = makeEntry({ content: 'dropped first', id: 'mem-rb-dropped' });
			await store.appendEntry('episodic', survives);
			await store.appendEntry('episodic', dropped);

			// Wedge a directory at the new entry's path so atomicWriteFile throws
			// AFTER `dropped` has already been removed in the loop.
			const episodicDir = path.join(tmpDir, 'episodic');
			fs.mkdirSync(path.join(episodicDir, 'mem-rb-fail.md'), { recursive: true });

			let threw = false;
			try {
				await store.setEntries('episodic', [makeEntry({ id: 'mem-rb-fail' }), survives]);
			} catch {
				threw = true;
			}
			expect(threw).toBe(true);

			// Both pre-existing entries must be back on disk.
			const fresh = new VaultStore(tmpDir);
			const entries = await fresh.getEntries('episodic');
			const ids = entries.map((e) => e.id).sort();
			expect(ids).toContain('mem-rb-survives');
			expect(ids).toContain('mem-rb-dropped');
		});

		it('preserves programmatic wikilinks in an entry re-added during rollback', async () => {
			// Entry with a programmatic edge (NOT embedded in content) that must survive rollback.
			// promote() and appendEntryWithLinks() write edges this way — they must not be lost.
			const linked = makeEntry({ content: 'plain prose content', id: 'mem-rb-linked' });
			await store.appendEntryWithLinks('episodic', linked, [
				{ fromId: 'mem-rb-linked', kind: 'related', toId: 'mem-rb-tgt' }
			]);

			// Place a dir at the new entry's file path so atomicWriteFile throws EISDIR,
			// triggering rollback. linked is NOT in the new list so it is removed first,
			// then rollback must re-add it with its programmatic edge intact.
			const episodicDir = path.join(tmpDir, 'episodic');
			fs.mkdirSync(path.join(episodicDir, 'mem-rb-new.md'), { recursive: true });

			let threw = false;
			try {
				await store.setEntries('episodic', [makeEntry({ id: 'mem-rb-new' })]);
			} catch {
				threw = true;
			}
			expect(threw).toBe(true);

			// After rollback, linked must be back on disk with its programmatic wikilink.
			const fresh = new VaultStore(tmpDir);
			const freshIndex = await fresh.getVaultIndex();
			const outEdges = freshIndex.outEdges.get('mem-rb-linked') ?? [];
			expect(outEdges.some((e) => e.toId === 'mem-rb-tgt' && e.kind === 'related')).toBe(true);
		});
	});

	describe('first-use schema version', () => {
		it('writes the vault version file on the first appendEntry call', async () => {
			const { readVaultVersion, VAULT_SCHEMA_VERSION } = await import('../migration/vault-version');
			expect(readVaultVersion(tmpDir)).toBeNull();

			await store.appendEntry('episodic', makeEntry({ id: 'mem-first' }));

			expect(readVaultVersion(tmpDir)).toBe(VAULT_SCHEMA_VERSION);
		});
	});

	describe('getVaultStats', () => {
		it('reports total entry count and zero edge count when no links exist', async () => {
			await store.appendEntry('episodic', makeEntry({ id: 'mem-s1' }));
			await store.appendEntry('semantic', makeEntry({ id: 'mem-s2', category: 'semantic' }));
			const stats = store.getVaultStats();
			expect(stats.entryCount).toBe(2);
			expect(stats.edgeCount).toBe(0);
		});
	});

	describe('updateEntry — secondary index maintenance', () => {
		it('moves the entry to the new tag bucket and drops it from the old one', async () => {
			const entry = makeEntry({ id: 'mem-tagshift', tags: ['old-tag'] });
			await store.appendEntry('episodic', entry);

			await store.updateEntry('episodic', entry.id, { tags: ['new-tag'] });

			const index = await store.getVaultIndex();
			expect(index.byTag.get('old-tag')?.has(entry.id) ?? false).toBe(false);
			expect(index.byTag.get('new-tag')?.has(entry.id)).toBe(true);
		});

		it('moves the entry to the new path and agent buckets after a patch', async () => {
			const entry = makeEntry({
				agentRole: 'lead',
				id: 'mem-pathshift',
				relatedPaths: ['src/old.ts']
			});
			await store.appendEntry('episodic', entry);

			await store.updateEntry('episodic', entry.id, {
				agentRole: 'qa',
				relatedPaths: ['src/new.ts']
			});

			const index = await store.getVaultIndex();
			expect(index.byPath.get('src/old.ts')?.has(entry.id) ?? false).toBe(false);
			expect(index.byPath.get('src/new.ts')?.has(entry.id)).toBe(true);
			expect(index.byAgent.get('lead')?.has(entry.id) ?? false).toBe(false);
			expect(index.byAgent.get('qa')?.has(entry.id)).toBe(true);
		});
	});

	describe('co_accessed edge synthesis', () => {
		it('materialises co_accessed out-edges from persisted coAccess maps after reload', async () => {
			// ADR-013 §5: spreading activation traverses Hebbian co_accessed edges.
			// Counts are persisted in frontmatter; the index must convert them into edges.
			const a = makeEntry({ coAccess: { 'mem-coB': 4 }, id: 'mem-coA', tags: ['alpha'] });
			const b = makeEntry({ coAccess: { 'mem-coA': 4 }, id: 'mem-coB', tags: ['beta'] });
			await store.appendEntry('episodic', a);
			await store.appendEntry('episodic', b);

			const fresh = new VaultStore(tmpDir);
			const index = await fresh.getVaultIndex();

			const outA = index.outEdges.get('mem-coA') ?? [];
			expect(outA.some((e) => e.kind === 'co_accessed' && e.toId === 'mem-coB')).toBe(true);
		});

		it('records co_accessed in-edges so spreading activation can reverse-traverse', async () => {
			const a = makeEntry({ coAccess: { 'mem-cobB': 2 }, id: 'mem-cobA' });
			const b = makeEntry({ coAccess: { 'mem-cobA': 2 }, id: 'mem-cobB' });
			await store.appendEntry('episodic', a);
			await store.appendEntry('episodic', b);

			const fresh = new VaultStore(tmpDir);
			const index = await fresh.getVaultIndex();

			expect(index.inEdges.get('mem-cobB')?.has('mem-cobA')).toBe(true);
			expect(index.inEdges.get('mem-cobA')?.has('mem-cobB')).toBe(true);
		});

		it('refreshes co_accessed edges live when updateEntry patches the coAccess map', async () => {
			// Bug: the in-process path (incrementCoAccess → updateEntry) must update
			// outEdges/inEdges so spreading activation in the same process sees the
			// freshly recorded Hebbian neighbours without requiring a vault reload.
			const a = makeEntry({ id: 'mem-coLiveA' });
			const b = makeEntry({ id: 'mem-coLiveB' });
			await store.appendEntry('episodic', a);
			await store.appendEntry('episodic', b);

			await store.updateEntry('episodic', 'mem-coLiveA', { coAccess: { 'mem-coLiveB': 1 } });

			const index = await store.getVaultIndex();
			const outA = index.outEdges.get('mem-coLiveA') ?? [];
			expect(outA.some((e) => e.kind === 'co_accessed' && e.toId === 'mem-coLiveB')).toBe(true);
			expect(index.inEdges.get('mem-coLiveB')?.has('mem-coLiveA')).toBe(true);
		});
	});
});
