import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { MemoryEntry } from '@windagency/valora-plugin-api';

import { openVectorStore } from '../embeddings/vector-store';
import { centroidSummary, cosineClusters } from './cluster';

function makeEntry(id: string, content = `Memory ${id}`): MemoryEntry {
	const now = new Date().toISOString();
	return {
		accessCount: 0,
		agentRole: 'test',
		category: 'episodic',
		confidence: 'observed',
		content,
		createdAt: now,
		halfLifeDays: 7,
		id,
		isError: false,
		lastAccessedAt: now,
		relatedPaths: [],
		sessionId: 'ses-1',
		source: { command: 'test' },
		tags: ['test'],
		updatedAt: now
	};
}

describe('cosineClusters', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-cluster-'));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { force: true, recursive: true });
	});

	it('returns empty when no entries are given', () => {
		const vs = openVectorStore(tmpDir, 'model', 2);
		expect(cosineClusters([], vs, 0.82)).toEqual([]);
	});

	it('returns empty when no entries have stored vectors', () => {
		const entries = [makeEntry('a'), makeEntry('b')];
		const vs = openVectorStore(tmpDir, 'model', 2);
		expect(cosineClusters(entries, vs, 0.82)).toEqual([]);
	});

	it('groups two highly similar entries into one cluster', () => {
		const a = makeEntry('a');
		const b = makeEntry('b');
		const vs = openVectorStore(tmpDir, 'model', 2);
		vs.append('a', [1, 0]);
		vs.append('b', [0.999, 0.045]); // cosine ≈ 0.999

		const clusters = cosineClusters([a, b], vs, 0.82);

		expect(clusters).toHaveLength(1);
		expect(clusters[0]).toHaveLength(2);
	});

	it('keeps orthogonal entries in separate clusters (no merge)', () => {
		const a = makeEntry('a');
		const b = makeEntry('b');
		const vs = openVectorStore(tmpDir, 'model', 2);
		vs.append('a', [1, 0]);
		vs.append('b', [0, 1]); // cosine = 0 < threshold

		const clusters = cosineClusters([a, b], vs, 0.82);

		// Neither cluster has ≥ 2 entries, so result is empty
		expect(clusters).toHaveLength(0);
	});

	it('produces two distinct clusters for two similarity groups', () => {
		const a = makeEntry('a');
		const b = makeEntry('b');
		const c = makeEntry('c');
		const d = makeEntry('d');
		const vs = openVectorStore(tmpDir, 'model', 2);
		// a and b are similar (both near [1,0])
		vs.append('a', [1, 0]);
		vs.append('b', [0.999, 0.045]);
		// c and d are similar (both near [0,1])
		vs.append('c', [0, 1]);
		vs.append('d', [0.045, 0.999]);

		const clusters = cosineClusters([a, b, c, d], vs, 0.82);

		expect(clusters).toHaveLength(2);
		expect(clusters.every((cl) => cl.length >= 2)).toBe(true);
	});

	it('ignores entries that have no vector in the store', () => {
		const a = makeEntry('a');
		const b = makeEntry('b');
		const noVec = makeEntry('no-vec');
		const vs = openVectorStore(tmpDir, 'model', 2);
		vs.append('a', [1, 0]);
		vs.append('b', [0.999, 0.045]);
		// no-vec is not in vectorStore

		const clusters = cosineClusters([a, b, noVec], vs, 0.82);

		expect(clusters).toHaveLength(1);
		expect(clusters[0]!.map((e) => e.id)).not.toContain('no-vec');
	});
});

describe('centroidSummary', () => {
	it('returns the content of the longest entry', () => {
		const short = makeEntry('s', 'short');
		const longer = makeEntry('l', 'this is a much longer content string');
		const mid = makeEntry('m', 'medium length text');

		expect(centroidSummary([short, longer, mid])).toBe(longer.content);
	});

	it('returns the single entry content when cluster has one member', () => {
		const entry = makeEntry('a', 'solo content');
		expect(centroidSummary([entry])).toBe('solo content');
	});
});
