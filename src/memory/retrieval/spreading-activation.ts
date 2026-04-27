import type { VaultRecord } from 'memory/vault/vault-index';

import { computeStrength } from 'memory/decay';

import type { ConfidenceTier, Edge } from 'types/memory.types';

const CONFIDENCE_WEIGHT: Record<ConfidenceTier, number> = {
	inferred: 0.4,
	observed: 0.7,
	stale: 0.1,
	verified: 1.0
};

const TRAVERSAL_KINDS = new Set<Edge['kind']>(['co_accessed', 'related']);

export function spreadActivation(
	seeds: Map<string, number>,
	byId: Map<string, VaultRecord>,
	outEdges: Map<string, Edge[]>,
	inEdges: Map<string, Set<string>>,
	depth: number,
	gamma: number,
	now = Date.now()
): Map<string, number> {
	const activation = new Map<string, number>(seeds);
	const queue: Array<[string, number]> = [...seeds.keys()].map((id) => [id, depth]);
	const visited = new Set<string>(seeds.keys());

	let head = 0;
	while (head < queue.length) {
		const [currentId, remaining] = queue[head++]!;
		if (remaining === 0) continue;
		const act = activation.get(currentId) ?? 0;
		propagateForward(currentId, act, remaining, gamma, outEdges, activation, queue, visited);
		propagateReverse(currentId, act, remaining, gamma, outEdges, inEdges, activation, queue, visited);
	}

	return scoreActivation(activation, byId, now);
}

function propagate(
	id: string,
	activation: number,
	remaining: number,
	activationMap: Map<string, number>,
	queue: Array<[string, number]>,
	visited: Set<string>
): void {
	const current = activationMap.get(id) ?? 0;
	if (activation <= current) return;
	activationMap.set(id, activation);

	if (!visited.has(id) && remaining > 0) {
		visited.add(id);
		queue.push([id, remaining]);
	}
}

function propagateForward(
	currentId: string,
	act: number,
	remaining: number,
	gamma: number,
	outEdges: Map<string, Edge[]>,
	activation: Map<string, number>,
	queue: Array<[string, number]>,
	visited: Set<string>
): void {
	for (const edge of outEdges.get(currentId) ?? []) {
		if (!TRAVERSAL_KINDS.has(edge.kind)) continue;
		propagate(edge.toId, act * (edge.weight ?? 1.0) * gamma, remaining - 1, activation, queue, visited);
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
	queue: Array<[string, number]>,
	visited: Set<string>
): void {
	for (const neighborId of inEdges.get(currentId) ?? []) {
		const edge = (outEdges.get(neighborId) ?? []).find((e) => e.toId === currentId && TRAVERSAL_KINDS.has(e.kind));
		if (!edge) continue;
		propagate(neighborId, act * (edge.weight ?? 1.0) * gamma, remaining - 1, activation, queue, visited);
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
