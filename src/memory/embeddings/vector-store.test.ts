import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openVectorStore } from './vector-store';

describe('VectorStore', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-vectors-'));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { force: true, recursive: true });
	});

	describe('append / read', () => {
		it('round-trips a vector', () => {
			const store = openVectorStore(tmpDir, 'nomic-embed-text', 3);
			store.append('mem-a', [0.1, 0.2, 0.3]);
			const result = store.read('mem-a');
			expect(result).not.toBeNull();
			expect(Array.from(result!)).toHaveLength(3);
			expect(result![0]).toBeCloseTo(0.1, 5);
		});

		it('returns null for an unknown id', () => {
			const store = openVectorStore(tmpDir, 'nomic-embed-text', 3);
			expect(store.read('mem-missing')).toBeNull();
		});

		it('stores vectors for multiple ids independently', () => {
			const store = openVectorStore(tmpDir, 'nomic-embed-text', 2);
			store.append('mem-a', [1.0, 0.0]);
			store.append('mem-b', [0.0, 1.0]);
			expect(store.read('mem-a')![0]).toBeCloseTo(1.0, 5);
			expect(store.read('mem-b')![1]).toBeCloseTo(1.0, 5);
		});
	});

	describe('has / count', () => {
		it('has() reflects whether an id was appended', () => {
			const store = openVectorStore(tmpDir, 'model', 4);
			expect(store.has('mem-x')).toBe(false);
			store.append('mem-x', [1, 2, 3, 4]);
			expect(store.has('mem-x')).toBe(true);
		});

		it('count() returns the number of stored vectors', () => {
			const store = openVectorStore(tmpDir, 'model', 2);
			expect(store.count()).toBe(0);
			store.append('mem-1', [1, 0]);
			store.append('mem-2', [0, 1]);
			expect(store.count()).toBe(2);
		});
	});

	describe('coverage', () => {
		it('returns 1.0 when all ids have embeddings', () => {
			const store = openVectorStore(tmpDir, 'model', 2);
			store.append('mem-a', [1, 0]);
			store.append('mem-b', [0, 1]);
			expect(store.coverage(new Set(['mem-a', 'mem-b']))).toBe(1);
		});

		it('returns 0 for an empty live set', () => {
			const store = openVectorStore(tmpDir, 'model', 2);
			expect(store.coverage(new Set())).toBe(0);
		});

		it('returns 0.5 when half the ids have embeddings', () => {
			const store = openVectorStore(tmpDir, 'model', 2);
			store.append('mem-a', [1, 0]);
			expect(store.coverage(new Set(['mem-a', 'mem-b']))).toBe(0.5);
		});
	});

	describe('flush / reload', () => {
		it('persists vectors and index to disk on flush', () => {
			const store = openVectorStore(tmpDir, 'nomic-embed-text', 2);
			store.append('mem-p', [3.0, 4.0]);
			store.flush();

			const binPath = path.join(tmpDir, 'embeddings.bin');
			const indexPath = path.join(tmpDir, 'embeddings.index.json');
			expect(fs.existsSync(binPath)).toBe(true);
			expect(fs.existsSync(indexPath)).toBe(true);
		});

		it('reloads vectors from disk correctly', () => {
			const store1 = openVectorStore(tmpDir, 'nomic-embed-text', 2);
			store1.append('mem-r', [7.0, 8.0]);
			store1.flush();

			const store2 = openVectorStore(tmpDir, 'nomic-embed-text', 2);
			const vec = store2.read('mem-r');
			expect(vec).not.toBeNull();
			expect(vec![0]).toBeCloseTo(7.0, 4);
		});
	});

	describe('compact', () => {
		it('removes vectors for ids not in the live set', () => {
			const store = openVectorStore(tmpDir, 'model', 2);
			store.append('mem-keep', [1, 0]);
			store.append('mem-drop', [0, 1]);
			store.flush();

			store.compact(new Set(['mem-keep']));

			expect(store.has('mem-drop')).toBe(false);
			expect(store.has('mem-keep')).toBe(true);
			expect(store.count()).toBe(1);
		});
	});
});
