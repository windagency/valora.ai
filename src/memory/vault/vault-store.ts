import { readVaultVersion, writeVaultVersion } from 'memory/migration/vault-version';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import * as path from 'node:path';

import type { Edge, MemoryCategory, MemoryEntry, MemoryStorePort } from 'types/memory.types';

import { MEMORY_STORE_VERSION } from 'config/constants';
import { getLogger } from 'output/logger';

import { atomicWriteFile, parseVaultLinks, serialiseMemoryFile } from './file-format';
import {
	addRecord,
	buildVaultIndex,
	createEmptyIndex,
	removeRecord,
	synthesiseCoAccessedEdges,
	type VaultIndex,
	type VaultRecord
} from './vault-index';

export interface VaultStats {
	edgeCount: number;
	embeddingCoverage: number;
	entryCount: number;
}

interface VaultMeta {
	lastConsolidatedAt?: string;
	lastWrittenAt: string;
}

const ALL_CATEGORIES: MemoryCategory[] = ['episodic', 'semantic', 'decisions'];
const META_FILENAME = 'meta.json';

export class VaultStore implements MemoryStorePort {
	private index: VaultIndex;
	private indexLoaded = false;
	private readonly meta: Map<MemoryCategory, VaultMeta> = new Map();
	private readonly vaultDir: string;

	constructor(vaultDir: string) {
		this.vaultDir = vaultDir;
		this.index = createEmptyIndex();
	}

	async appendEntry(category: MemoryCategory, entry: MemoryEntry): Promise<void> {
		return this.appendEntryWithLinks(category, entry, []);
	}

	appendEntryWithLinks(category: MemoryCategory, entry: MemoryEntry, links: Edge[]): Promise<void> {
		this.ensureIndex();
		const mdPath = this.mdPath(category, entry.id);
		atomicWriteFile(mdPath, serialiseMemoryFile(entry, links));
		addRecord(this.index, { entry, links, mdPath });
		this.touchMeta(category);
		return Promise.resolve();
	}

	async flush(): Promise<void> {
		// writes are immediate — nothing to flush
	}

	getEntries(category: MemoryCategory): Promise<MemoryEntry[]> {
		this.ensureIndex();
		const ids = this.index.byCategory.get(category);
		if (!ids) return Promise.resolve([]);
		return Promise.resolve(
			[...ids].map((id) => this.index.byId.get(id)?.entry).filter((e): e is MemoryEntry => e !== undefined)
		);
	}

	getMetadata(
		category: MemoryCategory
	): Promise<{ lastConsolidatedAt?: string; lastWrittenAt: string; version: number }> {
		this.ensureIndex();
		const meta = this.meta.get(category) ?? { lastWrittenAt: new Date().toISOString() };
		return Promise.resolve({
			lastConsolidatedAt: meta.lastConsolidatedAt,
			lastWrittenAt: meta.lastWrittenAt,
			version: MEMORY_STORE_VERSION
		});
	}

	getVaultDir(): string {
		return this.vaultDir;
	}

	getVaultIndex(): Promise<VaultIndex> {
		this.ensureIndex();
		return Promise.resolve(this.index);
	}

	/** Additional stat surface for the `valora memory info` command. */
	getVaultStats(): VaultStats {
		this.ensureIndex();
		const entryCount = this.index.byId.size;
		let edgeCount = 0;
		for (const [, edges] of this.index.outEdges) edgeCount += edges.length;

		let embeddedCount = 0;
		for (const [, record] of this.index.byId) {
			if (record.entry.embeddingModel !== undefined) embeddedCount++;
		}
		const embeddingCoverage = entryCount === 0 ? 0 : embeddedCount / entryCount;

		return { edgeCount, embeddingCoverage, entryCount };
	}

	async removeEntries(category: MemoryCategory, ids: Set<string>): Promise<number> {
		this.ensureIndex();
		let count = 0;
		for (const id of ids) {
			if (await this.removeEntry(category, id)) count++;
		}
		return count;
	}

	removeEntry(category: MemoryCategory, id: string): Promise<boolean> {
		this.ensureIndex();
		const record = this.index.byId.get(id);
		if (record?.entry.category !== category) return Promise.resolve(false);

		try {
			rmSync(record.mdPath);
		} catch (err) {
			getLogger().warn(`Vault: could not delete ${record.mdPath}: ${String(err)}`);
		}
		removeRecord(this.index, id);
		return Promise.resolve(true);
	}

	save(_category: MemoryCategory, _immediate?: boolean): void {
		// no-op: vault writes are atomic and immediate
	}

	async setEntries(category: MemoryCategory, entries: MemoryEntry[]): Promise<void> {
		this.ensureIndex();
		// Snapshot the full VaultRecord (entry + programmatic links) so rollback
		// can restore edges that are not embedded in the content body.
		const beforeRecords = this.snapshotCategory(category);
		const beforeIds = new Set(beforeRecords.map((r) => r.entry.id));
		const newIds = new Set(entries.map((e) => e.id));

		try {
			for (const id of beforeIds) {
				if (!newIds.has(id)) await this.removeEntry(category, id);
			}
			for (const entry of entries) {
				if (beforeIds.has(entry.id)) {
					await this.updateEntry(category, entry.id, entry);
				} else {
					await this.appendEntry(category, entry);
				}
			}
		} catch (err) {
			getLogger().warn(`Vault.setEntries: rolling back due to error: ${String(err)}`);
			await this.rollbackSetEntries(category, beforeRecords);
			throw err;
		}
	}

	setLastConsolidatedAt(timestamp: string): Promise<void> {
		this.ensureIndex();
		for (const category of ALL_CATEGORIES) {
			const meta = this.meta.get(category) ?? { lastWrittenAt: new Date().toISOString() };
			meta.lastConsolidatedAt = timestamp;
			this.meta.set(category, meta);
		}
		this.persistMeta();
		return Promise.resolve();
	}

	updateEntry(category: MemoryCategory, id: string, patch: Partial<MemoryEntry>): Promise<boolean> {
		this.ensureIndex();
		const record = this.index.byId.get(id);
		if (record?.entry.category !== category) return Promise.resolve(false);

		const updated: MemoryEntry = { ...record.entry, ...patch };
		// If the patch changed `content`, re-derive any wikilinks embedded in
		// the new body so they are not lost. Inline links from the previous
		// content are dropped; links not present in the new body should not
		// appear in the file. Frontmatter-managed `coAccess` is unaffected.
		const links = patch.content !== undefined ? parseVaultLinks(id, patch.content) : record.links;
		atomicWriteFile(record.mdPath, serialiseMemoryFile(updated, links));
		this.index.byId.set(id, { ...record, entry: updated, links });

		this.refreshSecondaryIndexes(record.entry, updated);

		// Compute the full edge set (explicit links + synthesised co_accessed)
		// for both the previous and updated record so the in-memory inEdges/outEdges
		// stay consistent with what addRecord would build on a fresh reload.
		const previousOut = this.index.outEdges.get(id) ?? [];
		const nextOut = [...links, ...synthesiseCoAccessedEdges(updated)];
		for (const edge of previousOut) this.index.inEdges.get(edge.toId)?.delete(id);
		this.index.outEdges.set(id, nextOut);
		for (const edge of nextOut) {
			let inSet = this.index.inEdges.get(edge.toId);
			if (!inSet) {
				inSet = new Set();
				this.index.inEdges.set(edge.toId, inSet);
			}
			inSet.add(id);
		}

		this.touchMeta(category);
		return Promise.resolve(true);
	}

	private ensureIndex(): void {
		if (this.indexLoaded) return;
		this.indexLoaded = true;
		this.index = buildVaultIndex(this.vaultDir);
		this.loadMeta();
		// Stamp the schema version on first use so future migrations can
		// detect the format generation that wrote the vault.
		if (readVaultVersion(this.vaultDir) === null) {
			try {
				writeVaultVersion(this.vaultDir);
			} catch (err) {
				getLogger().warn(`Vault: could not write version file: ${String(err)}`);
			}
		}
	}

	private loadMeta(): void {
		const persisted = this.readPersistedMeta();
		for (const category of ALL_CATEGORIES) {
			const fallback: VaultMeta = { lastWrittenAt: new Date().toISOString() };
			this.meta.set(category, persisted[category] ?? fallback);
		}
	}

	private mdPath(category: MemoryCategory, id: string): string {
		return path.join(this.vaultDir, category, `${id}.md`);
	}

	private persistMeta(): void {
		try {
			const metaPath = path.join(this.vaultDir, META_FILENAME);
			const serialized: Record<string, VaultMeta> = {};
			for (const [cat, m] of this.meta) serialized[cat] = m;
			atomicWriteFile(metaPath, JSON.stringify(serialized, null, 2));
		} catch (err) {
			getLogger().warn(`Vault: could not persist meta: ${String(err)}`);
		}
	}

	private readPersistedMeta(): Record<string, VaultMeta> {
		const metaPath = path.join(this.vaultDir, META_FILENAME);
		if (!existsSync(metaPath)) return {};
		try {
			const raw = readFileSync(metaPath, 'utf-8');
			const parsed = JSON.parse(raw) as Record<string, VaultMeta>;
			return parsed;
		} catch (err) {
			getLogger().warn(`Vault: could not read meta.json: ${String(err)}`);
			return {};
		}
	}

	private async rollbackSetEntries(category: MemoryCategory, before: VaultRecord[]): Promise<void> {
		const beforeIds = new Set(before.map((r) => r.entry.id));
		const current = await this.getEntries(category);
		for (const entry of current) {
			if (!beforeIds.has(entry.id)) await this.removeEntry(category, entry.id);
		}
		for (const record of before) {
			const stillThere = current.find((e) => e.id === record.entry.id);
			// Use appendEntryWithLinks to preserve programmatic edges (supersedes,
			// decays_from, co_accessed) that are not embedded in the content body.
			if (!stillThere) await this.appendEntryWithLinks(category, record.entry, record.links);
			else await this.updateEntry(category, record.entry.id, record.entry);
		}
	}

	private snapshotCategory(category: MemoryCategory): VaultRecord[] {
		const ids = this.index.byCategory.get(category);
		if (!ids) return [];
		const records: VaultRecord[] = [];
		for (const id of ids) {
			const rec = this.index.byId.get(id);
			if (rec) records.push({ entry: { ...rec.entry }, links: [...rec.links], mdPath: rec.mdPath });
		}
		return records;
	}

	private touchMeta(category: MemoryCategory): void {
		const meta = this.meta.get(category) ?? {};
		this.meta.set(category, { ...meta, lastWrittenAt: new Date().toISOString() });
	}

	/**
	 * Diff-update the secondary indexes (byTag/byPath/byAgent/byCategory) so
	 * lookups by those keys stay consistent with the current entry state. Without
	 * this, an updateEntry that changes tags/paths/agentRole/category leaves
	 * stale references under the old keys and never registers under the new ones.
	 */
	private refreshSecondaryIndexes(previous: MemoryEntry, next: MemoryEntry): void {
		const id = next.id;
		if (previous.category !== next.category) {
			this.index.byCategory.get(previous.category)?.delete(id);
			let nextCat = this.index.byCategory.get(next.category);
			if (!nextCat) {
				nextCat = new Set();
				this.index.byCategory.set(next.category, nextCat);
			}
			nextCat.add(id);
		}
		if (previous.agentRole !== next.agentRole) {
			this.index.byAgent.get(previous.agentRole)?.delete(id);
			let nextAgent = this.index.byAgent.get(next.agentRole);
			if (!nextAgent) {
				nextAgent = new Set();
				this.index.byAgent.set(next.agentRole, nextAgent);
			}
			nextAgent.add(id);
		}
		diffSet(this.index.byTag, previous.tags, next.tags, id);
		diffSet(this.index.byPath, previous.relatedPaths, next.relatedPaths, id);
	}
}

function diffSet(map: Map<string, Set<string>>, before: string[], after: string[], id: string): void {
	const beforeSet = new Set(before);
	const afterSet = new Set(after);
	for (const key of beforeSet) {
		if (!afterSet.has(key)) map.get(key)?.delete(id);
	}
	for (const key of afterSet) {
		if (beforeSet.has(key)) continue;
		let bucket = map.get(key);
		if (!bucket) {
			bucket = new Set();
			map.set(key, bucket);
		}
		bucket.add(id);
	}
}

/**
 * Rebuild an in-memory VaultStore from disk, re-parsing all `.md` files.
 * Used by the migration and info CLI commands.
 */
export function openVaultStore(vaultDir: string): VaultStore {
	return new VaultStore(vaultDir);
}

/** Parse a single `.md` file from an already-known path and update the index. */
export function importFileIntoStore(store: VaultStore, category: MemoryCategory, entry: MemoryEntry): Promise<void> {
	return store.appendEntry(category, entry);
}
