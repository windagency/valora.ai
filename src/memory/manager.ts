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
	MemoryQueryResult,
	MemoryStorePort
} from 'types/memory.types';

import {
	DEFAULT_MEMORY_DECISION_HALF_LIFE_DAYS,
	DEFAULT_MEMORY_EPISODIC_HALF_LIFE_DAYS,
	DEFAULT_MEMORY_ERROR_HALF_LIFE_MULTIPLIER,
	DEFAULT_MEMORY_PRUNE_THRESHOLD,
	DEFAULT_MEMORY_RECALL_SEED_K,
	DEFAULT_MEMORY_RECALL_WALK_DECAY,
	DEFAULT_MEMORY_RECALL_WALK_DEPTH,
	DEFAULT_MEMORY_RETRIEVAL_BOOST_DAYS,
	DEFAULT_MEMORY_SEMANTIC_HALF_LIFE_DAYS
} from 'config/constants';
import { generateMemoryId } from 'utils/id-generator';

import type { EmbedderPort } from './embeddings/embedder.port';
import type { MemoryStore } from './store';
import type { VaultIndex } from './vault/vault-index';

import { computeEffectiveHalfLife, computeStrength } from './decay';
import { openVectorStore, type VectorStore } from './embeddings/vector-store';
import { topKCosine } from './retrieval/cosine-ann';
import { spreadActivation } from './retrieval/spreading-activation';
import { VaultStore } from './vault/vault-store';

const ALL_CATEGORIES: MemoryCategory[] = ['episodic', 'semantic', 'decisions'];

export class MemoryManager {
	private readonly config: MemoryRetentionConfig;
	private readonly embedder?: EmbedderPort;
	private readonly store: MemoryStorePort;

	constructor(store: MemoryStore | MemoryStorePort, config?: Partial<MemoryRetentionConfig>, embedder?: EmbedderPort) {
		this.store = store;
		this.config = resolveConfig(config);
		this.embedder = embedder;
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
		const limit = options.limit ?? 50;
		const results = await this.recall(options, limit);
		await this.postProcess(results, options);
		return results;
	}

	async update(
		category: MemoryCategory,
		id: string,
		patch: Partial<Pick<MemoryEntry, 'confidence' | 'content' | 'relatedPaths' | 'tags'>>
	): Promise<boolean> {
		const now = new Date().toISOString();
		return this.store.updateEntry(category, id, { ...patch, updatedAt: now });
	}

	private buildSeeds(queryVec: Float32Array, vs: VectorStore, candidateIds: string[]): Map<string, number> {
		const seeds = new Map<string, number>();
		const k = this.config.recall?.seed_k ?? DEFAULT_MEMORY_RECALL_SEED_K;
		for (const { id, score } of topKCosine(queryVec, vs, candidateIds, k)) seeds.set(id, Math.max(0, score));
		if (seeds.size === 0) {
			for (const id of candidateIds) seeds.set(id, 1.0);
		}
		return seeds;
	}

	private collectCandidates(index: VaultIndex, options: MemoryQueryOptions, minStrength: number): string[] {
		const candidates: string[] = [];
		for (const [id, record] of index.byId) {
			const { entry } = record;
			const strength = computeStrength(entry.createdAt, entry.halfLifeDays);
			if (strength < minStrength) continue;
			if (options.agentRole !== undefined && entry.agentRole !== options.agentRole) continue;
			if (options.category !== undefined && entry.category !== options.category) continue;
			candidates.push(id);
		}
		return candidates;
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

	private async incrementCoAccess(results: MemoryQueryResult[]): Promise<void> {
		if (results.length < 2) return;
		for (let i = 0; i < results.length; i++) {
			for (let j = i + 1; j < results.length; j++) {
				const a = results[i]!.entry;
				const b = results[j]!.entry;
				const coA = { ...a.coAccess, [b.id]: (a.coAccess?.[b.id] ?? 0) + 1 };
				const coB = { ...b.coAccess, [a.id]: (b.coAccess?.[a.id] ?? 0) + 1 };
				await this.store.updateEntry(a.category, a.id, { coAccess: coA });
				await this.store.updateEntry(b.category, b.id, { coAccess: coB });
			}
		}
	}

	private async lexicalRecall(options: MemoryQueryOptions, limit: number): Promise<MemoryQueryResult[]> {
		const categories = options.category !== undefined ? [options.category] : ALL_CATEGORIES;
		const allResults: MemoryQueryResult[] = [];
		for (const category of categories) {
			const entries = await this.store.getEntries(category);
			for (const entry of entries) {
				const strength = computeStrength(entry.createdAt, entry.halfLifeDays);
				if (this.matchesQueryOptions(entry, options, strength)) allResults.push({ entry, strength });
			}
		}
		allResults.sort((a, b) => b.strength - a.strength);
		return allResults.slice(0, limit);
	}

	private async postProcess(results: MemoryQueryResult[], options: MemoryQueryOptions): Promise<void> {
		if (options.strengthen !== false) {
			for (const result of results) await this.strengthenEntry(result.entry.category, result.entry);
		}
		await this.incrementCoAccess(results);
	}

	private rankResults(scores: Map<string, number>, index: VaultIndex, limit: number): MemoryQueryResult[] {
		const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
		const results: MemoryQueryResult[] = [];
		for (const [id, score] of sorted) {
			const record = index.byId.get(id);
			if (!record) continue;
			results.push({ entry: record.entry, strength: score });
		}
		return results;
	}

	private async recall(options: MemoryQueryOptions, limit: number): Promise<MemoryQueryResult[]> {
		if (options.text && this.embedder && this.store instanceof VaultStore) {
			return this.vaultRecall(options, limit);
		}
		return this.lexicalRecall(options, limit);
	}

	private async vaultRecall(options: MemoryQueryOptions, limit: number): Promise<MemoryQueryResult[]> {
		const vaultStore = this.store as VaultStore;
		const index = await vaultStore.getVaultIndex();
		const embedResult = await this.embedder!.embed({ input: [options.text!] });
		const queryVec = new Float32Array(embedResult.vectors[0] ?? []);
		const vs = openVectorStore(vaultStore.getVaultDir(), embedResult.model, embedResult.dim);
		const minStrength = options.minStrength ?? DEFAULT_MEMORY_PRUNE_THRESHOLD;
		const candidateIds = this.collectCandidates(index, options, minStrength);
		const seeds = this.buildSeeds(queryVec, vs, candidateIds);
		const walkDepth = this.config.recall?.walk_depth ?? DEFAULT_MEMORY_RECALL_WALK_DEPTH;
		const walkDecay = this.config.recall?.walk_decay ?? DEFAULT_MEMORY_RECALL_WALK_DECAY;
		const scores = spreadActivation(seeds, index.byId, index.outEdges, index.inEdges, walkDepth, walkDecay);
		return this.rankResults(scores, index, limit);
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
		backend: 'vault',
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
