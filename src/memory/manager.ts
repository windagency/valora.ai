/**
 * Memory Manager — CRUD, decay computation, queries, and retrieval strengthening.
 *
 * Provides the public API for the memory system. All reads compute decay on
 * the fly; retrievals strengthen entries by extending their half-life.
 */

import type { MemoryRetentionConfig } from 'config/schema';
import type {
	MemoryCategory,
	MemoryCreateOptions,
	MemoryEntry,
	MemoryQueryOptions,
	MemoryQueryResult
} from 'types/memory.types';

import {
	DEFAULT_MEMORY_DECISION_HALF_LIFE_DAYS,
	DEFAULT_MEMORY_EPISODIC_HALF_LIFE_DAYS,
	DEFAULT_MEMORY_ERROR_HALF_LIFE_MULTIPLIER,
	DEFAULT_MEMORY_PRUNE_THRESHOLD,
	DEFAULT_MEMORY_RETRIEVAL_BOOST_DAYS,
	DEFAULT_MEMORY_SEMANTIC_HALF_LIFE_DAYS
} from 'config/constants';
import { generateMemoryId } from 'utils/id-generator';

import type { MemoryStore } from './store';

import { computeEffectiveHalfLife, computeStrength } from './decay';

const ALL_CATEGORIES: MemoryCategory[] = ['episodic', 'semantic', 'decisions'];

export class MemoryManager {
	private readonly config: MemoryRetentionConfig;
	private readonly store: MemoryStore;

	constructor(store: MemoryStore, config?: Partial<MemoryRetentionConfig>) {
		this.store = store;
		this.config = resolveConfig(config);
	}

	async create(category: MemoryCategory, options: MemoryCreateOptions): Promise<MemoryEntry> {
		const id = generateMemoryId();
		const now = new Date().toISOString();

		const retrievalBoostDays = this.config.retrieval_boost_days ?? DEFAULT_MEMORY_RETRIEVAL_BOOST_DAYS;
		const errorMultiplier = this.config.error_half_life_multiplier ?? DEFAULT_MEMORY_ERROR_HALF_LIFE_MULTIPLIER;
		const defaultHalfLife = this.getDefaultHalfLife(category);

		let halfLifeDays = computeEffectiveHalfLife(
			defaultHalfLife,
			0,
			options.isError ?? false,
			retrievalBoostDays,
			errorMultiplier
		);

		if (options.halfLifeDays !== undefined) {
			halfLifeDays = options.halfLifeDays;
		}

		const entry: MemoryEntry = {
			accessCount: 0,
			agentRole: options.agentRole,
			category,
			confidence: options.confidence,
			content: options.content,
			createdAt: now,
			halfLifeDays,
			id,
			isError: options.isError ?? false,
			lastAccessedAt: now,
			relatedPaths: options.relatedPaths ?? [],
			sessionId: options.sessionId,
			source: options.source,
			tags: options.tags,
			updatedAt: now
		};

		if (options.supersedes !== undefined) {
			entry.supersedes = options.supersedes;
			await this.store.updateEntry(category, options.supersedes, {
				confidence: 'stale',
				supersededBy: id
			});
		}

		await this.store.appendEntry(category, entry);
		return entry;
	}

	async delete(category: MemoryCategory, id: string): Promise<boolean> {
		return this.store.removeEntry(category, id);
	}

	async findByPaths(paths: string[]): Promise<MemoryQueryResult[]> {
		const results: MemoryQueryResult[] = [];

		for (const category of ALL_CATEGORIES) {
			const entries = await this.store.getEntries(category);
			for (const entry of entries) {
				const hasOverlap = paths.some((p) => entry.relatedPaths.includes(p));
				if (hasOverlap) {
					const strength = computeStrength(entry.createdAt, entry.halfLifeDays);
					results.push({ entry, strength });
				}
			}
		}

		return results;
	}

	async flush(): Promise<void> {
		return this.store.flush();
	}

	async get(category: MemoryCategory, id: string, strengthen = true): Promise<MemoryQueryResult | null> {
		const entries = await this.store.getEntries(category);
		const entry = entries.find((e) => e.id === id);
		if (entry === undefined) {
			return null;
		}

		const strength = computeStrength(entry.createdAt, entry.halfLifeDays);

		if (strengthen) {
			await this.strengthenEntry(category, entry);
		}

		return { entry, strength };
	}

	async invalidateByPaths(changedPaths: string[]): Promise<number> {
		let count = 0;

		for (const category of ALL_CATEGORIES) {
			const entries = await this.store.getEntries(category);
			for (const entry of entries) {
				const hasOverlap = changedPaths.some((p) => entry.relatedPaths.includes(p));
				if (hasOverlap) {
					const newHalfLife = Math.max(1, entry.halfLifeDays / 2);
					await this.store.updateEntry(category, entry.id, { halfLifeDays: newHalfLife });
					count++;
				}
			}
		}

		return count;
	}

	async markStaleByPaths(paths: string[]): Promise<number> {
		let count = 0;

		for (const category of ALL_CATEGORIES) {
			const entries = await this.store.getEntries(category);
			for (const entry of entries) {
				const hasOverlap = paths.some((p) => entry.relatedPaths.includes(p));
				if (hasOverlap) {
					await this.store.updateEntry(category, entry.id, { confidence: 'stale' });
					count++;
				}
			}
		}

		return count;
	}

	async promote(episodicId: string, semanticContent: string, tags?: string[]): Promise<MemoryEntry> {
		const entries = await this.store.getEntries('episodic');
		const episodicEntry = entries.find((e) => e.id === episodicId);
		if (episodicEntry === undefined) {
			throw new Error(`Episodic entry not found: ${episodicId}`);
		}

		const mergedTags = tags !== undefined ? [...new Set([...episodicEntry.tags, ...tags])] : episodicEntry.tags;

		const newEntry = await this.create('semantic', {
			agentRole: episodicEntry.agentRole,
			confidence: episodicEntry.confidence,
			content: semanticContent,
			relatedPaths: episodicEntry.relatedPaths,
			sessionId: episodicEntry.sessionId,
			source: episodicEntry.source,
			tags: mergedTags
		});

		await this.store.updateEntry('episodic', episodicId, {
			confidence: 'stale',
			supersededBy: newEntry.id
		});

		return newEntry;
	}

	async prune(): Promise<number> {
		let total = 0;
		for (const category of ALL_CATEGORIES) {
			total += await this.pruneCategory(category);
		}
		return total;
	}

	async pruneCategory(category: MemoryCategory): Promise<number> {
		const pruneThreshold = this.config.prune_threshold ?? DEFAULT_MEMORY_PRUNE_THRESHOLD;
		const entries = await this.store.getEntries(category);

		const idsToRemove = new Set<string>();
		for (const entry of entries) {
			const strength = computeStrength(entry.createdAt, entry.halfLifeDays);
			if (strength < pruneThreshold) {
				idsToRemove.add(entry.id);
			}
		}

		return this.store.removeEntries(category, idsToRemove);
	}

	async query(options: MemoryQueryOptions): Promise<MemoryQueryResult[]> {
		const categories = options.category !== undefined ? [options.category] : ALL_CATEGORIES;
		const limit = options.limit ?? 50;
		const allResults: MemoryQueryResult[] = [];

		for (const category of categories) {
			const entries = await this.store.getEntries(category);
			for (const entry of entries) {
				const strength = computeStrength(entry.createdAt, entry.halfLifeDays);
				if (this.matchesQueryOptions(entry, options, strength)) {
					allResults.push({ entry, strength });
				}
			}
		}

		allResults.sort((a, b) => b.strength - a.strength);
		const limited = allResults.slice(0, limit);

		if (options.strengthen !== false) {
			for (const result of limited) {
				await this.strengthenEntry(result.entry.category, result.entry);
			}
		}

		return limited;
	}

	async update(
		category: MemoryCategory,
		id: string,
		patch: Partial<Pick<MemoryEntry, 'confidence' | 'content' | 'relatedPaths' | 'tags'>>
	): Promise<boolean> {
		const now = new Date().toISOString();
		return this.store.updateEntry(category, id, { ...patch, updatedAt: now });
	}

	private getDefaultHalfLife(category: MemoryCategory): number {
		switch (category) {
			case 'decisions':
				return this.config.decision_half_life_days ?? DEFAULT_MEMORY_DECISION_HALF_LIFE_DAYS;
			case 'episodic':
				return this.config.episodic_half_life_days ?? DEFAULT_MEMORY_EPISODIC_HALF_LIFE_DAYS;
			case 'semantic':
				return this.config.semantic_half_life_days ?? DEFAULT_MEMORY_SEMANTIC_HALF_LIFE_DAYS;
		}
	}

	/** Returns true when the entry has at least one tag from the filter list (or no filter is set). */
	private hasPathMatch(entry: MemoryEntry, paths?: string[]): boolean {
		return paths === undefined || paths.length === 0 || paths.some((p) => entry.relatedPaths.includes(p));
	}

	/** Returns true when the entry has at least one of the requested paths (or no filter is set). */
	private hasTagMatch(entry: MemoryEntry, tags?: string[]): boolean {
		return tags === undefined || tags.length === 0 || tags.some((t) => entry.tags.includes(t));
	}

	private matchesQueryOptions(entry: MemoryEntry, options: MemoryQueryOptions, strength: number): boolean {
		const minStrength = options.minStrength ?? DEFAULT_MEMORY_PRUNE_THRESHOLD;
		if (strength < minStrength) return false;
		if (!this.hasTagMatch(entry, options.tags)) return false;
		if (!this.hasPathMatch(entry, options.paths)) return false;
		if (options.agentRole !== undefined && entry.agentRole !== options.agentRole) return false;
		return true;
	}

	private async strengthenEntry(category: MemoryCategory, entry: MemoryEntry): Promise<void> {
		const retrievalBoostDays = this.config.retrieval_boost_days ?? DEFAULT_MEMORY_RETRIEVAL_BOOST_DAYS;
		const accessCount = entry.accessCount + 1;
		const halfLifeDays = entry.halfLifeDays + retrievalBoostDays;
		const lastAccessedAt = new Date().toISOString();

		entry.accessCount = accessCount;
		entry.halfLifeDays = halfLifeDays;
		entry.lastAccessedAt = lastAccessedAt;

		await this.store.updateEntry(category, entry.id, { accessCount, halfLifeDays, lastAccessedAt });
	}
}

function resolveConfig(config?: Partial<MemoryRetentionConfig>): MemoryRetentionConfig {
	const defaults: MemoryRetentionConfig = {
		decision_half_life_days: DEFAULT_MEMORY_DECISION_HALF_LIFE_DAYS,
		enabled: true,
		episodic_half_life_days: DEFAULT_MEMORY_EPISODIC_HALF_LIFE_DAYS,
		error_half_life_multiplier: DEFAULT_MEMORY_ERROR_HALF_LIFE_MULTIPLIER,
		injection_strength_threshold: 0.2,
		injection_token_budget: 2000,
		max_entries_per_store: 500,
		prune_threshold: DEFAULT_MEMORY_PRUNE_THRESHOLD,
		retrieval_boost_days: DEFAULT_MEMORY_RETRIEVAL_BOOST_DAYS,
		semantic_half_life_days: DEFAULT_MEMORY_SEMANTIC_HALF_LIFE_DAYS
	};
	return config === undefined ? defaults : { ...defaults, ...config };
}
