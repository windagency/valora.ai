/* eslint-disable no-unused-vars -- pure type declarations; param names are documentation */

/**
 * Canonical memory system type definitions.
 *
 * These are the single source of truth for memory types used by both the
 * Valora host and any memory plugin. The host's `src/types/memory.types.ts`
 * re-exports from this file. Pre-existing `Plugin*`-prefixed aliases below
 * preserve binary compatibility for plugins that imported them by their
 * earlier names.
 */

export type ConfidenceTier = 'inferred' | 'observed' | 'stale' | 'verified';

export interface ConsolidationOptions {
	/** When true, do not write any changes; report what would happen. */
	dryRun?: boolean;
	/** When true, skip merge/promote and only prune decayed entries. */
	pruneOnly?: boolean;
	/** ISO 8601 date override for the git-log invalidation window. */
	since?: string;
}

export interface ConsolidationResult {
	durationMs: number;
	gitInvalidated: number;
	merged: number;
	promoted: number;
	pruned: number;
	staleMarked: number;
}

export interface Edge {
	fromId: string;
	kind: EdgeKind;
	toId: string;
	weight?: number;
}

export type EdgeKind = 'co_accessed' | 'decays_from' | 'related' | 'supersedes';

export interface ExtractionContext {
	agentRole: string;
	command: string;
	phase?: string;
	sessionId: string;
}

export type MemoryCapability = 'consolidation' | 'embeddings' | 'extraction' | 'graph-edges' | 'reembed';

export type MemoryCategory = 'decisions' | 'episodic' | 'semantic';

export interface MemoryCreateOptions {
	agentRole: string;
	confidence: ConfidenceTier;
	content: string;
	halfLifeDays?: number;
	isError?: boolean;
	relatedPaths?: string[];
	sessionId: string;
	source: MemorySource;
	supersedes?: string;
	tags: string[];
}

/**
 * Minimal embedder shape required by `MemoryStorePort.semanticRecall`.
 * Structurally compatible with the in-package `EmbedderPort`.
 */
export interface MemoryEmbedder {
	embed(req: { input: string[]; model?: string }): Promise<{ dim: number; model: string; vectors: number[][] }>;
}

export interface MemoryEmbeddingConfig {
	batch_size?: number;
	dim?: number;
	model?: string;
	provider?: string;
}

export interface MemoryEntry {
	accessCount: number;
	agentRole: string;
	category: MemoryCategory;
	coAccess?: Record<string, number>;
	confidence: ConfidenceTier;
	content: string;
	contentHash?: string;
	createdAt: string;
	embeddingDim?: number;
	embeddingModel?: string;
	/**
	 * In-memory only marker (NOT persisted to frontmatter): set during parse when
	 * the file's `content_hash` does not match the actual body. Indicates the
	 * stored embedding was computed against an older content and must be
	 * regenerated before this entry contributes to cosine recall.
	 */
	embeddingStale?: boolean;
	halfLifeDays: number;
	id: string;
	isError: boolean;
	lastAccessedAt: string;
	relatedPaths: string[];
	sessionId: string;
	source: MemorySource;
	supersededBy?: string;
	supersedes?: string;
	tags: string[];
	updatedAt: string;
}

/**
 * The contract a memory backend implements. Core consumers (executor, CLI,
 * MCP shutdown) reach the active provider via `getMemoryRegistry().getActive()`
 * rather than instantiating a concrete store. Plugins satisfy this contract
 * (or its alias `MemoryProviderContract`) and register themselves via
 * `api.memory.register(name, ProviderClass, descriptor)`.
 *
 * Optional methods correspond to capabilities advertised in
 * {@link MemoryProviderDescriptor.capabilities}.
 */
export interface MemoryProvider {
	consolidate?(options?: ConsolidationOptions): Promise<ConsolidationResult>;
	create(category: MemoryCategory, options: MemoryCreateOptions): Promise<MemoryEntry>;
	delete(category: MemoryCategory, id: string): Promise<boolean>;
	extractFromAgentOutput?(output: string, ctx: ExtractionContext): Promise<MemoryEntry[]>;
	findByPaths(paths: string[]): Promise<MemoryQueryResult[]>;
	flush(): Promise<void>;
	get(category: MemoryCategory, id: string, strengthen?: boolean): Promise<MemoryQueryResult | null>;
	info(): Promise<MemoryProviderInfo>;
	invalidateByPaths(paths: string[]): Promise<number>;
	markStaleByPaths(paths: string[]): Promise<number>;
	prune(threshold?: number): Promise<number>;
	purge(criteria: PurgeCriteria): Promise<PurgeResult>;
	query(options: MemoryQueryOptions): Promise<MemoryQueryResult[]>;
	reembed?(options: ReembedOptions): Promise<ReembedReport>;
	update(category: MemoryCategory, id: string, patch: Partial<MemoryEntry>): Promise<boolean>;
	verify(): Promise<MemoryVerifyReport>;
}

export type MemoryProviderClass = new (config: Record<string, unknown>) => MemoryProvider;

/** Alias of `MemoryProvider` used by `api.memory.register` plugin contract. */
export type MemoryProviderContract = MemoryProvider;

export interface MemoryProviderDescriptor {
	capabilities: MemoryCapability[];
	description?: string;
	label: string;
}

export type MemoryProviderFactory = (config: Record<string, unknown>) => MemoryProvider;

export interface MemoryProviderInfo {
	capabilities: MemoryCapability[];
	counts: Record<MemoryCategory, number>;
	edgeCount?: number;
	/** Fraction of entries with up-to-date embeddings, in [0, 1]. */
	embeddingCoverage?: number;
	label: string;
	name: string;
	/** Provider-specific schema version (for diagnostics / migration prompts). */
	schemaVersion?: number | string;
}

export interface MemoryQueryOptions {
	agentRole?: string;
	category?: MemoryCategory;
	limit?: number;
	minStrength?: number;
	paths?: string[];
	strengthen?: boolean;
	tags?: string[];
	/** Free-text query for semantic (ANN) recall — used when an embedder is configured */
	text?: string;
	/**
	 * Optional token budget. When set, recall truncates results so the
	 * cumulative content size fits within the budget (using ~4 chars per
	 * token as the estimate).
	 */
	tokenBudget?: number;
}

export interface MemoryQueryResult {
	entry: MemoryEntry;
	/** Computed strength at query time: 0.5^(elapsed_days / halfLifeDays) */
	strength: number;
}

export interface MemoryRecallConfig {
	co_access_increment?: number;
	seed_k?: number;
	walk_decay?: number;
	walk_depth?: number;
}

/**
 * Tuning knobs the memory module reads. All fields optional — providers
 * supply their own defaults when missing.
 */
export interface MemoryRetentionConfig {
	backend?: 'json' | 'vault';
	decision_half_life_days?: number;
	embedding?: MemoryEmbeddingConfig;
	enabled?: boolean;
	episodic_half_life_days?: number;
	error_half_life_multiplier?: number;
	injection_strength_threshold?: number;
	injection_token_budget?: number;
	max_entries_per_store?: number;
	prune_threshold?: number;
	recall?: MemoryRecallConfig;
	retrieval_boost_days?: number;
	semantic_half_life_days?: number;
}

export interface MemorySource {
	command: string;
	label?: string;
	phase?: string;
}

export interface MemoryStoreFile {
	entries: MemoryEntry[];
	lastConsolidatedAt?: string;
	lastWrittenAt: string;
	version: number;
}

export interface MemoryStorePort {
	/** Add or replace an entry. `links` are graph edges; backends without graph support may ignore. */
	appendEntry(category: MemoryCategory, entry: MemoryEntry, links?: Edge[]): Promise<void>;
	flush(): Promise<void>;
	getEntries(category: MemoryCategory): Promise<MemoryEntry[]>;
	getMetadata(
		category: MemoryCategory
	): Promise<{ lastConsolidatedAt?: string; lastWrittenAt: string; version: number }>;
	removeEntries(category: MemoryCategory, ids: Set<string>): Promise<number>;
	removeEntry(category: MemoryCategory, id: string): Promise<boolean>;
	save(category: MemoryCategory, immediate?: boolean): void;
	/**
	 * Optional capability — embedding-driven recall with graph traversal.
	 * Returns `null` to signal "no usable seeds; use lexical fallback".
	 */
	semanticRecall?(
		options: MemoryQueryOptions,
		limit: number,
		embedder: MemoryEmbedder,
		recallConfig?: MemoryRecallConfig
	): Promise<MemoryQueryResult[] | null>;
	setEntries(category: MemoryCategory, entries: MemoryEntry[]): Promise<void>;
	setLastConsolidatedAt(timestamp: string): Promise<void>;
	updateEntry(category: MemoryCategory, id: string, patch: Partial<MemoryEntry>): Promise<boolean>;
}

export interface MemoryVerifyReport {
	counts: Record<MemoryCategory, number>;
	issues: string[];
	ok: boolean;
}

export interface PurgeCriteria {
	all?: boolean;
	categories?: MemoryCategory[];
	dryRun?: boolean;
	olderThanMs?: number;
}

export interface PurgeResult {
	dryRun: boolean;
	totalDeleted: number;
	totalWouldDelete: number;
}

export interface ReembedOptions {
	confirm?: boolean;
	dim?: number;
	model?: string;
}

export interface ReembedReport {
	durationMs: number;
	failed: number;
	processed: number;
}

// ── Back-compat aliases (the older Plugin*-prefixed names) ────────────────
// Plugins authored against the prefixed names continue to work without
// changes; new code should prefer the unprefixed canonical types above.

export type PluginConfidenceTier = ConfidenceTier;
export type PluginConsolidationOptions = ConsolidationOptions;
export type PluginConsolidationResult = ConsolidationResult;
export type PluginExtractionContext = ExtractionContext;
export type PluginMemoryCapability = MemoryCapability;
export type PluginMemoryCategory = MemoryCategory;
export type PluginMemoryCreateOptions = MemoryCreateOptions;
export type PluginMemoryEntry = MemoryEntry;
export type PluginMemoryProviderInfo = MemoryProviderInfo;
export type PluginMemoryQueryOptions = MemoryQueryOptions;
export type PluginMemoryQueryResult = MemoryQueryResult;
export type PluginMemorySource = MemorySource;
export type PluginMemoryVerifyReport = MemoryVerifyReport;
export type PluginPurgeCriteria = PurgeCriteria;
export type PluginPurgeResult = PurgeResult;
export type PluginReembedOptions = ReembedOptions;
export type PluginReembedReport = ReembedReport;
