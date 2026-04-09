/**
 * Unit tests for MemoryStore
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { MemoryEntry } from 'types/memory.types';

import { MemoryStore } from '../store';

function makeTempDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'valora-memory-test-'));
}

function makeEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
	const now = new Date().toISOString();
	return {
		id: `mem-${Math.random().toString(36).slice(2, 14)}`,
		category: 'episodic',
		content: 'Test memory content',
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

describe('MemoryStore', () => {
	let tempDir: string;
	let store: MemoryStore;

	beforeEach(() => {
		tempDir = makeTempDir();
		store = new MemoryStore(tempDir);
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	describe('load()', () => {
		it('returns empty store when file does not exist', async () => {
			const storeFile = await store.load('episodic');
			expect(storeFile.entries).toEqual([]);
			expect(storeFile.version).toBe(1);
			expect(typeof storeFile.lastWrittenAt).toBe('string');
		});

		it('returns cached result on second call', async () => {
			const first = await store.load('episodic');
			const second = await store.load('episodic');
			expect(first).toBe(second);
		});

		it('returns separate instances for different categories', async () => {
			const episodic = await store.load('episodic');
			const semantic = await store.load('semantic');
			expect(episodic).not.toBe(semantic);
		});
	});

	describe('appendEntry()', () => {
		it('persists entries and they can be retrieved', async () => {
			const entry = makeEntry();
			await store.appendEntry('episodic', entry);
			await store.flush();

			const store2 = new MemoryStore(tempDir);
			const entries = await store2.getEntries('episodic');
			expect(entries).toHaveLength(1);
			expect(entries[0]?.id).toBe(entry.id);
		});

		it('appends multiple entries', async () => {
			const e1 = makeEntry({ id: 'mem-aaa111bbb222' });
			const e2 = makeEntry({ id: 'mem-ccc333ddd444' });
			await store.appendEntry('episodic', e1);
			await store.appendEntry('episodic', e2);
			const entries = await store.getEntries('episodic');
			expect(entries).toHaveLength(2);
		});
	});

	describe('updateEntry()', () => {
		it('updates entry in place and returns true if found', async () => {
			const entry = makeEntry();
			await store.appendEntry('episodic', entry);

			const result = await store.updateEntry('episodic', entry.id, { content: 'Updated content' });
			expect(result).toBe(true);

			const entries = await store.getEntries('episodic');
			expect(entries[0]?.content).toBe('Updated content');
		});

		it('returns false if entry not found', async () => {
			const result = await store.updateEntry('episodic', 'mem-nonexistent1234', { content: 'X' });
			expect(result).toBe(false);
		});
	});

	describe('removeEntry()', () => {
		it('removes entry by id and returns true', async () => {
			const entry = makeEntry();
			await store.appendEntry('episodic', entry);

			const result = await store.removeEntry('episodic', entry.id);
			expect(result).toBe(true);

			const entries = await store.getEntries('episodic');
			expect(entries).toHaveLength(0);
		});

		it('returns false if entry not found', async () => {
			const result = await store.removeEntry('episodic', 'mem-nonexistent1234');
			expect(result).toBe(false);
		});
	});

	describe('flush()', () => {
		it('writes pending changes to disk', async () => {
			const entry = makeEntry();
			await store.appendEntry('episodic', entry);
			await store.flush();

			const filePath = path.join(tempDir, 'episodic.json');
			expect(fs.existsSync(filePath)).toBe(true);

			const raw = fs.readFileSync(filePath, 'utf-8');
			const parsed = JSON.parse(raw) as { entries: MemoryEntry[] };
			expect(parsed.entries).toHaveLength(1);
			expect(parsed.entries[0]?.id).toBe(entry.id);
		});

		it('does not throw if nothing is dirty', async () => {
			await expect(store.flush()).resolves.not.toThrow();
		});
	});

	describe('setLastConsolidatedAt()', () => {
		it('updates all three category files', async () => {
			const timestamp = new Date().toISOString();
			await store.setLastConsolidatedAt(timestamp);
			await store.flush();

			for (const category of ['episodic', 'semantic', 'decisions'] as const) {
				const meta = await store.getMetadata(category);
				expect(meta.lastConsolidatedAt).toBe(timestamp);
			}
		});
	});

	describe('removeEntries()', () => {
		it('removes multiple entries by ids and returns count', async () => {
			const e1 = makeEntry({ id: 'mem-aaa111bbb222' });
			const e2 = makeEntry({ id: 'mem-ccc333ddd444' });
			const e3 = makeEntry({ id: 'mem-eee555fff666' });
			await store.appendEntry('episodic', e1);
			await store.appendEntry('episodic', e2);
			await store.appendEntry('episodic', e3);

			const removed = await store.removeEntries('episodic', new Set([e1.id, e3.id]));
			expect(removed).toBe(2);

			const entries = await store.getEntries('episodic');
			expect(entries).toHaveLength(1);
			expect(entries[0]?.id).toBe(e2.id);
		});
	});

	describe('getMetadata()', () => {
		it('returns version, lastWrittenAt, and optional lastConsolidatedAt', async () => {
			const meta = await store.getMetadata('decisions');
			expect(meta.version).toBe(1);
			expect(typeof meta.lastWrittenAt).toBe('string');
			expect(meta.lastConsolidatedAt).toBeUndefined();
		});
	});
});
