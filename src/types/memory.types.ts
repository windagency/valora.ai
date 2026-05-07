/**
 * Memory system type definitions.
 *
 * Biologically inspired memory with decay, retrieval strengthening,
 * consolidation, and git-based invalidation.
 */

export type ConfidenceTier = 'inferred' | 'observed' | 'stale' | 'verified';
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

export type MemoryCategory = 'decisions' | 'episodic' | 'semantic';

export interface MemoryCreateOptions {
	agentRole: string;
	confidence: ConfidenceTier;
	content: string;
	isError?: boolean;
	relatedPaths?: string[];
	sessionId: string;
	source: MemorySource;
	supersedes?: string;
	tags: string[];
	/** Override the default half-life for this category */
	halfLifeDays?: number;
}

export interface MemoryEntry {
	/** Unique identifier: mem-{nanoid(12)} */
	id: string;
	/** Memory store category */
	category: MemoryCategory;
	/** The memory content (free-form text, may be markdown) */
	content: string;
	/** Searchable tags (lowercase, kebab-case) */
	tags: string[];
	/** What generated this memory */
	source: MemorySource;
	/** Confidence in this memory's accuracy */
	confidence: ConfidenceTier;
	/**
	 * Effective half-life in days. Updated on each retrieval (+=retrievalBoostDays).
	 * Used directly in decay computation: strength = 0.5^(elapsed_days / halfLifeDays).
	 */
	halfLifeDays: number;
	/** ISO 8601 creation timestamp */
	createdAt: string;
	/** ISO 8601 last-accessed timestamp */
	lastAccessedAt: string;
	/** ISO 8601 last-updated timestamp */
	updatedAt: string;
	/** Number of times this entry has been retrieved */
	accessCount: number;
	/** The agent role that produced this memory (e.g. 'lead', 'qa') */
	agentRole: string;
	/** Session ID that created this entry */
	sessionId: string;
	/** Repo-relative file paths this memory relates to (for git invalidation) */
	relatedPaths: string[];
	/** ID of the memory entry this one supersedes */
	supersedes?: string;
	/** ID of the memory entry that supersedes this one */
	supersededBy?: string;
	/** Whether this memory originated from an error (gets errorHalfLifeMultiplier × halfLife) */
	isError: boolean;
	/** SHA-256 hash of content — used to detect stale embeddings */
	contentHash?: string;
	/** Embedding model used to produce the stored vector (e.g. 'nomic-embed-text') */
	embeddingModel?: string;
	/** Dimension of the stored embedding vector */
	embeddingDim?: number;
	/**
	 * In-memory only marker (NOT persisted to frontmatter): set during parse when
	 * the file's `content_hash` does not match the actual body. Indicates the
	 * stored embedding was computed against an older content and must be
	 * regenerated before this entry contributes to cosine recall. Typically
	 * triggered by a user editing the memory's body in Obsidian outside Valora.
	 */
	embeddingStale?: boolean;
	/** Hebbian co-access counts: maps co-retrieved memory ID to retrieval-pair count */
	coAccess?: Record<string, number>;
}

export interface MemoryQueryOptions {
	/** Filter by tags (OR logic — entry must have at least one matching tag) */
	tags?: string[];
	/** Filter by related file paths (OR logic) */
	paths?: string[];
	/** Minimum computed strength threshold (0-1, default 0.1) */
	minStrength?: number;
	/** Filter by category */
	category?: MemoryCategory;
	/** Filter by agent role */
	agentRole?: string;
	/** Maximum number of results (default 50) */
	limit?: number;
	/** Whether to strengthen (update access metadata) on retrieval (default true) */
	strengthen?: boolean;
	/** Free-text query for semantic (ANN) recall — used when an EmbedderPort is configured */
	text?: string;
	/**
	 * Optional token budget. When set, the recall path truncates results so
	 * the cumulative content size fits within the budget (using ~4 chars per
	 * token as the estimate). ADR-013 §5 step 4: budget is applied inside the
	 * recall path so callers never receive results that would overflow context.
	 */
	tokenBudget?: number;
}

export interface MemoryQueryResult {
	entry: MemoryEntry;
	/** Computed strength at query time: 0.5^(elapsed_days / halfLifeDays) */
	strength: number;
}

export interface MemorySource {
	/** The Valora command that was executing (e.g. 'implement', 'review-code') */
	command: string;
	/** The pipeline phase/stage (e.g. 'assert', 'plan') */
	phase?: string;
	/** Free-form label (e.g. 'lint-error', 'test-failure', 'architecture-choice') */
	label?: string;
}

export interface MemoryStoreFile {
	/** Schema version for forward-compatible migration */
	version: number;
	/** ISO 8601 timestamp of last write */
	lastWrittenAt: string;
	/** ISO 8601 timestamp of last consolidation (used for git log --since) */
	lastConsolidatedAt?: string;
	/** The memory entries */
	entries: MemoryEntry[];
}

export interface MemoryStorePort {
	appendEntry(category: MemoryCategory, entry: MemoryEntry): Promise<void>;
	flush(): Promise<void>;
	getEntries(category: MemoryCategory): Promise<MemoryEntry[]>;
	getMetadata(
		category: MemoryCategory
	): Promise<{ lastConsolidatedAt?: string; lastWrittenAt: string; version: number }>;
	removeEntries(category: MemoryCategory, ids: Set<string>): Promise<number>;
	removeEntry(category: MemoryCategory, id: string): Promise<boolean>;
	save(category: MemoryCategory, immediate?: boolean): void;
	setEntries(category: MemoryCategory, entries: MemoryEntry[]): Promise<void>;
	setLastConsolidatedAt(timestamp: string): Promise<void>;
	updateEntry(category: MemoryCategory, id: string, patch: Partial<MemoryEntry>): Promise<boolean>;
}
