import { readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

import type { Edge, MemoryCategory, MemoryEntry } from 'types/memory.types';

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

	index.outEdges.set(entry.id, links);
	for (const edge of links) {
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
			} catch {
				// skip unreadable files
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
