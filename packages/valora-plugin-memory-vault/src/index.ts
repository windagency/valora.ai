/**
 * Bundled vault memory backend for Valora.
 *
 * Registers `'vault'` as a memory provider via `api.memory.register(...)` —
 * the same API any third-party memory plugin would use. The host bootstraps
 * this package at startup; user plugins may override via
 * `manifest.overrides: ['vault']`.
 */

import type { MemoryProviderDescriptor, PluginAPI } from '@windagency/valora-plugin-api';

import { VaultMemoryProvider } from './vault-memory-provider.js';

export const VAULT_DESCRIPTOR: MemoryProviderDescriptor = {
	capabilities: ['consolidation', 'embeddings', 'extraction', 'graph-edges', 'reembed'],
	description: 'Markdown-vault memory backend with biologically-inspired decay and graph retrieval',
	label: 'Valora Vault'
};

export function register(api: PluginAPI): void {
	api.memory.register('vault', VaultMemoryProvider, VAULT_DESCRIPTOR);
}

// Public surface — both for host imports (`from '@windagency/valora-plugin-memory-vault'`)
// and the legacy host `from 'memory'` barrel that re-exports these.

export { parseVaultPluginConfig, VAULT_PLUGIN_CONFIG_SCHEMA, type VaultPluginConfig } from './config-schema.js';

export {
	type ConsolidationCompleteListener,
	type ConsolidationServiceContext,
	getMemoryConsolidation,
	MemoryConsolidationService,
	resetMemoryConsolidation
} from './consolidation-service.js';
export { centroidSummary, cosineClusters } from './consolidation/cluster.js';
export { computeEffectiveHalfLife, computeStrength, shouldPrune } from './decay.js';
export type { EmbedderPort } from './embeddings/embedder.port.js';
export { EmbedderNotSupportedError, LlmProviderEmbedder } from './embeddings/llm-provider-embedder.js';
export { type ProviderLookup, resolveEmbedder } from './embeddings/resolve-embedder.js';
export { openVectorStore, readVectorStoreMeta, type VectorStore } from './embeddings/vector-store.js';
export { getMemoryExtraction, MemoryExtractionService, resetMemoryExtraction } from './extraction-service.js';
export { MemoryManager } from './manager.js';
export { runAutoMigrationIfNeeded } from './migration/auto-migrate.js';
export { migrateJsonToVault, type MigrationOptions, type MigrationResult } from './migration/json-to-vault.js';

export { readVaultVersion, VAULT_SCHEMA_VERSION, writeVaultVersion } from './migration/vault-version.js';

export { VaultMemoryProvider } from './vault-memory-provider.js';
/** @deprecated retained for migration paths only — production code uses VaultStore. */
export { MemoryStore } from './store.js';
export { getDefaultVaultDir, getLegacyJsonDir } from './vault/default-vault-dir.js';
export {
	computeContentHash,
	type ParsedMemoryFile,
	parseMemoryFile,
	serialiseMemoryFile
} from './vault/file-format.js';
export { openVaultStore, type VaultStats, VaultStore } from './vault/vault-store.js';
