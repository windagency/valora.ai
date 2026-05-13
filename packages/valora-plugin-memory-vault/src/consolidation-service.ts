/**
 * Memory Consolidation Service.
 *
 * Orchestrates the full consolidation cycle for the agent memory system:
 * 1. Prune decayed entries below the strength threshold
 * 2. Run git-based invalidation to weaken memories referencing changed files
 * 3. Detect similar episodic entries and merge them into semantic patterns
 * 4. Auto-promote high-access verified entries to semantic store
 *
 * Designed to be called from the `valora consolidate` CLI command
 * or as a post-feedback automatic maintenance step.
 */

import type {
	ConsolidationOptions,
	ConsolidationResult,
	Edge,
	MemoryEntry,
	MemoryStorePort
} from '@windagency/valora-plugin-api';

import { generateMemoryId, SafeExecutor } from '@windagency/valora-runtime';

import type { EmbedderPort } from './embeddings/embedder.port.js';

import { centroidSummary, cosineClusters } from './consolidation/cluster.js';
import { type ProviderLookup, resolveEmbedder } from './embeddings/resolve-embedder.js';
import { openVectorStore, readVectorStoreMeta } from './embeddings/vector-store.js';
import { MemoryManager } from './manager.js';
import { runAutoMigrationIfNeeded } from './migration/auto-migrate.js';
import { getDefaultVaultDir, getLegacyJsonDir } from './vault/default-vault-dir.js';
import { VaultStore } from './vault/vault-store.js';

export type { ConsolidationOptions, ConsolidationResult };

/**
 * Optional callback invoked after consolidation finishes. The host wires
 * this to its `pipeline-emitter` so the existing observability surface
 * remains. When omitted (e.g. plugin-direct usage or tests), no event is
 * emitted.
 */

export type ConsolidationCompleteListener = (_result: ConsolidationResult) => void;

/**
 * Optional context the host supplies so the package does not depend on
 * `config/loader` or `output/pipeline-emitter`. When absent, the service
 * uses a sensible 30-day default for the semantic half-life and emits
 * no completion event.
 */
export interface ConsolidationServiceContext {
	/** Listener for consolidation-complete events (host wires to pipeline-emitter). */
	onComplete?: ConsolidationCompleteListener;
	/** Provider lookup so cosine consolidation can resolve an embedder. */
	providerLookup?: ProviderLookup;
	/** Override the semantic half-life used for cosine-merged entries. */
	semanticHalfLifeDays?: number;
}

interface ParsedCommit {
	changedFiles: string[];
	hash: string;
	message: string;
}

/** Compute Jaccard similarity between two tag sets. */
function jaccardSimilarity(a: string[], b: string[]): number {
	const setA = new Set(a);
	const setB = new Set(b);
	const intersection = [...setA].filter((t) => setB.has(t)).length;
	const union = new Set([...a, ...b]).size;
	return union === 0 ? 0 : intersection / union;
}

/** Parse `git log --name-only --format=COMMIT:%H %s --since=<date>` output. */
function parseGitLogOutput(output: string): ParsedCommit[] {
	const commits: ParsedCommit[] = [];
	let current: null | ParsedCommit = null;

	for (const line of output.split('\n')) {
		const trimmed = line.trim();
		if (trimmed.startsWith('COMMIT:')) {
			if (current !== null) {
				commits.push(current);
			}
			// Format: "COMMIT:<hash> <message>"
			const rest = trimmed.slice('COMMIT:'.length);
			const spaceIndex = rest.indexOf(' ');
			const hash = spaceIndex === -1 ? rest : rest.slice(0, spaceIndex);
			const message = spaceIndex === -1 ? '' : rest.slice(spaceIndex + 1);
			current = { changedFiles: [], hash, message };
		} else if (trimmed.length > 0 && current !== null) {
			current.changedFiles.push(trimmed);
		}
	}

	if (current !== null) {
		commits.push(current);
	}

	return commits;
}

const COSINE_CLUSTER_THRESHOLD = 0.82;

export class MemoryConsolidationService {
	private readonly context: ConsolidationServiceContext;
	private readonly embedder?: EmbedderPort;
	private readonly manager: MemoryManager;
	private readonly store: MemoryStorePort;

	constructor(store?: MemoryStorePort, embedder?: EmbedderPort, context: ConsolidationServiceContext = {}) {
		this.store = store ?? buildDefaultVaultStore();
		this.embedder = embedder;
		this.context = context;
		this.manager = new MemoryManager(this.store, undefined, embedder);
	}

	/**
	 * Build a service with the embedder resolved from the host-provided
	 * `providerLookup`. Used by the singleton helper and the CLI entry
	 * points so cosine consolidation fires automatically when a provider
	 * with `embed?()` is available.
	 *
	 * Without a provider lookup, the service is constructed embedder-less
	 * and falls back to the Jaccard merge path.
	 */
	static async create(context: ConsolidationServiceContext = {}): Promise<MemoryConsolidationService> {
		let embedder: EmbedderPort | undefined;
		try {
			embedder = await resolveEmbedder(undefined, context.providerLookup);
		} catch {
			embedder = undefined;
		}
		return new MemoryConsolidationService(undefined, embedder, context);
	}

	async consolidate(options: ConsolidationOptions = {}): Promise<ConsolidationResult> {
		const startMs = Date.now();
		const { dryRun = false, pruneOnly = false } = options;

		let pruned = 0;
		let gitInvalidated = 0;
		let staleMarked = 0;
		let merged = 0;
		let promoted = 0;

		// Step 1: Prune decayed entries
		if (!dryRun) {
			pruned = await this.manager.prune();
		}

		// Step 2: Git-based invalidation
		const gitResult = await this.runGitInvalidation(options.since);
		gitInvalidated = gitResult.invalidated;
		staleMarked = gitResult.staleMarked;

		// Step 3: Detect similar episodic entries and merge (skip if pruneOnly)
		if (!pruneOnly) {
			merged = await this.mergeEpisodicEntries(dryRun);
		}

		// Step 4: Auto-promote high-value episodic entries (skip if pruneOnly)
		if (!pruneOnly) {
			promoted = await this.autoPromoteEntries(dryRun);
		}

		// Step 5: Update consolidation timestamp
		if (!dryRun) {
			await this.store.setLastConsolidatedAt(new Date().toISOString());
		}
		await this.manager.flush();

		const durationMs = Date.now() - startMs;

		// Step 6: Emit event via the host-provided listener (no-op when absent).
		const result: ConsolidationResult = {
			durationMs,
			gitInvalidated,
			merged,
			promoted,
			pruned,
			staleMarked
		};
		this.context.onComplete?.(result);

		return result;
	}

	private async autoPromoteEntries(dryRun: boolean): Promise<number> {
		const entries = await this.store.getEntries('episodic');
		let promotedCount = 0;

		for (const entry of entries) {
			if (entry.accessCount >= 5 && entry.confidence === 'verified' && entry.supersededBy === undefined) {
				if (!dryRun) {
					await this.manager.promote(entry.id, entry.content, entry.tags);
				}
				promotedCount++;
			}
		}

		return promotedCount;
	}

	private buildCluster(
		entryI: MemoryEntry,
		group: MemoryEntry[],
		startIdx: number,
		visited: Set<number>
	): MemoryEntry[] {
		const cluster: MemoryEntry[] = [entryI];
		for (let j = startIdx + 1; j < group.length; j++) {
			if (visited.has(j)) continue;
			const entryJ = group[j];
			if (entryJ === undefined) continue;
			if (jaccardSimilarity(entryI.tags, entryJ.tags) >= 0.6) {
				cluster.push(entryJ);
				visited.add(j);
			}
		}
		return cluster;
	}

	private async mergeCluster(cluster: MemoryEntry[], dryRun: boolean): Promise<boolean> {
		const primaryEntry = cluster[0];
		if (primaryEntry === undefined) return false;

		const combinedContent = cluster.map((e) => e.content).join('\n\n');
		const combinedTags = [...new Set(cluster.flatMap((e) => e.tags))];
		const bestConfidence = cluster.reduce(
			(best, e) => (confidenceRank(e.confidence) > confidenceRank(best) ? e.confidence : best),
			primaryEntry.confidence
		);

		if (!dryRun) {
			if (bestConfidence !== primaryEntry.confidence) {
				await this.manager.update('episodic', primaryEntry.id, { confidence: bestConfidence });
			}
			const promoted = await this.manager.promote(primaryEntry.id, combinedContent, combinedTags);
			// Persist `decays_from` edges for the rest of the cluster. A single
			// appendEntryWithLinks call writes all edges at once — per-member
			// calls would overwrite the file each iteration, losing all but the
			// last edge (H14). The supersedes edge for the primary was already
			// written by promote(); include it again here to survive the overwrite.
			const vault = this.store instanceof VaultStore ? this.store : undefined;
			if (vault !== undefined && cluster.length > 1) {
				const allEdges: Edge[] = [
					{ fromId: promoted.id, kind: 'supersedes', toId: primaryEntry.id },
					...cluster.slice(1).map((m): Edge => ({ fromId: promoted.id, kind: 'decays_from', toId: m.id }))
				];
				await vault.appendEntryWithLinks('semantic', promoted, allEdges);
			}
			for (const entry of cluster.slice(1)) {
				await this.manager.delete('episodic', entry.id);
			}
		}
		return true;
	}

	private readSemanticHalfLifeOrDefault(): number {
		return this.context.semanticHalfLifeDays ?? 30;
	}

	/** Groups episodic entries by their primary tag; entries with no tags are excluded. */
	private buildTagGroups(entries: MemoryEntry[]): Map<string, MemoryEntry[]> {
		const groups = new Map<string, MemoryEntry[]>();
		for (const entry of entries) {
			if (entry.tags.length === 0) continue;
			const primaryTag = entry.tags[0]!;
			if (!groups.has(primaryTag)) groups.set(primaryTag, []);
			groups.get(primaryTag)!.push(entry);
		}
		return groups;
	}

	private async mergeClusterCosine(cluster: MemoryEntry[], vaultStore: VaultStore): Promise<void> {
		const now = new Date().toISOString();
		const id = generateMemoryId();
		const content = centroidSummary(cluster);
		const tags = [...new Set(cluster.flatMap((e) => e.tags))];
		const bestConfidence = cluster.reduce(
			(best, e) => (confidenceRank(e.confidence) > confidenceRank(best) ? e.confidence : best),
			cluster[0]!.confidence
		);

		// Half-life from injected config so cosine and Jaccard paths agree (H13).
		// Falls back to the default constant when config has not been loaded
		// (e.g. unit/integration tests that bypass the loader).
		const semanticHalfLife = this.readSemanticHalfLifeOrDefault();

		const newEntry: MemoryEntry = {
			accessCount: 0,
			agentRole: cluster[0]!.agentRole,
			category: 'semantic',
			confidence: bestConfidence,
			content,
			createdAt: now,
			halfLifeDays: semanticHalfLife,
			id,
			isError: false,
			lastAccessedAt: now,
			relatedPaths: [...new Set(cluster.flatMap((e) => e.relatedPaths))],
			sessionId: cluster[0]!.sessionId,
			source: cluster[0]!.source,
			tags,
			updatedAt: now
		};

		const links: Edge[] = cluster.map((m) => ({ fromId: id, kind: 'decays_from', toId: m.id }));
		await vaultStore.appendEntryWithLinks('semantic', newEntry, links);

		// Mark all cluster members as stale
		for (const member of cluster) {
			await vaultStore.updateEntry('episodic', member.id, { confidence: 'stale', supersededBy: id });
		}
	}

	private async mergeCosine(dryRun: boolean): Promise<number> {
		const vaultStore = this.store as VaultStore;
		const vaultDir = vaultStore.getVaultDir();

		// Cosine consolidation requires existing on-disk embeddings; align with
		// the persisted model/dim so the strict mismatch guard does not throw.
		const meta = readVectorStoreMeta(vaultDir);
		if (meta === null) return 0;

		const entries = await vaultStore.getEntries('episodic');
		const vs = openVectorStore(vaultDir, meta.model, meta.dim);
		const clusters = cosineClusters(entries, vs, COSINE_CLUSTER_THRESHOLD);
		let mergedCount = 0;

		for (const cluster of clusters) {
			if (dryRun) {
				mergedCount++;
				continue;
			}
			await this.mergeClusterCosine(cluster, vaultStore);
			mergedCount++;
		}

		return mergedCount;
	}

	private async mergeEpisodicEntries(dryRun: boolean): Promise<number> {
		if (this.embedder && this.store instanceof VaultStore) {
			const cosineMerged = await this.mergeCosine(dryRun);
			if (cosineMerged > 0) return cosineMerged;
			// No embeddings on disk — fall back to Jaccard so consolidation still runs.
		}
		return this.mergeJaccard(dryRun);
	}

	private async mergeJaccard(dryRun: boolean): Promise<number> {
		const entries = await this.store.getEntries('episodic');
		const groups = this.buildTagGroups(entries);
		let mergedCount = 0;

		for (const [, group] of groups) {
			if (group.length < 2) continue;
			const visited = new Set<number>();

			for (let i = 0; i < group.length; i++) {
				if (visited.has(i)) continue;
				const entryI = group[i];
				if (entryI === undefined) continue;
				visited.add(i);

				const cluster = this.buildCluster(entryI, group, i, visited);
				if (cluster.length < 2) continue;

				if (await this.mergeCluster(cluster, dryRun)) {
					mergedCount++;
				}
			}
		}

		return mergedCount;
	}

	private async runGitInvalidation(sinceOverride?: string): Promise<{ invalidated: number; staleMarked: number }> {
		// Get last consolidated timestamp from episodic metadata
		let sinceDate: string;

		if (sinceOverride !== undefined) {
			sinceDate = sinceOverride;
		} else {
			const metadata = await this.store.getMetadata('episodic');
			if (metadata.lastConsolidatedAt !== undefined) {
				sinceDate = metadata.lastConsolidatedAt;
			} else {
				// Default: 7 days ago
				const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
				sinceDate = sevenDaysAgo.toISOString();
			}
		}

		let gitOutput = '';
		try {
			const result = await SafeExecutor.executeGit([
				'log',
				'--name-only',
				`--format=COMMIT:%H %s`,
				`--since=${sinceDate}`
			]);
			gitOutput = result.stdout;
		} catch {
			// Git not available or not in a git repo — skip invalidation gracefully
			return { invalidated: 0, staleMarked: 0 };
		}

		const commits = parseGitLogOutput(gitOutput);

		const allChangedFiles = new Set<string>();
		const staleFiles = new Set<string>();
		const revertPattern = /\b(revert|remove|delete|migrate\s+from)\b/i;

		for (const commit of commits) {
			for (const file of commit.changedFiles) {
				allChangedFiles.add(file);
			}
			if (revertPattern.test(commit.message)) {
				for (const file of commit.changedFiles) {
					staleFiles.add(file);
				}
			}
		}

		let invalidated = 0;
		let staleMarkedCount = 0;

		if (allChangedFiles.size > 0) {
			invalidated = await this.manager.invalidateByPaths([...allChangedFiles]);
		}

		if (staleFiles.size > 0) {
			staleMarkedCount = await this.manager.markStaleByPaths([...staleFiles]);
		}

		return { invalidated, staleMarked: staleMarkedCount };
	}
}

function buildDefaultVaultStore(): VaultStore {
	const vaultDir = getDefaultVaultDir();
	runAutoMigrationIfNeeded(getLegacyJsonDir(), vaultDir);
	return new VaultStore(vaultDir);
}

const CONFIDENCE_RANK: Record<MemoryEntry['confidence'], number> = {
	inferred: 1,
	observed: 2,
	stale: 0,
	verified: 3
};

function confidenceRank(confidence: MemoryEntry['confidence']): number {
	return CONFIDENCE_RANK[confidence];
}

let consolidationInstance: MemoryConsolidationService | null = null;
let consolidationPromise: null | Promise<MemoryConsolidationService> = null;

/**
 * Returns the shared {@link MemoryConsolidationService} for this process,
 * resolving the configured embedder on first use so cosine consolidation can
 * fire when a provider implements `embed?()`. Subsequent calls return the same
 * instance without re-resolving.
 */
export async function getMemoryConsolidation(): Promise<MemoryConsolidationService> {
	if (consolidationInstance !== null) return consolidationInstance;
	consolidationPromise ??= MemoryConsolidationService.create().then((service) => {
		consolidationInstance = service;
		return service;
	});
	return consolidationPromise;
}

export function resetMemoryConsolidation(): void {
	consolidationInstance = null;
	consolidationPromise = null;
}
