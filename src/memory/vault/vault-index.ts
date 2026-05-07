import { readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

import type { Edge, MemoryCategory, MemoryEntry } from 'types/memory.types';

import { getLogger } from 'output/logger';

import { parseMemoryFile } from './file-format';

export interface VaultIndex {
	byAgent: Map<string, Set<string>>;
	byCategory: Map<MemoryCategory, Set<string>>;
	byId: Map<string, VaultRecord>;
	byPath: Map<string, Set<string>>;
	byTag: Map<string, Set<string>>;
	inEdges: Map<string, Set<string>>;
	outEdges: Map<string, Edge[]>;
}

export interface VaultRecord {
	entry: MemoryEntry;
	links: Edge[];
	mdPath: string;
}

export function createEmptyIndex(): VaultIndex {
	return {
		byAgent: new Map(),
		byCategory: new Map(),
		byId: new Map(),
		byPath: new Map(),
		byTag: new Map(),
		inEdges: new Map(),
		outEdges: new Map()
	};
}

/** Scan all `.md` files in a vault directory and build the in-memory index. */
export function addRecord(index: VaultIndex, record: VaultRecord): void {
	const { entry, links, mdPath } = record;
	index.byId.set(entry.id, { entry, links, mdPath });

	addToSet(index.byCategory, entry.category, entry.id);
	addToSet(index.byAgent, entry.agentRole, entry.id);
	for (const tag of entry.tags) addToSet(index.byTag, tag, entry.id);
	for (const p of entry.relatedPaths) addToSet(index.byPath, p, entry.id);

	const allOut: Edge[] = [...links, ...synthesiseCoAccessedEdges(entry)];
	index.outEdges.set(entry.id, allOut);
	for (const edge of allOut) {
		addToSet(index.inEdges, edge.toId, entry.id);
	}
}

export function buildVaultIndex(vaultDir: string): VaultIndex {
	const index = createEmptyIndex();
	const categories: MemoryCategory[] = ['episodic', 'semantic', 'decisions'];

	for (const category of categories) {
		const categoryDir = path.join(vaultDir, category);
		let files: string[];
		try {
			files = readdirSync(categoryDir).filter((f) => f.endsWith('.md'));
		} catch {
			continue;
		}
		for (const file of files) {
			const mdPath = path.join(categoryDir, file);
			try {
				const content = readFileSync(mdPath, 'utf-8');
				const id = path.basename(file, '.md');
				const { entry, links } = parseMemoryFile(content, id);
				addRecord(index, { entry, links, mdPath });
			} catch (err) {
				// Silent skipping turns vault corruption into invisible data
				// loss. Surface a structured warning so operators can act —
				// the index is still built from whatever else parses cleanly.
				getLogger().warn(`Vault: failed to parse ${mdPath}: ${(err as Error).message}`);
			}
		}
	}

	return index;
}

export function removeRecord(index: VaultIndex, id: string): void {
	const record = index.byId.get(id);
	if (!record) return;

	const { entry, links } = record;
	index.byId.delete(id);

	removeFromSet(index.byCategory, entry.category, id);
	removeFromSet(index.byAgent, entry.agentRole, id);
	for (const tag of entry.tags) removeFromSet(index.byTag, tag, id);
	for (const p of entry.relatedPaths) removeFromSet(index.byPath, p, id);

	index.outEdges.delete(id);
	for (const edge of links) {
		removeFromSet(index.inEdges, edge.toId, id);
	}
}

/**
 * Convert persisted Hebbian co-retrieval counts into traversable `co_accessed` edges.
 * Without this step the counts are dead-on-reload — the edges that ADR-013 §5
 * requires spreading activation to walk would not exist after a process restart.
 * Edge weight uses log1p to dampen the influence of runaway pair counts.
 */
export function synthesiseCoAccessedEdges(entry: { coAccess?: Record<string, number>; id: string }): Edge[] {
	if (!entry.coAccess) return [];
	const edges: Edge[] = [];
	for (const [peerId, count] of Object.entries(entry.coAccess)) {
		if (count <= 0) continue;
		edges.push({ fromId: entry.id, kind: 'co_accessed', toId: peerId, weight: Math.log1p(count) });
	}
	return edges;
}

function addToSet<K>(map: Map<K, Set<string>>, key: K, value: string): void {
	let set = map.get(key);
	if (!set) {
		set = new Set();
		map.set(key, set);
	}
	set.add(value);
}

function removeFromSet<K>(map: Map<K, Set<string>>, key: K, value: string): void {
	map.get(key)?.delete(value);
}
