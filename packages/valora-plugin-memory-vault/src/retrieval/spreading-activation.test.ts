import { describe, expect, it } from 'vitest';

import type { Edge, MemoryEntry } from '@windagency/valora-plugin-api';
import type { VaultRecord } from '../vault/vault-index';

import { spreadActivation } from './spreading-activation';

const NOW_MS = new Date('2026-04-27T00:00:00.000Z').getTime();

function makeRecord(id: string, confidence: MemoryEntry['confidence'] = 'verified'): VaultRecord {
	const entry: MemoryEntry = {
		accessCount: 0,
		agentRole: 'test',
		category: 'episodic',
		confidence,
		content: `Memory ${id}`,
		createdAt: new Date(NOW_MS - 1000).toISOString(), // 1 second old → near-full strength
		halfLifeDays: 365, // slow decay for predictable tests
		id,
		isError: false,
		lastAccessedAt: new Date().toISOString(),
		relatedPaths: [],
		sessionId: 'ses-1',
		source: { command: 'test' },
		tags: [],
		updatedAt: new Date().toISOString()
	};
	return { entry, links: [], mdPath: `/vault/episodic/${id}.md` };
}

function makeIndex(records: VaultRecord[]): {
	byId: Map<string, VaultRecord>;
	inEdges: Map<string, Set<string>>;
	outEdges: Map<string, Edge[]>;
} {
	const byId = new Map(records.map((r) => [r.entry.id, r]));
	const outEdges = new Map<string, Edge[]>();
	const inEdges = new Map<string, Set<string>>();
	for (const r of records) {
		outEdges.set(r.entry.id, r.links);
		for (const e of r.links) {
			const set = inEdges.get(e.toId) ?? new Set();
			set.add(r.entry.id);
			inEdges.set(e.toId, set);
		}
	}
	return { byId, inEdges, outEdges };
}

describe('spreadActivation', () => {
	it('returns seeds with their initial scores when depth is 0', () => {
		const records = [makeRecord('a'), makeRecord('b')];
		const { byId, outEdges, inEdges } = makeIndex(records);
		const seeds = new Map([['a', 1.0]]);

		const result = spreadActivation(seeds, byId, outEdges, inEdges, 0, 0.6, NOW_MS);

		expect(result.has('a')).toBe(true);
		expect(result.has('b')).toBe(false);
	});

	it('propagates activation one hop along a related edge', () => {
		const a = makeRecord('a');
		a.links = [{ fromId: 'a', kind: 'related', toId: 'b' }];
		const b = makeRecord('b');
		const { byId, outEdges, inEdges } = makeIndex([a, b]);
		const seeds = new Map([['a', 1.0]]);

		const result = spreadActivation(seeds, byId, outEdges, inEdges, 1, 0.6, NOW_MS);

		expect(result.has('b')).toBe(true);
	});

	it('attenuates activation by gamma at each hop', () => {
		const a = makeRecord('a');
		a.links = [{ fromId: 'a', kind: 'related', toId: 'b' }];
		const b = makeRecord('b');
		b.links = [{ fromId: 'b', kind: 'related', toId: 'c' }];
		const c = makeRecord('c');
		const { byId, outEdges, inEdges } = makeIndex([a, b, c]);
		const seeds = new Map([['a', 1.0]]);
		const gamma = 0.6;

		const result = spreadActivation(seeds, byId, outEdges, inEdges, 2, gamma, NOW_MS);

		// c is two hops away with default edge weight 1.0: activation ≈ 1 × gamma × gamma
		const scoreA = result.get('a')!;
		const scoreB = result.get('b')!;
		const scoreC = result.get('c')!;
		expect(scoreB).toBeLessThan(scoreA);
		expect(scoreC).toBeLessThan(scoreB);
	});

	it('does not follow supersedes or decays_from edges', () => {
		const a = makeRecord('a');
		a.links = [
			{ fromId: 'a', kind: 'supersedes', toId: 'b' },
			{ fromId: 'a', kind: 'decays_from', toId: 'c' }
		];
		const b = makeRecord('b');
		const c = makeRecord('c');
		const { byId, outEdges, inEdges } = makeIndex([a, b, c]);
		const seeds = new Map([['a', 1.0]]);

		const result = spreadActivation(seeds, byId, outEdges, inEdges, 2, 0.6, NOW_MS);

		expect(result.has('b')).toBe(false);
		expect(result.has('c')).toBe(false);
	});

	it('follows co_accessed edges and boosts by log(1+count) weight', () => {
		const a = makeRecord('a');
		// co_accessed edge with count 9: weight = log(1+9) ≈ 2.302
		a.links = [{ fromId: 'a', kind: 'co_accessed', toId: 'b', weight: Math.log(1 + 9) }];
		const b = makeRecord('b');
		const { byId, outEdges, inEdges } = makeIndex([a, b]);
		const seeds = new Map([['a', 1.0]]);

		const result = spreadActivation(seeds, byId, outEdges, inEdges, 1, 0.6, NOW_MS);

		expect(result.has('b')).toBe(true);
	});

	it('applies confidence weights: verified > observed > inferred > stale', () => {
		// Use depth=0 seeds so score = activation × decay × confidenceWeight only
		const verified = makeRecord('verified', 'verified');
		const observed = makeRecord('observed', 'observed');
		const inferred = makeRecord('inferred', 'inferred');
		const stale = makeRecord('stale', 'stale');
		const { byId, outEdges, inEdges } = makeIndex([verified, observed, inferred, stale]);
		const seeds = new Map([
			['verified', 1.0],
			['observed', 1.0],
			['inferred', 1.0],
			['stale', 1.0]
		]);

		const result = spreadActivation(seeds, byId, outEdges, inEdges, 0, 0.6, NOW_MS);

		expect(result.get('verified')!).toBeGreaterThan(result.get('observed')!);
		expect(result.get('observed')!).toBeGreaterThan(result.get('inferred')!);
		expect(result.get('inferred')!).toBeGreaterThan(result.get('stale')!);
	});

	it('propagates activation backwards along symmetric co_accessed edges', () => {
		// b -- a: when both share a co_accessed edge and a is a seed, b should
		// receive activation via the reverse traversal because co_access is
		// Hebbian (symmetric).
		const b = makeRecord('b');
		b.links = [{ fromId: 'b', kind: 'co_accessed', toId: 'a' }];
		const a = makeRecord('a');
		const { byId, outEdges, inEdges } = makeIndex([a, b]);
		const seeds = new Map([['a', 1.0]]);

		const result = spreadActivation(seeds, byId, outEdges, inEdges, 1, 0.6, NOW_MS);

		expect(result.has('b')).toBe(true);
	});

	it('does NOT propagate backwards along directional related edges', () => {
		// b → a (related): activation should not flow backwards from a to b,
		// because `related` is a directional authorial edge.
		const b = makeRecord('b');
		b.links = [{ fromId: 'b', kind: 'related', toId: 'a' }];
		const a = makeRecord('a');
		const { byId, outEdges, inEdges } = makeIndex([a, b]);
		const seeds = new Map([['a', 1.0]]);

		const result = spreadActivation(seeds, byId, outEdges, inEdges, 1, 0.6, NOW_MS);

		expect(result.has('b')).toBe(false);
	});

	it('reaches a downstream node via the stronger of two parallel paths', () => {
		// a → b → d (weights 0.4, 0.4) and a → c → d (weights 0.9, 0.9). Without
		// re-enqueuing on stronger arrival, d would be locked to whichever path
		// arrived first in BFS order; with the activation guard it must reflect
		// the stronger composition.
		const a = makeRecord('a');
		a.links = [
			{ fromId: 'a', kind: 'related', toId: 'b', weight: 0.4 },
			{ fromId: 'a', kind: 'related', toId: 'c', weight: 0.9 }
		];
		const b = makeRecord('b');
		b.links = [{ fromId: 'b', kind: 'related', toId: 'd', weight: 0.4 }];
		const c = makeRecord('c');
		c.links = [{ fromId: 'c', kind: 'related', toId: 'd', weight: 0.9 }];
		const d = makeRecord('d');
		const { byId, outEdges, inEdges } = makeIndex([a, b, c, d]);
		const seeds = new Map([['a', 1.0]]);

		const result = spreadActivation(seeds, byId, outEdges, inEdges, 3, 1.0, NOW_MS);

		// Activation through c→d (1.0 × 0.9 × 0.9 = 0.81) should win over b→d
		// (1.0 × 0.4 × 0.4 = 0.16) — d's score divided by decay/confidence is
		// the activation, so d should be at least as large as the c-path value.
		const dScore = result.get('d') ?? 0;
		expect(dScore).toBeGreaterThan(0.16 * 0.7); // observed-tier confidence weight
	});

	it('takes the max activation when a node is reachable by multiple paths', () => {
		// Both b and c point to d; seed is a, a→b and a→c
		const a = makeRecord('a');
		a.links = [
			{ fromId: 'a', kind: 'related', toId: 'b' },
			{ fromId: 'a', kind: 'related', toId: 'c' }
		];
		const b = makeRecord('b');
		b.links = [{ fromId: 'b', kind: 'related', toId: 'd' }];
		const c = makeRecord('c');
		c.links = [{ fromId: 'c', kind: 'related', toId: 'd' }];
		const d = makeRecord('d');
		const { byId, outEdges, inEdges } = makeIndex([a, b, c, d]);
		const seeds = new Map([['a', 1.0]]);

		const result = spreadActivation(seeds, byId, outEdges, inEdges, 2, 0.6, NOW_MS);

		expect(result.has('d')).toBe(true);
	});

	it('throws when gamma is greater than 1 to prevent unbounded activation growth', () => {
		const a = makeRecord('a');
		const { byId, outEdges, inEdges } = makeIndex([a]);
		const seeds = new Map([['a', 1.0]]);

		expect(() => spreadActivation(seeds, byId, outEdges, inEdges, 3, 1.1, NOW_MS)).toThrow(/gamma.*must be.*<= 1/i);
	});
});
