/**
 * Memory module — host-side surface for the registry-routed memory subsystem.
 *
 * The bundled vault implementation lives in
 * `@windagency/valora-plugin-memory-vault`. Production callers reach the
 * active provider via `getMemoryRegistry().getActive()`; the legacy named
 * exports below are forwarded from the bundled package so that
 * `from 'memory'` keeps resolving for code that has not yet migrated.
 *
 * New code should consume `getMemoryRegistry()` (this module) and the
 * `MemoryProvider` contract from `@windagency/valora-plugin-api` (mirrored
 * via `types/memory.types`).
 */

export { bootstrapBundledMemoryProvider, type BootstrapBundledMemoryProviderOptions } from './bootstrap';
export {
	getMemoryRegistry,
	MemoryProviderConflictError,
	MemoryProviderRegistry,
	resetMemoryRegistry
} from './registry';

export type { EmbedderPort } from '@windagency/valora-plugin-memory-vault';
export {
	centroidSummary,
	computeEffectiveHalfLife,
	computeStrength,
	cosineClusters,
	EmbedderNotSupportedError,
	getDefaultVaultDir,
	getLegacyJsonDir,
	LlmProviderEmbedder,
	MemoryManager,
	/** @deprecated legacy JSON backend retained for migration paths only. */
	computeContentHash,
	MemoryStore,
	migrateJsonToVault,
	type MigrationOptions,
	type MigrationResult,
	openVaultStore,
	openVectorStore,
	type ParsedMemoryFile,
	parseMemoryFile,
	parseVaultPluginConfig,
	readVaultVersion,
	readVectorStoreMeta,
	resolveEmbedder,
	runAutoMigrationIfNeeded,
	serialiseMemoryFile,
	shouldPrune,
	VAULT_DESCRIPTOR,
	VAULT_PLUGIN_CONFIG_SCHEMA,
	VAULT_SCHEMA_VERSION,
	VaultMemoryProvider,
	type VaultPluginConfig,
	type VaultStats,
	VaultStore,
	type VectorStore,
	writeVaultVersion
} from '@windagency/valora-plugin-memory-vault';
