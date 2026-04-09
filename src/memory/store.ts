/**
 * Memory Store — file-based JSON persistence for memory entries.
 *
 * Stores three JSON files in .valora/memory/:
 *   - episodic.json  (timestamped memories, 7-day half-life)
 *   - semantic.json  (consolidated patterns, 30-day half-life)
 *   - decisions.json (architectural decisions, 21-day half-life)
 *
 * Follows the SessionStore/SessionLifecycle persistence pattern:
 * in-memory cache + dirty tracking + debounced writes.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

import type { MemoryCategory, MemoryEntry, MemoryStoreFile } from 'types/memory.types';

import { MEMORY_PERSIST_DEBOUNCE_MS, MEMORY_STORE_VERSION } from 'config/constants';
import { getLogger } from 'output/logger';
import { getRuntimeDataDir } from 'utils/paths';

export class MemoryStore {
	private readonly cache: Map<MemoryCategory, MemoryStoreFile>;
	private readonly dirty: Set<MemoryCategory>;
	private readonly memoryDir: string;
	private readonly persistTimers: Map<MemoryCategory, ReturnType<typeof setTimeout>>;

	constructor(memoryDir?: string) {
		this.memoryDir = memoryDir ?? path.join(getRuntimeDataDir(), 'memory');
		this.cache = new Map();
		this.dirty = new Set();
		this.persistTimers = new Map();
	}

	appendEntry(category: MemoryCategory, entry: MemoryEntry): Promise<void> {
		const storeFile = this.load(category);
		storeFile.entries.push(entry);
		this.dirty.add(category);
		this.save(category);
		return Promise.resolve();
	}

	async flush(): Promise<void> {
		for (const [, timer] of this.persistTimers) {
			clearTimeout(timer);
		}
		this.persistTimers.clear();

		const categories: MemoryCategory[] = ['episodic', 'semantic', 'decisions'];
		for (const category of categories) {
			if (this.dirty.has(category)) {
				this.persistImmediate(category);
			}
		}
		// Yield to event loop after synchronous file writes, preserving async contract
		// for callers and ensuring written data is observable in subsequent microtasks.
		await Promise.resolve();
	}

	getEntries(category: MemoryCategory): Promise<MemoryEntry[]> {
		const storeFile = this.load(category);
		return Promise.resolve(storeFile.entries);
	}

	getMetadata(
		category: MemoryCategory
	): Promise<{ lastConsolidatedAt?: string; lastWrittenAt: string; version: number }> {
		const storeFile = this.load(category);
		return Promise.resolve({
			lastConsolidatedAt: storeFile.lastConsolidatedAt,
			lastWrittenAt: storeFile.lastWrittenAt,
			version: storeFile.version
		});
	}
	load(category: MemoryCategory): MemoryStoreFile {
		const cached = this.cache.get(category);
		if (cached !== undefined) {
			return cached;
		}

		mkdirSync(this.memoryDir, { recursive: true });

		const storePath = this.getStorePath(category);
		try {
			const raw = readFileSync(storePath, 'utf-8');
			const storeFile = JSON.parse(raw) as MemoryStoreFile;
			this.cache.set(category, storeFile);
			return storeFile;
		} catch (error) {
			const nodeError = error as NodeJS.ErrnoException;
			if (nodeError.code === 'ENOENT') {
				const empty = this.createEmptyStoreFile();
				this.cache.set(category, empty);
				return empty;
			}
			getLogger().warn(`Failed to load memory store for category '${category}': ${nodeError.message}`);
			const empty = this.createEmptyStoreFile();
			this.cache.set(category, empty);
			return empty;
		}
	}
	removeEntries(category: MemoryCategory, ids: Set<string>): Promise<number> {
		const storeFile = this.load(category);
		const originalLength = storeFile.entries.length;
		storeFile.entries = storeFile.entries.filter((e) => !ids.has(e.id));
		const removed = originalLength - storeFile.entries.length;
		if (removed > 0) {
			this.dirty.add(category);
			this.save(category, true);
		}
		return Promise.resolve(removed);
	}

	removeEntry(category: MemoryCategory, id: string): Promise<boolean> {
		const storeFile = this.load(category);
		const originalLength = storeFile.entries.length;
		storeFile.entries = storeFile.entries.filter((e) => e.id !== id);
		if (storeFile.entries.length !== originalLength) {
			this.dirty.add(category);
			this.save(category);
			return Promise.resolve(true);
		}
		return Promise.resolve(false);
	}

	save(category: MemoryCategory, immediate = false): void {
		this.dirty.add(category);

		const existing = this.persistTimers.get(category);
		if (existing !== undefined) {
			clearTimeout(existing);
			this.persistTimers.delete(category);
		}

		if (immediate) {
			this.persistImmediate(category);
			return;
		}

		const timer = setTimeout(() => {
			this.persistImmediate(category);
		}, MEMORY_PERSIST_DEBOUNCE_MS);
		this.persistTimers.set(category, timer);
	}

	setEntries(category: MemoryCategory, entries: MemoryEntry[]): Promise<void> {
		const storeFile = this.load(category);
		storeFile.entries = entries;
		this.dirty.add(category);
		this.save(category);
		return Promise.resolve();
	}

	setLastConsolidatedAt(timestamp: string): Promise<void> {
		const categories: MemoryCategory[] = ['episodic', 'semantic', 'decisions'];
		for (const category of categories) {
			const storeFile = this.load(category);
			storeFile.lastConsolidatedAt = timestamp;
			this.dirty.add(category);
			this.save(category);
		}
		return Promise.resolve();
	}

	updateEntry(category: MemoryCategory, id: string, patch: Partial<MemoryEntry>): Promise<boolean> {
		const storeFile = this.load(category);
		const entry = storeFile.entries.find((e) => e.id === id);
		if (entry === undefined) {
			return Promise.resolve(false);
		}
		Object.assign(entry, patch);
		this.dirty.add(category);
		this.save(category);
		return Promise.resolve(true);
	}

	private createEmptyStoreFile(): MemoryStoreFile {
		return {
			entries: [],
			lastWrittenAt: new Date().toISOString(),
			version: MEMORY_STORE_VERSION
		};
	}

	private getStorePath(category: MemoryCategory): string {
		return path.join(this.memoryDir, `${category}.json`);
	}

	private persistImmediate(category: MemoryCategory): void {
		if (!this.dirty.has(category)) {
			return;
		}

		const storeFile = this.cache.get(category) ?? this.createEmptyStoreFile();
		storeFile.lastWrittenAt = new Date().toISOString();

		const storePath = this.getStorePath(category);
		mkdirSync(this.memoryDir, { recursive: true });

		try {
			writeFileSync(storePath, JSON.stringify(storeFile, null, 2));
			this.dirty.delete(category);
		} catch (error) {
			getLogger().error(`Failed to persist memory store for category '${category}'`, error as Error);
			throw error;
		}
	}
}
