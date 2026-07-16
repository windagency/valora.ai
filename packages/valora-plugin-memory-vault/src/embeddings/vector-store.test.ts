import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openVectorStore, readVectorStoreMeta } from './vector-store';

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

	describe('malformed index tolerance', () => {
		it('drops an out-of-range offset instead of throwing when reading it, and still serves other valid entries', () => {
			// A hand-crafted or corrupted embeddings.index.json with an offset
			// that doesn't fit inside embeddings.bin previously reached
			// Buffer.subarray unchecked, producing a zero-length slice that then
			// crashed `new Float32Array(copy.buffer, ..., dim)` with an uncaught
			// RangeError — propagating through semanticRecall with no try/catch
			// anywhere in the call chain.
			fs.writeFileSync(path.join(tmpDir, 'embeddings.bin'), Buffer.alloc(2 * Float32Array.BYTES_PER_ELEMENT));
			fs.writeFileSync(
				path.join(tmpDir, 'embeddings.index.json'),
				JSON.stringify({ dim: 2, entries: { valid: 0, victim: 999999999 }, model: 'model' })
			);

			const store = openVectorStore(tmpDir, 'model', 2);

			expect(() => store.read('victim')).not.toThrow();
			expect(store.read('victim')).toBeNull();
			expect(store.has('victim')).toBe(false);
		});

		it('drops a negative offset', () => {
			fs.writeFileSync(path.join(tmpDir, 'embeddings.bin'), Buffer.alloc(2 * Float32Array.BYTES_PER_ELEMENT));
			fs.writeFileSync(
				path.join(tmpDir, 'embeddings.index.json'),
				JSON.stringify({ dim: 2, entries: { victim: -8 }, model: 'model' })
			);

			const store = openVectorStore(tmpDir, 'model', 2);

			expect(store.has('victim')).toBe(false);
		});

		it('drops a non-integer offset', () => {
			fs.writeFileSync(path.join(tmpDir, 'embeddings.bin'), Buffer.alloc(2 * Float32Array.BYTES_PER_ELEMENT));
			fs.writeFileSync(
				path.join(tmpDir, 'embeddings.index.json'),
				JSON.stringify({ dim: 2, entries: { victim: 1.5 }, model: 'model' })
			);

			const store = openVectorStore(tmpDir, 'model', 2);

			expect(store.has('victim')).toBe(false);
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

	describe('dimension and model pinning', () => {
		it('throws when reopened with a different embedding dimension than the persisted one', () => {
			const store = openVectorStore(tmpDir, 'nomic-embed-text', 4);
			store.append('mem-a', [1, 2, 3, 4]);
			store.flush();

			expect(() => openVectorStore(tmpDir, 'nomic-embed-text', 8)).toThrow(/reembed/i);
		});

		it('throws when reopened with a different embedding model than the persisted one', () => {
			const store = openVectorStore(tmpDir, 'nomic-embed-text', 4);
			store.append('mem-a', [1, 2, 3, 4]);
			store.flush();

			expect(() => openVectorStore(tmpDir, 'other-model', 4)).toThrow(/reembed/i);
		});

		it('preserves count when reopened with the same model and dim', () => {
			const store = openVectorStore(tmpDir, 'nomic-embed-text', 2);
			store.append('mem-a', [1, 0]);
			store.append('mem-b', [0, 1]);
			store.flush();

			const reopened = openVectorStore(tmpDir, 'nomic-embed-text', 2);
			expect(reopened.count()).toBe(2);
		});

		it('rejects appends whose vector length does not match the store dim', () => {
			const store = openVectorStore(tmpDir, 'model', 4);
			expect(() => store.append('mem-a', [1, 2])).toThrow(/dim/i);
		});
	});

	describe('readVectorStoreMeta', () => {
		it('returns null when no embeddings.index.json exists', () => {
			expect(readVectorStoreMeta(tmpDir)).toBeNull();
		});

		it('returns the persisted model and dim once a store has been flushed', () => {
			const store = openVectorStore(tmpDir, 'nomic-embed-text', 6);
			store.append('mem-a', [1, 2, 3, 4, 5, 6]);
			store.flush();

			expect(readVectorStoreMeta(tmpDir)).toEqual({ dim: 6, model: 'nomic-embed-text' });
		});
	});

	describe('atomic flush', () => {
		it('does not leave a .tmp file alongside embeddings.bin or embeddings.index.json', () => {
			const store = openVectorStore(tmpDir, 'nomic-embed-text', 2);
			store.append('mem-a', [1, 0]);
			store.flush();

			const stragglers = fs.readdirSync(tmpDir).filter((f) => f.endsWith('.tmp'));
			expect(stragglers).toEqual([]);
		});
	});
});
