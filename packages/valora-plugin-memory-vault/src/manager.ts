/**
 * Memory Manager — CRUD, decay computation, queries, and retrieval strengthening.
 *
 * Provides the public API for the memory system. All reads compute decay on
 * the fly; retrievals strengthen entries by extending their half-life.
 */

import type {
	MemoryCategory,
	MemoryCreateOptions,
	MemoryEntry,
	MemoryQueryOptions,
	MemoryQueryResult,
	MemoryRetentionConfig,
	MemoryStorePort,
	PurgeCriteria,
	PurgeResult
} from '@windagency/valora-plugin-api';

import { generateMemoryId } from '@windagency/valora-runtime';

import type { EmbedderPort } from './embeddings/embedder.port.js';
import type { MemoryStore } from './store.js';

import {
	DEFAULT_MEMORY_DECISION_HALF_LIFE_DAYS,
	DEFAULT_MEMORY_EPISODIC_HALF_LIFE_DAYS,
	DEFAULT_MEMORY_ERROR_HALF_LIFE_MULTIPLIER,
	DEFAULT_MEMORY_PRUNE_THRESHOLD,
	DEFAULT_MEMORY_RETRIEVAL_BOOST_DAYS,
	DEFAULT_MEMORY_SEMANTIC_HALF_LIFE_DAYS,
	MEMORY_HALF_LIFE_CAP_MULTIPLIER
} from './constants.js';
import { computeEffectiveHalfLife, computeStrength } from './decay.js';
import { signProvenance } from './vault/provenance.js';

export type { PurgeCriteria, PurgeResult };

const ALL_CATEGORIES: MemoryCategory[] = ['episodic', 'semantic', 'decisions'];

export class MemoryManager {
	private readonly config: MemoryRetentionConfig;
	private embedder?: EmbedderPort;
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

		entry.provenanceSignature = signProvenance(entry.content, entry.agentRole, entry.createdAt);

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
		// Defense-in-depth against provenance laundering: promoting stamps a
		// fresh, valid signature on whatever content is given, so an entry that
		// failed verification must never reach this path — even if some future
		// caller forgets to pre-filter by `trusted`.
		if (episodicEntry.trusted === false) {
			throw new Error(`Refusing to promote untrusted entry (failed provenance verification): ${episodicId}`);
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

		// Mark the source episodic stale and record the cross-category
		// supersession. `create()` above only handles same-category cases.
		await this.store.updateEntry('episodic', episodicId, {
			confidence: 'stale',
			supersededBy: newEntry.id
		});

		// Persist the supersedes wikilink/edge via the port. Backends with
		// graph support (vault) overwrite the entry's file with the new
		// supersedes field set and store the outbound edge for audit traversal.
		// Backends without graph support safely ignore the `links` argument;
		// the `appendEntry` contract is idempotent on entry id, so the second
		// call replaces the first instead of duplicating. The supersedes edge
		// is one-way authorial intent and is intentionally not traversed by
		// spreading activation (see TRAVERSAL_KINDS in retrieval/spreading-activation.ts).
		const supersededEntry = { ...newEntry, supersedes: episodicId };
		await this.store.appendEntry('semantic', supersededEntry, [
			{ fromId: newEntry.id, kind: 'supersedes', toId: episodicId }
		]);

		return supersededEntry;
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

	async purge(criteria: PurgeCriteria): Promise<PurgeResult> {
		const { all, categories, dryRun, olderThanMs } = criteria;

		if (all !== true && categories === undefined && olderThanMs === undefined) {
			throw new Error(
				'purge requires explicit criteria: pass `all: true`, supply a `categories` array, or set `olderThanMs` to avoid accidentally deleting every memory.'
			);
		}

		const targetCategories: MemoryCategory[] = all === true ? [...ALL_CATEGORIES] : (categories ?? [...ALL_CATEGORIES]);

		let totalDeleted = 0;
		let totalWouldDelete = 0;

		for (const category of targetCategories) {
			const idsToRemove = await this.collectPurgeIds(category, olderThanMs);
			if (dryRun) {
				totalWouldDelete += idsToRemove.size;
			} else {
				totalDeleted += await this.store.removeEntries(category, idsToRemove);
			}
		}

		return { dryRun: dryRun ?? false, totalDeleted, totalWouldDelete };
	}

	async query(options: MemoryQueryOptions): Promise<MemoryQueryResult[]> {
		const limit = options.limit ?? 50;
		const recalled = await this.recall(options, limit);
		const results = applyTokenBudget(recalled, options.tokenBudget);
		await this.postProcess(results, options);
		return results;
	}

	/**
	 * Late-bind an embedder so consumers (e.g. the bundled provider) can
	 * resolve it asynchronously after construction. Calling with `undefined`
	 * clears it and reverts subsequent queries to lexical recall.
	 */
	setEmbedder(embedder: EmbedderPort | undefined): void {
		this.embedder = embedder;
	}

	async update(
		category: MemoryCategory,
		id: string,
		patch: Partial<Pick<MemoryEntry, 'confidence' | 'content' | 'relatedPaths' | 'tags'>>
	): Promise<boolean> {
		const now = new Date().toISOString();
		return this.store.updateEntry(category, id, { ...patch, updatedAt: now });
	}

	private async collectPurgeIds(category: MemoryCategory, olderThanMs: number | undefined): Promise<Set<string>> {
		const entries = await this.store.getEntries(category);
		const ids = new Set<string>();
		for (const entry of entries) {
			if (olderThanMs !== undefined) {
				const ageMs = Date.now() - new Date(entry.createdAt).getTime();
				if (ageMs < olderThanMs) continue;
			}
			ids.add(entry.id);
		}
		return ids;
	}

	private getDefaultHalfLife(category: MemoryCategory): number {
		const lookup: Record<MemoryCategory, number> = {
			decisions: this.config.decision_half_life_days ?? DEFAULT_MEMORY_DECISION_HALF_LIFE_DAYS,
			episodic: this.config.episodic_half_life_days ?? DEFAULT_MEMORY_EPISODIC_HALF_LIFE_DAYS,
			semantic: this.config.semantic_half_life_days ?? DEFAULT_MEMORY_SEMANTIC_HALF_LIFE_DAYS
		};
		return lookup[category];
	}

	private async incrementCoAccess(results: MemoryQueryResult[]): Promise<void> {
		if (results.length < 2) return;

		// Accumulate per-entry deltas in a single in-memory pass. The pair loop
		// is still O(N²) but every disk write is deferred so we end up with at
		// most one write per affected entry (O(N), not O(N²)). Batching also
		// closes the lost-update window where the read-modify-write loop holds
		// stale entry references after the underlying store has rewritten the
		// record.
		const deltas = new Map<string, Record<string, number>>();
		for (let i = 0; i < results.length; i++) {
			for (let j = i + 1; j < results.length; j++) {
				const a = results[i]!.entry;
				const b = results[j]!.entry;
				bumpDelta(deltas, a.id, b.id);
				bumpDelta(deltas, b.id, a.id);
			}
		}

		for (const result of results) {
			const delta = deltas.get(result.entry.id);
			if (!delta) continue;
			const merged: Record<string, number> = { ...result.entry.coAccess };
			for (const [peerId, count] of Object.entries(delta)) {
				merged[peerId] = (merged[peerId] ?? 0) + count;
			}
			await this.store.updateEntry(result.entry.category, result.entry.id, { coAccess: merged });
		}
	}

	private async lexicalRecall(options: MemoryQueryOptions, limit: number): Promise<MemoryQueryResult[]> {
		const categories = options.category !== undefined ? [options.category] : ALL_CATEGORIES;
		const allResults: MemoryQueryResult[] = [];
		for (const category of categories) {
			// Clone the array so callers cannot mutate the store's internal cache.
			const entries = [...(await this.store.getEntries(category))];
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

	private async recall(options: MemoryQueryOptions, limit: number): Promise<MemoryQueryResult[]> {
		// Dispatch via the port: backends that advertise `semanticRecall`
		// (e.g. vault) own the embedding-driven graph traversal; backends
		// that do not fall through to lexical retrieval. A null return from
		// semanticRecall signals "no usable seeds — fall back to lexical".
		if (options.text && this.embedder && this.store.semanticRecall) {
			const semantic = await this.store.semanticRecall(options, limit, this.embedder, this.config.recall);
			if (semantic !== null) return semantic;
		}
		return this.lexicalRecall(options, limit);
	}

	/** Returns true when the entry has at least one of the requested paths (or no filter is set). */
	private hasPathMatch(entry: MemoryEntry, paths?: string[]): boolean {
		return paths === undefined || paths.length === 0 || paths.some((p) => entry.relatedPaths.includes(p));
	}

	/** Returns true when the entry has at least one tag from the filter list (or no filter is set). */
	private hasTagMatch(entry: MemoryEntry, tags?: string[]): boolean {
		return tags === undefined || tags.length === 0 || tags.some((t) => entry.tags.includes(t));
	}

	private matchesQueryOptions(entry: MemoryEntry, options: MemoryQueryOptions, strength: number): boolean {
		if (entry.confidence === 'stale') return false;
		// Excluded from recall/injection: signature verification failed, meaning
		// this entry did not originate from create() (hand-edited or externally
		// injected). `trusted === undefined` (legacy/unsigned) is not excluded.
		if (entry.trusted === false) return false;
		const minStrength = options.minStrength ?? DEFAULT_MEMORY_PRUNE_THRESHOLD;
		if (strength < minStrength) return false;
		if (!this.hasTagMatch(entry, options.tags)) return false;
		if (!this.hasPathMatch(entry, options.paths)) return false;
		if (options.agentRole !== undefined && entry.agentRole !== options.agentRole) return false;
		return true;
	}

	private async strengthenEntry(category: MemoryCategory, entry: MemoryEntry): Promise<void> {
		const retrievalBoostDays = this.config.retrieval_boost_days ?? DEFAULT_MEMORY_RETRIEVAL_BOOST_DAYS;
		const cap = this.getDefaultHalfLife(category) * MEMORY_HALF_LIFE_CAP_MULTIPLIER;
		const accessCount = entry.accessCount + 1;
		// Heavily-queried memories would otherwise grow their half-life
		// without bound — capping at MULT × the category default keeps decay
		// meaningful even for hot entries.
		const halfLifeDays = Math.min(cap, entry.halfLifeDays + retrievalBoostDays);
		const lastAccessedAt = new Date().toISOString();

		entry.accessCount = accessCount;
		entry.halfLifeDays = halfLifeDays;
		entry.lastAccessedAt = lastAccessedAt;

		await this.store.updateEntry(category, entry.id, { accessCount, halfLifeDays, lastAccessedAt });
	}
}

const TOKEN_ESTIMATE_CHARS = 4;

/**
 * Truncate `results` so the cumulative content size fits within `tokenBudget`.
 * Returns the input unchanged when no budget is set (tokenBudget undefined or
 * non-positive). Estimation uses ~4 characters per token, matching the
 * convention in `memory-formatter.ts` so both layers agree on the cost model.
 */
function applyTokenBudget(results: MemoryQueryResult[], tokenBudget?: number): MemoryQueryResult[] {
	if (tokenBudget === undefined || tokenBudget <= 0) return results;

	const charBudget = tokenBudget * TOKEN_ESTIMATE_CHARS;
	const fitted: MemoryQueryResult[] = [];
	let used = 0;

	for (const result of results) {
		const cost = result.entry.content.length;
		if (used + cost > charBudget && fitted.length > 0) break; // always include at least one
		used += cost;
		fitted.push(result);
	}

	return fitted;
}

function bumpDelta(deltas: Map<string, Record<string, number>>, fromId: string, toId: string): void {
	const existing = deltas.get(fromId) ?? {};
	existing[toId] = (existing[toId] ?? 0) + 1;
	deltas.set(fromId, existing);
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
