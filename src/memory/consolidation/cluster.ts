import type { VectorStore } from 'memory/embeddings/vector-store';

import { cosineSimilarity } from 'memory/retrieval/cosine-ann';

import type { MemoryEntry } from 'types/memory.types';

export function centroidSummary(cluster: MemoryEntry[]): string {
	return cluster.reduce((longest, e) => (e.content.length > longest.content.length ? e : longest)).content;
}

export function cosineClusters(entries: MemoryEntry[], vectorStore: VectorStore, threshold: number): MemoryEntry[][] {
	// Only work with entries that have stored vectors
	const vectored: Array<{ entry: MemoryEntry; vec: Float32Array }> = [];
	for (const entry of entries) {
		const vec = vectorStore.read(entry.id);
		if (vec !== null) vectored.push({ entry, vec });
	}

	if (vectored.length === 0) return [];

	// Single-pass agglomerative: compare each entry to existing cluster centroids
	const clusters: Array<{ centroid: Float32Array; members: MemoryEntry[] }> = [];

	for (const { entry, vec } of vectored) {
		let bestCluster = -1;
		let bestScore = -Infinity;

		for (let i = 0; i < clusters.length; i++) {
			const score = cosineSimilarity(vec, clusters[i]!.centroid);
			if (score > bestScore) {
				bestScore = score;
				bestCluster = i;
			}
		}

		if (bestScore >= threshold && bestCluster !== -1) {
			const cluster = clusters[bestCluster]!;
			cluster.members.push(entry);
			cluster.centroid = averageVectors([...cluster.members.map((m) => vectorStore.read(m.id)!).filter(Boolean), vec]);
		} else {
			clusters.push({ centroid: vec, members: [entry] });
		}
	}

	return clusters.filter((c) => c.members.length >= 2).map((c) => c.members);
}

function averageVectors(vecs: Float32Array[]): Float32Array {
	if (vecs.length === 0) return new Float32Array(0);
	const dim = vecs[0]!.length;
	const sum = new Float32Array(dim);
	for (const v of vecs) {
		for (let i = 0; i < dim; i++) sum[i]! += v[i]!;
	}
	for (let i = 0; i < dim; i++) sum[i]! /= vecs.length;
	return sum;
}
