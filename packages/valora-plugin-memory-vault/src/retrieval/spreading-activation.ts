import type { ConfidenceTier, Edge } from '@windagency/valora-plugin-api';

import { computeStrength } from '@windagency/valora-plugin-memory-vault';

import type { VaultRecord } from '../vault/vault-index.js';

const CONFIDENCE_WEIGHT: Record<ConfidenceTier, number> = {
	inferred: 0.4,
	observed: 0.7,
	stale: 0.1,
	verified: 1.0
};

const TRAVERSAL_KINDS = new Set<Edge['kind']>(['co_accessed', 'related']);

/**
 * Edges whose backward traversal carries semantic weight. `co_accessed` is
 * symmetric (Hebbian co-retrieval), so reverse propagation is meaningful.
 * `related` is directional in our schema; we choose not to propagate backwards
 * to avoid amplifying activation through one-way authorial intent (e.g.,
 * "promotion-from-X" should not flood X's neighbours).
 */
const REVERSE_TRAVERSAL_KINDS = new Set<Edge['kind']>(['co_accessed']);

export function spreadActivation(
	seeds: Map<string, number>,
	byId: Map<string, VaultRecord>,
	outEdges: Map<string, Edge[]>,
	inEdges: Map<string, Set<string>>,
	depth: number,
	gamma: number,
	now = Date.now()
): Map<string, number> {
	if (gamma > 1) throw new Error(`spreadActivation: gamma must be <= 1 (got ${gamma})`);
	const activation = new Map<string, number>(seeds);
	const queue: Array<[string, number]> = [...seeds.keys()].map((id) => [id, depth]);

	let head = 0;
	while (head < queue.length) {
		const [currentId, remaining] = queue[head++]!;
		if (remaining === 0) continue;
		const act = activation.get(currentId) ?? 0;
		propagateForward(currentId, act, remaining, gamma, outEdges, activation, queue);
		propagateReverse(currentId, act, remaining, gamma, outEdges, inEdges, activation, queue);
	}

	return scoreActivation(activation, byId, now);
}

/**
 * Apply a candidate activation to a node and re-enqueue it for further
 * propagation if the new activation is strictly higher than what is already
 * recorded. The activation guard alone terminates cycles because activation
 * decays by `gamma < 1` at every hop, so a node revisited via a longer path
 * always carries a smaller candidate.
 */
function propagate(
	id: string,
	activation: number,
	remaining: number,
	activationMap: Map<string, number>,
	queue: Array<[string, number]>
): void {
	const current = activationMap.get(id) ?? 0;
	if (activation <= current) return;
	activationMap.set(id, activation);
	if (remaining > 0) queue.push([id, remaining]);
}

function propagateForward(
	currentId: string,
	act: number,
	remaining: number,
	gamma: number,
	outEdges: Map<string, Edge[]>,
	activation: Map<string, number>,
	queue: Array<[string, number]>
): void {
	for (const edge of outEdges.get(currentId) ?? []) {
		if (!TRAVERSAL_KINDS.has(edge.kind)) continue;
		propagate(edge.toId, act * (edge.weight ?? 1.0) * gamma, remaining - 1, activation, queue);
	}
}

function propagateReverse(
	currentId: string,
	act: number,
	remaining: number,
	gamma: number,
	outEdges: Map<string, Edge[]>,
	inEdges: Map<string, Set<string>>,
	activation: Map<string, number>,
	queue: Array<[string, number]>
): void {
	for (const neighborId of inEdges.get(currentId) ?? []) {
		const edge = (outEdges.get(neighborId) ?? []).find(
			(e) => e.toId === currentId && REVERSE_TRAVERSAL_KINDS.has(e.kind)
		);
		if (!edge) continue;
		propagate(neighborId, act * (edge.weight ?? 1.0) * gamma, remaining - 1, activation, queue);
	}
}

function scoreActivation(
	activation: Map<string, number>,
	byId: Map<string, VaultRecord>,
	now: number
): Map<string, number> {
	const scores = new Map<string, number>();
	for (const [id, act] of activation) {
		const record = byId.get(id);
		if (!record) continue;
		const decay = computeStrength(record.entry.createdAt, record.entry.halfLifeDays, now);
		const confidence = CONFIDENCE_WEIGHT[record.entry.confidence] ?? 0.7;
		scores.set(id, act * decay * confidence);
	}
	return scores;
}
