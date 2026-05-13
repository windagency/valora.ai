/**
 * Bundled memory provider that wraps Valora's vault implementation in a
 * {@link MemoryProvider} adapter. Registered as `'vault'` at boot via this
 * package's `register(api)` entry point in `./index.ts`.
 *
 * Each host consumer (executor, CLI, MCP shutdown) reaches the active
 * provider via `getMemoryRegistry().getActive()` rather than instantiating
 * concrete vault classes.
 */

import type {
	ConsolidationOptions,
	ConsolidationResult,
	ExtractionContext,
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
} from '@windagency/valora-plugin-api';

import type { ConsolidationCompleteListener } from './consolidation-service.js';
import type { EmbedderPort } from './embeddings/embedder.port.js';

import { type VaultPluginConfig } from './config-schema.js';
import { type ProviderLookup, resolveEmbedder } from './embeddings/resolve-embedder.js';
import { MemoryManager } from './manager.js';
import { runAutoMigrationIfNeeded } from './migration/auto-migrate.js';
import { readVaultVersion } from './migration/vault-version.js';
import { getDefaultVaultDir, getLegacyJsonDir } from './vault/default-vault-dir.js';
import { VaultStore } from './vault/vault-store.js';

const VAULT_PROVIDER_NAME = 'vault';
const VAULT_PROVIDER_LABEL = 'Valora Vault';

const VAULT_CAPABILITIES: MemoryCapability[] = ['consolidation', 'embeddings', 'extraction', 'graph-edges', 'reembed'];

const ALL_CATEGORIES: MemoryCategory[] = ['episodic', 'semantic', 'decisions'];

interface VaultProviderConfig {
	memoryConfig?: VaultPluginConfig;
	/**
	 * Optional callback fired after `consolidate()` finishes. The host wires
	 * this to its `pipeline-emitter`. When omitted, no event is emitted.
	 */
	onConsolidationComplete?: ConsolidationCompleteListener;
	/**
	 * Optional provider-lookup function. When supplied, the bundled vault
	 * resolves an embedder via this lookup to enable semantic recall. The
	 * host wires this to its `llm/registry` at boot; tests and minimal
	 * environments can omit it (recall falls back to lexical).
	 */
	providerLookup?: ProviderLookup;
	vaultDir?: string;
}

export class VaultMemoryProvider implements MemoryProvider {
	private embedderPromise?: Promise<EmbedderPort | undefined>;
	private embedderResolved = false;
	private readonly manager: MemoryManager;
	private readonly memoryConfig?: VaultPluginConfig;
	private readonly onConsolidationComplete?: ConsolidationCompleteListener;
	private readonly providerLookup?: ProviderLookup;
	private readonly store: VaultStore;
	private readonly vaultDir: string;

	constructor(config: Record<string, unknown>) {
		const cfg = config as VaultProviderConfig;
		this.vaultDir = cfg.vaultDir ?? getDefaultVaultDir();
		this.memoryConfig = cfg.memoryConfig;
		this.providerLookup = cfg.providerLookup;
		this.onConsolidationComplete = cfg.onConsolidationComplete;
		runAutoMigrationIfNeeded(getLegacyJsonDir(), this.vaultDir);
		this.store = new VaultStore(this.vaultDir);
		this.manager = new MemoryManager(this.store, this.memoryConfig);
	}

	async consolidate(options: ConsolidationOptions = {}): Promise<ConsolidationResult> {
		const { MemoryConsolidationService } = await import('./consolidation-service');
		const embedder = await this.getEmbedder();
		const service = new MemoryConsolidationService(this.store, embedder, {
			onComplete: this.onConsolidationComplete,
			providerLookup: this.providerLookup,
			semanticHalfLifeDays: this.memoryConfig?.semantic_half_life_days
		});
		return service.consolidate(options);
	}

	async create(category: MemoryCategory, options: MemoryCreateOptions): Promise<MemoryEntry> {
		return this.manager.create(category, options);
	}

	async delete(category: MemoryCategory, id: string): Promise<boolean> {
		return this.manager.delete(category, id);
	}

	extractFromAgentOutput(_output: string, _ctx: ExtractionContext): Promise<MemoryEntry[]> {
		// Provider-level extraction is a deliberate no-op. The vault backend's
		// extraction path is `MemoryExtractionService`, which operates on the
		// pipeline-specific `FeedbackOutputs` shape and is invoked directly by
		// the post-session hook in `executor/pipeline.ts`. Callers reaching
		// this method get the documented empty result by contract.
		return Promise.resolve([]);
	}

	async findByPaths(paths: string[]): Promise<MemoryQueryResult[]> {
		return this.manager.findByPaths(paths);
	}

	async flush(): Promise<void> {
		return this.manager.flush();
	}

	async get(category: MemoryCategory, id: string, strengthen?: boolean): Promise<MemoryQueryResult | null> {
		return this.manager.get(category, id, strengthen);
	}

	getVaultDir(): string {
		return this.vaultDir;
	}

	async info(): Promise<MemoryProviderInfo> {
		// Touch every category to populate the lazy index before reading stats.
		const fetched = await Promise.all(ALL_CATEGORIES.map((c) => this.store.getEntries(c)));
		const stats = this.store.getVaultStats();

		const counts = Object.fromEntries(ALL_CATEGORIES.map((c, i) => [c, fetched[i]!.length])) as Record<
			MemoryCategory,
			number
		>;

		const schemaVersion = readVaultVersion(this.vaultDir) ?? undefined;

		return {
			capabilities: VAULT_CAPABILITIES,
			counts,
			edgeCount: stats.edgeCount,
			embeddingCoverage: stats.embeddingCoverage,
			label: VAULT_PROVIDER_LABEL,
			name: VAULT_PROVIDER_NAME,
			...(schemaVersion !== undefined ? { schemaVersion } : {})
		};
	}

	async invalidateByPaths(paths: string[]): Promise<number> {
		return this.manager.invalidateByPaths(paths);
	}

	async markStaleByPaths(paths: string[]): Promise<number> {
		return this.manager.markStaleByPaths(paths);
	}

	async prune(_threshold?: number): Promise<number> {
		// `_threshold` is on the contract for future use; the vault implementation
		// reads its threshold from `memoryConfig.prune_threshold`.
		return this.manager.prune();
	}

	async purge(criteria: PurgeCriteria): Promise<PurgeResult> {
		return this.manager.purge(criteria);
	}

	async query(options: MemoryQueryOptions): Promise<MemoryQueryResult[]> {
		// Ensure the embedder is resolved before queries that include free-text
		// recall. Lexical queries do not depend on it, but the resolution is
		// idempotent and cheap after the first call.
		const embedder = await this.getEmbedder();
		if (embedder !== undefined) {
			this.manager.setEmbedder(embedder);
		}
		return this.manager.query(options);
	}

	async update(category: MemoryCategory, id: string, patch: Partial<MemoryEntry>): Promise<boolean> {
		return this.manager.update(category, id, patch);
	}

	async verify(): Promise<MemoryVerifyReport> {
		const counts: Record<MemoryCategory, number> = { decisions: 0, episodic: 0, semantic: 0 };
		const issues: string[] = [];
		for (const category of ALL_CATEGORIES) {
			try {
				const entries = await this.store.getEntries(category);
				counts[category] = entries.length;
			} catch (err) {
				issues.push(`${category}: ${err instanceof Error ? err.message : String(err)}`);
			}
		}
		return { counts, issues, ok: issues.length === 0 };
	}

	private async getEmbedder(): Promise<EmbedderPort | undefined> {
		if (this.embedderResolved) return this.embedderPromise;
		this.embedderPromise ??= resolveEmbedder(this.memoryConfig, this.providerLookup);
		const embedder = await this.embedderPromise;
		this.embedderResolved = true;
		return embedder;
	}
}
