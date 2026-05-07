import { atomicWriteBuffer, atomicWriteFile } from 'memory/vault/file-format';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
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

interface PersistedMeta {
	dim: number;
	model: string;
}

interface VectorIndex {
	dim: number;
	entries: Record<string, number>; // id → byte offset in bin
	model: string;
}

interface VectorStoreState {
	binPath: string;
	buffer: Buffer;
	bytesPerVector: number;
	dim: number;
	dir: string;
	indexPath: string;
	model: string;
	nextOffset: number;
	offsets: Map<string, number>;
	/**
	 * Unconsolidated chunks accumulated by `append`. Kept as separate Buffers
	 * to avoid the O(N²) reallocation cost of `Buffer.concat([buffer, chunk])`
	 * on every append. Consolidated lazily — see {@link consolidatePending}.
	 */
	pendingChunks: Buffer[];
}

/**
 * Read just the embedding model and dimension persisted on disk, without
 * loading the binary vectors. Returns null when no index file exists yet.
 *
 * Callers use this to align with the on-disk model/dim before opening the
 * store with `openVectorStore`, so they avoid the dim/model mismatch error.
 */
export function readVectorStoreMeta(dir: string): null | PersistedMeta {
	const indexPath = path.join(dir, INDEX_FILENAME);
	if (!existsSync(indexPath)) return null;
	try {
		const raw = JSON.parse(readFileSync(indexPath, 'utf-8')) as VectorIndex;
		if (typeof raw.dim !== 'number' || typeof raw.model !== 'string') return null;
		return { dim: raw.dim, model: raw.model };
	} catch {
		return null;
	}
}

/**
 * Open (or create) a vector store in a directory.
 *
 * If an existing index is present and its persisted `model` or `dim` differ
 * from the caller's arguments, this function throws — preventing corrupt
 * embeddings from being silently mixed. Callers should use
 * {@link readVectorStoreMeta} to align with on-disk values, or run
 * `valora memory reembed` to rebuild with a new model.
 */
export function openVectorStore(dir: string, model: string, dim: number): VectorStore {
	mkdirSync(dir, { recursive: true });
	const state = initializeState(dir, model, dim);
	return buildStoreApi(state);
}

function appendVector(state: VectorStoreState, id: string, vector: number[]): void {
	if (vector.length !== state.dim) {
		throw new Error(`Vector for id='${id}' has length ${vector.length}, expected dim ${state.dim}.`);
	}
	const f32 = new Float32Array(vector);
	const chunk = Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
	// Defer concatenation: appending to an array is O(1); a single Buffer.concat
	// at consolidation time replaces what would otherwise be O(N²) allocation
	// and copy across N appends.
	state.pendingChunks.push(chunk);
	state.offsets.set(id, state.nextOffset);
	state.nextOffset += state.bytesPerVector;
}

function buildStoreApi(state: VectorStoreState): VectorStore {
	return {
		append(id, vector) {
			appendVector(state, id, vector);
		},
		compact(liveIds) {
			compactState(state, liveIds);
			flushState(state);
		},
		count: () => state.offsets.size,
		coverage(liveIds) {
			if (liveIds.size === 0) return 0;
			let hit = 0;
			for (const id of liveIds) if (state.offsets.has(id)) hit++;
			return hit / liveIds.size;
		},
		get dim() {
			return state.dim;
		},
		flush: () => flushState(state),
		has: (id) => state.offsets.has(id),
		get model() {
			return state.model;
		},
		read: (id) => readVector(state, id)
	};
}

function compactState(state: VectorStoreState, liveIds: Set<string>): void {
	consolidatePending(state);
	const survivingChunks: Buffer[] = [];
	const newOffsets = new Map<string, number>();
	let newNext = 0;

	for (const [id, offset] of state.offsets) {
		if (!liveIds.has(id)) continue;
		// subarray returns a view; allocate a fresh buffer so the new contiguous
		// buffer does not alias the previous `state.buffer`.
		const view = state.buffer.subarray(offset, offset + state.bytesPerVector);
		const owned = Buffer.allocUnsafe(view.length);
		view.copy(owned);
		survivingChunks.push(owned);
		newOffsets.set(id, newNext);
		newNext += state.bytesPerVector;
	}

	// One concat, not N — the loop above does no allocation beyond per-vector copies.
	state.buffer = survivingChunks.length === 0 ? Buffer.alloc(0) : Buffer.concat(survivingChunks);
	state.offsets.clear();
	for (const [id, off] of newOffsets) state.offsets.set(id, off);
	state.nextOffset = newNext;
}

function consolidatePending(state: VectorStoreState): void {
	if (state.pendingChunks.length === 0) return;
	state.buffer = Buffer.concat([state.buffer, ...state.pendingChunks]);
	state.pendingChunks = [];
}

function flushState(state: VectorStoreState): void {
	consolidatePending(state);
	mkdirSync(state.dir, { recursive: true });
	atomicWriteBuffer(state.binPath, state.buffer);
	const index: VectorIndex = {
		dim: state.dim,
		entries: Object.fromEntries(state.offsets),
		model: state.model
	};
	atomicWriteFile(state.indexPath, JSON.stringify(index, null, 2));
}

function initializeState(dir: string, model: string, dim: number): VectorStoreState {
	const binPath = path.join(dir, BIN_FILENAME);
	const indexPath = path.join(dir, INDEX_FILENAME);
	const persisted = readVectorStoreMeta(dir);

	if (persisted !== null) {
		if (persisted.model !== model || persisted.dim !== dim) {
			throw new Error(
				`Vector store at ${dir} was written with model='${persisted.model}' dim=${persisted.dim}, ` +
					`but the caller requested model='${model}' dim=${dim}. ` +
					`Run \`valora memory reembed\` to rebuild embeddings with the new model.`
			);
		}
	}

	const offsets = loadOffsets(indexPath);
	const buffer = loadBuffer(binPath);

	return {
		binPath,
		buffer,
		bytesPerVector: dim * Float32Array.BYTES_PER_ELEMENT,
		dim,
		dir,
		indexPath,
		model,
		nextOffset: buffer.length,
		offsets,
		pendingChunks: []
	};
}

function loadBuffer(binPath: string): Buffer {
	try {
		return readFileSync(binPath);
	} catch {
		return Buffer.alloc(0);
	}
}

function loadOffsets(indexPath: string): Map<string, number> {
	const offsets = new Map<string, number>();
	try {
		const raw = JSON.parse(readFileSync(indexPath, 'utf-8')) as VectorIndex;
		for (const [id, offset] of Object.entries(raw.entries)) {
			offsets.set(id, offset);
		}
	} catch {
		// no existing index — start empty
	}
	return offsets;
}

function readVector(state: VectorStoreState, id: string): Float32Array | null {
	const offset = state.offsets.get(id);
	if (offset === undefined) return null;
	consolidatePending(state);
	// Copy bytes into a fresh ArrayBuffer so the returned Float32Array does not
	// alias the internal buffer (which may be reallocated by future appends).
	const slice = state.buffer.subarray(offset, offset + state.bytesPerVector);
	const copy = Buffer.allocUnsafe(slice.length);
	slice.copy(copy);
	return new Float32Array(copy.buffer, copy.byteOffset, state.dim);
}
