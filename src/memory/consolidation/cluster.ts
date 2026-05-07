import type { VectorStore } from 'memory/embeddings/vector-store';

import { cosineSimilarity } from 'memory/retrieval/cosine-ann';

import type { MemoryEntry } from 'types/memory.types';

/**
 * Pick a representative summary from a cluster. Currently the longest content
 * wins — a deterministic, easily-explained heuristic. The function is kept
 * intentionally simple; richer summarisation belongs in a later iteration.
 */
interface VectoredEntry {
	entry: MemoryEntry;
	vec: Float32Array;
}

export function centroidSummary(cluster: MemoryEntry[]): string {
	return cluster.reduce((longest, e) => (e.content.length > longest.content.length ? e : longest)).content;
}

/**
 * Cluster entries whose embedding cosine similarity meets `threshold`.
 *
 * The implementation is order-independent: it sorts the input by `entry.id`
 * before clustering, performs a Union-Find pass over all pairwise comparisons,
 * and emits clusters of size ≥ 2 in deterministic order. The same logical
 * input always produces the same output (audit finding H12).
 */
export function cosineClusters(entries: MemoryEntry[], vectorStore: VectorStore, threshold: number): MemoryEntry[][] {
	const vectored = collectVectored(entries, vectorStore);
	if (vectored.length === 0) return [];

	const parent = new Array<number>(vectored.length).fill(0).map((_, i) => i);
	for (let i = 0; i < vectored.length; i++) {
		for (let j = i + 1; j < vectored.length; j++) {
			const score = cosineSimilarity(vectored[i]!.vec, vectored[j]!.vec);
			if (score >= threshold) union(parent, i, j);
		}
	}

	return collectClusters(parent, vectored);
}

function collectClusters(parent: number[], vectored: VectoredEntry[]): MemoryEntry[][] {
	const groups = new Map<number, MemoryEntry[]>();
	for (let i = 0; i < vectored.length; i++) {
		const root = find(parent, i);
		const list = groups.get(root) ?? [];
		list.push(vectored[i]!.entry);
		groups.set(root, list);
	}
	return [...groups.values()].filter((m) => m.length >= 2);
}

function collectVectored(entries: MemoryEntry[], vectorStore: VectorStore): VectoredEntry[] {
	const vectored: VectoredEntry[] = [];
	for (const entry of entries) {
		const vec = vectorStore.read(entry.id);
		if (vec !== null) vectored.push({ entry, vec });
	}
	// Byte-order sort — locale-independent and deterministic across environments.
	vectored.sort((a, b) => (a.entry.id < b.entry.id ? -1 : a.entry.id > b.entry.id ? 1 : 0));
	return vectored;
}

function find(parent: number[], i: number): number {
	while (parent[i] !== i) {
		parent[i] = parent[parent[i]!]!;
		i = parent[i]!;
	}
	return i;
}

function union(parent: number[], a: number, b: number): void {
	const ra = find(parent, a);
	const rb = find(parent, b);
	if (ra === rb) return;
	if (ra < rb) parent[rb] = ra;
	else parent[ra] = rb;
}
