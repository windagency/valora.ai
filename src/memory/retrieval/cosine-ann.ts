import type { VectorStore } from 'memory/embeddings/vector-store';

export interface AnnCandidate {
	id: string;
	score: number;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i]! * b[i]!;
		normA += a[i]! * a[i]!;
		normB += b[i]! * b[i]!;
	}
	const denom = Math.sqrt(normA) * Math.sqrt(normB);
	return denom === 0 ? 0 : dot / denom;
}

export function topKCosine(
	queryVec: Float32Array,
	vectorStore: VectorStore,
	candidateIds: string[],
	k: number
): AnnCandidate[] {
	const scored: AnnCandidate[] = [];

	for (const id of candidateIds) {
		const vec = vectorStore.read(id);
		if (vec === null) continue;
		scored.push({ id, score: cosineSimilarity(queryVec, vec) });
	}

	scored.sort((a, b) => b.score - a.score);
	return scored.slice(0, k);
}
