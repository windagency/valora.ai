import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

import type { Edge, MemoryCategory, MemoryEntry, MemoryStorePort } from 'types/memory.types';

import { MEMORY_STORE_VERSION } from 'config/constants';
import { getLogger } from 'output/logger';

import { atomicWriteFile, serialiseMemoryFile } from './file-format';
import { addRecord, buildVaultIndex, createEmptyIndex, removeRecord, type VaultIndex } from './vault-index';

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
		const existing = await this.getEntries(category);
		const existingIds = new Set(existing.map((e) => e.id));
		const newIds = new Set(entries.map((e) => e.id));

		for (const id of existingIds) {
			if (!newIds.has(id)) await this.removeEntry(category, id);
		}
		for (const entry of entries) {
			if (existingIds.has(entry.id)) {
				await this.updateEntry(category, entry.id, entry);
			} else {
				await this.appendEntry(category, entry);
			}
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
		atomicWriteFile(record.mdPath, serialiseMemoryFile(updated, record.links));
		this.index.byId.set(id, { ...record, entry: updated });
		this.touchMeta(category);
		return Promise.resolve(true);
	}

	private ensureIndex(): void {
		if (this.indexLoaded) return;
		this.indexLoaded = true;
		this.index = buildVaultIndex(this.vaultDir);
		this.loadMeta();
	}

	private loadMeta(): void {
		// meta is lightweight — derive from index scan if not persisted
		for (const category of ALL_CATEGORIES) {
			this.meta.set(category, { lastWrittenAt: new Date().toISOString() });
		}
	}

	private mdPath(category: MemoryCategory, id: string): string {
		return path.join(this.vaultDir, category, `${id}.md`);
	}

	private persistMeta(): void {
		try {
			mkdirSync(this.vaultDir, { recursive: true });
			const metaPath = path.join(this.vaultDir, 'meta.json');
			const serialised: Record<string, VaultMeta> = {};
			for (const [cat, m] of this.meta) serialised[cat] = m;
			writeFileSync(metaPath, JSON.stringify(serialised, null, 2));
		} catch (err) {
			getLogger().warn(`Vault: could not persist meta: ${String(err)}`);
		}
	}

	private touchMeta(category: MemoryCategory): void {
		const meta = this.meta.get(category) ?? {};
		this.meta.set(category, { ...meta, lastWrittenAt: new Date().toISOString() });
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
