import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

const BIN_FILENAME = 'embeddings.bin';
const INDEX_FILENAME = 'embeddings.index.json';

export interface VectorStore {
	append(id: string, vector: number[]): void;
	compact(liveIds: Set<string>): void;
	count(): number;
	coverage(liveIds: Set<string>): number;
	dim: number;
	flush(): void;
	has(id: string): boolean;
	model: string;
	read(id: string): Float32Array | null;
}

interface VectorIndex {
	dim: number;
	entries: Record<string, number>; // id → byte offset in bin
	model: string;
}

/**
 * Open (or create) a vector store in a directory.
 * Loads existing data from disk if present; otherwise starts empty.
 */
export function openVectorStore(dir: string, model: string, dim: number): VectorStore {
	mkdirSync(dir, { recursive: true });

	const binPath = path.join(dir, BIN_FILENAME);
	const indexPath = path.join(dir, INDEX_FILENAME);

	let buffer = Buffer.alloc(0);
	const offsets = new Map<string, number>(); // id → byte offset
	let loadedDim = dim;
	let loadedModel = model;

	// Load existing data if present
	try {
		const raw = JSON.parse(readFileSync(indexPath, 'utf-8')) as VectorIndex;
		loadedDim = raw.dim;
		loadedModel = raw.model;
		for (const [id, offset] of Object.entries(raw.entries)) {
			offsets.set(id, offset);
		}
	} catch {
		// no existing index — start fresh
	}

	try {
		buffer = readFileSync(binPath);
	} catch {
		// no existing bin
	}

	const bytesPerVector = loadedDim * Float32Array.BYTES_PER_ELEMENT;
	let nextOffset = buffer.length;

	return {
		append(id: string, vector: number[]): void {
			const f32 = new Float32Array(vector);
			const chunk = Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
			buffer = Buffer.concat([buffer, chunk]);
			offsets.set(id, nextOffset);
			nextOffset += bytesPerVector;
		},
		compact(liveIds: Set<string>): void {
			// Rebuild buffer keeping only live IDs in insertion order
			let newBuffer = Buffer.alloc(0);
			const newOffsets = new Map<string, number>();
			let newNext = 0;

			for (const [id, offset] of offsets) {
				if (!liveIds.has(id)) continue;
				const chunk = buffer.slice(offset, offset + bytesPerVector);
				newBuffer = Buffer.concat([newBuffer, chunk]);
				newOffsets.set(id, newNext);
				newNext += bytesPerVector;
			}

			buffer = newBuffer;
			offsets.clear();
			for (const [id, off] of newOffsets) offsets.set(id, off);
			nextOffset = newNext;
			this.flush();
		},

		count(): number {
			return offsets.size;
		},

		coverage(liveIds: Set<string>): number {
			if (liveIds.size === 0) return 0;
			let hit = 0;
			for (const id of liveIds) {
				if (offsets.has(id)) hit++;
			}
			return hit / liveIds.size;
		},

		dim: loadedDim,

		flush(): void {
			mkdirSync(dir, { recursive: true });
			writeFileSync(binPath, buffer);
			const index: VectorIndex = { dim: loadedDim, entries: Object.fromEntries(offsets), model: loadedModel };
			writeFileSync(indexPath, JSON.stringify(index, null, 2));
		},

		has(id: string): boolean {
			return offsets.has(id);
		},

		model: loadedModel,

		read(id: string): Float32Array | null {
			const offset = offsets.get(id);
			if (offset === undefined) return null;
			const slice = buffer.slice(offset, offset + bytesPerVector);
			const copy = Buffer.allocUnsafe(slice.length);
			slice.copy(copy);
			return new Float32Array(copy.buffer, copy.byteOffset, loadedDim);
		}
	};
}
