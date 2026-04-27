import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openVectorStore } from '../embeddings/vector-store';
import { cosineSimilarity, topKCosine } from './cosine-ann';

describe('cosineSimilarity', () => {
	it('returns 1.0 for identical vectors', () => {
		const a = new Float32Array([1, 0, 0]);
		expect(cosineSimilarity(a, a)).toBeCloseTo(1.0, 5);
	});

	it('returns 0.0 for orthogonal vectors', () => {
		const a = new Float32Array([1, 0]);
		const b = new Float32Array([0, 1]);
		expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 5);
	});

	it('returns -1.0 for opposite vectors', () => {
		const a = new Float32Array([1, 0]);
		const b = new Float32Array([-1, 0]);
		expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5);
	});

	it('returns 0.0 for a zero vector', () => {
		const a = new Float32Array([0, 0]);
		const b = new Float32Array([1, 0]);
		expect(cosineSimilarity(a, b)).toBe(0);
	});
});

describe('topKCosine', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-ann-'));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { force: true, recursive: true });
	});

	it('returns the most similar vector first', () => {
		const store = openVectorStore(tmpDir, 'test-model', 2);
		store.append('mem-close', [1, 0]);
		store.append('mem-far', [0, 1]);
		store.append('mem-mid', [0.7, 0.7]);

		const query = new Float32Array([1, 0]);
		const results = topKCosine(query, store, ['mem-close', 'mem-far', 'mem-mid'], 3);

		expect(results[0]?.id).toBe('mem-close');
	});

	it('returns results sorted by score descending', () => {
		const store = openVectorStore(tmpDir, 'test-model', 2);
		store.append('a', [1, 0]);
		store.append('b', [0.7, 0.7]);
		store.append('c', [0, 1]);

		const query = new Float32Array([1, 0]);
		const results = topKCosine(query, store, ['a', 'b', 'c'], 3);

		expect(results[0]!.score).toBeGreaterThanOrEqual(results[1]!.score);
		expect(results[1]!.score).toBeGreaterThanOrEqual(results[2]!.score);
	});

	it('returns at most K results', () => {
		const store = openVectorStore(tmpDir, 'test-model', 2);
		for (let i = 0; i < 10; i++) {
			store.append(`mem-${i}`, [Math.random(), Math.random()]);
		}
		const ids = Array.from({ length: 10 }, (_, i) => `mem-${i}`);
		const query = new Float32Array([1, 0]);

		const results = topKCosine(query, store, ids, 3);
		expect(results).toHaveLength(3);
	});

	it('returns fewer than K when corpus is smaller', () => {
		const store = openVectorStore(tmpDir, 'test-model', 2);
		store.append('only', [1, 0]);

		const query = new Float32Array([1, 0]);
		const results = topKCosine(query, store, ['only'], 10);
		expect(results).toHaveLength(1);
	});

	it('returns empty array when no candidate ids provided', () => {
		const store = openVectorStore(tmpDir, 'test-model', 2);
		const query = new Float32Array([1, 0]);
		expect(topKCosine(query, store, [], 5)).toEqual([]);
	});

	it('skips ids not present in the vector store', () => {
		const store = openVectorStore(tmpDir, 'test-model', 2);
		store.append('real', [1, 0]);

		const query = new Float32Array([1, 0]);
		const results = topKCosine(query, store, ['real', 'missing'], 5);
		expect(results).toHaveLength(1);
		expect(results[0]?.id).toBe('real');
	});
});
