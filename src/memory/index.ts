/**
 * Public memory module surface.
 *
 * External callers (CLI, executor, services) should import from this barrel
 * rather than reaching into module internals — see the arch-unit rule
 * "External code uses public memory API" in vault-memory.arch.test.ts.
 *
 * The `MemoryStore` (legacy JSON backend) is exported only as a deprecated
 * type re-export so legacy migration paths continue to compile; new code
 * must use `VaultStore` (resolved through DI).
 */

export { centroidSummary, cosineClusters } from './consolidation/cluster';
export { computeEffectiveHalfLife, computeStrength, shouldPrune } from './decay';
export type { EmbedderPort } from './embeddings/embedder.port';
export { EmbedderNotSupportedError, LlmProviderEmbedder } from './embeddings/llm-provider-embedder';
export { resolveEmbedder } from './embeddings/resolve-embedder';
export { openVectorStore, readVectorStoreMeta, type VectorStore } from './embeddings/vector-store';
export { MemoryManager } from './manager';
export { runAutoMigrationIfNeeded } from './migration/auto-migrate';
export { migrateJsonToVault, type MigrationOptions, type MigrationResult } from './migration/json-to-vault';
export { readVaultVersion, VAULT_SCHEMA_VERSION, writeVaultVersion } from './migration/vault-version';
/** @deprecated retained for migration paths only — production code uses VaultStore. */
export { MemoryStore } from './store';
export { getDefaultVaultDir, getLegacyJsonDir } from './vault/default-vault-dir';
export { openVaultStore, type VaultStats, VaultStore } from './vault/vault-store';
