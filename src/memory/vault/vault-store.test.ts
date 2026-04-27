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
});
