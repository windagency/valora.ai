/**
 * Ephemeral in-memory provider — the built-in fallback when no persistent
 * memory plugin (e.g. `valora-plugin-memory-vault`) is installed.
 *
 * All entries are held in a plain `Map` and are lost when the process exits.
 * A warning is logged on construction so operators are aware that persistence
 * is absent.
 */

import type {
	MemoryCapability,
	MemoryCategory,
	MemoryCreateOptions,
	MemoryEntry,
	MemoryProvider,
	MemoryProviderInfo,
	MemoryQueryOptions,
	MemoryQueryResult,
	MemoryVerifyReport,
	PurgeCriteria,
	PurgeResult
} from 'types/memory.types';

import { getLogger } from 'output/logger';
import { generateMemoryId } from 'utils/id-generator';

const CATEGORIES: MemoryCategory[] = ['decisions', 'episodic', 'semantic'];
const CAPABILITIES: MemoryCapability[] = [];

type CategoryStore = Map<string, MemoryEntry>;

export class EphemeralMemoryProvider implements MemoryProvider {
	private readonly store: Map<MemoryCategory, CategoryStore>;

	constructor() {
		this.store = new Map<MemoryCategory, CategoryStore>(CATEGORIES.map((c) => [c, new Map<string, MemoryEntry>()]));
		getLogger().warn(
			'Using ephemeral memory — entries will not persist across sessions. Install valora-plugin-memory-vault for persistence.'
		);
	}

	create(category: MemoryCategory, options: MemoryCreateOptions): Promise<MemoryEntry> {
		const now = new Date().toISOString();
		const entry: MemoryEntry = {
			accessCount: 0,
			agentRole: options.agentRole,
			category,
			confidence: options.confidence,
			content: options.content,
			createdAt: now,
			halfLifeDays: 30,
			id: generateMemoryId(),
			isError: options.isError ?? false,
			lastAccessedAt: now,
			relatedPaths: options.relatedPaths ?? [],
			sessionId: options.sessionId,
			source: options.source,
			supersedes: options.supersedes,
			tags: options.tags,
			updatedAt: now
		};
		this.store.get(category)!.set(entry.id, entry);
		return Promise.resolve(entry);
	}

	delete(category: MemoryCategory, id: string): Promise<boolean> {
		return Promise.resolve(this.store.get(category)!.delete(id));
	}

	findByPaths(paths: string[]): Promise<MemoryQueryResult[]> {
		const pathSet = new Set(paths);
		const results: MemoryQueryResult[] = [];
		for (const map of this.store.values()) {
			for (const entry of map.values()) {
				if (entry.relatedPaths.some((p) => pathSet.has(p))) {
					results.push({ entry, strength: 1.0 });
				}
			}
		}
		return Promise.resolve(results);
	}

	flush(): Promise<void> {
		return Promise.resolve();
	}

	get(category: MemoryCategory, id: string, _strengthen?: boolean): Promise<MemoryQueryResult | null> {
		const entry = this.store.get(category)!.get(id);
		return Promise.resolve(entry ? { entry, strength: 1.0 } : null);
	}

	info(): Promise<MemoryProviderInfo> {
		const counts = Object.fromEntries(CATEGORIES.map((c) => [c, this.store.get(c)!.size])) as Record<
			MemoryCategory,
			number
		>;
		return Promise.resolve({ capabilities: CAPABILITIES, counts, label: 'Ephemeral (in-memory)', name: 'ephemeral' });
	}

	invalidateByPaths(_paths: string[]): Promise<number> {
		return Promise.resolve(0);
	}

	markStaleByPaths(_paths: string[]): Promise<number> {
		return Promise.resolve(0);
	}

	prune(_threshold?: number): Promise<number> {
		return Promise.resolve(0);
	}

	purge(criteria: PurgeCriteria): Promise<PurgeResult> {
		const targets = criteria.categories ?? CATEGORIES;
		let count = 0;
		for (const cat of targets) {
			count += this.store.get(cat)!.size;
		}
		if (!criteria.dryRun) {
			for (const cat of targets) {
				this.store.get(cat)!.clear();
			}
		}
		return Promise.resolve({
			dryRun: criteria.dryRun ?? false,
			totalDeleted: criteria.dryRun ? 0 : count,
			totalWouldDelete: count
		});
	}

	query(options: MemoryQueryOptions): Promise<MemoryQueryResult[]> {
		const maps = options.category ? [this.store.get(options.category)!] : [...this.store.values()];

		let results: MemoryQueryResult[] = [];
		for (const map of maps) {
			for (const entry of map.values()) {
				if (options.agentRole && entry.agentRole !== options.agentRole) continue;
				if (options.tags?.length && !options.tags.some((t) => entry.tags.includes(t))) continue;
				results.push({ entry, strength: 1.0 });
			}
		}

		if (options.limit !== undefined) {
			results = results.slice(0, options.limit);
		}
		return Promise.resolve(results);
	}

	update(category: MemoryCategory, id: string, patch: Partial<MemoryEntry>): Promise<boolean> {
		const map = this.store.get(category)!;
		const existing = map.get(id);
		if (!existing) return Promise.resolve(false);
		map.set(id, { ...existing, ...patch, updatedAt: new Date().toISOString() });
		return Promise.resolve(true);
	}

	verify(): Promise<MemoryVerifyReport> {
		const counts = Object.fromEntries(CATEGORIES.map((c) => [c, this.store.get(c)!.size])) as Record<
			MemoryCategory,
			number
		>;
		return Promise.resolve({ counts, issues: [], ok: true });
	}
}
