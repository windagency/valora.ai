export { bootstrapBundledMemoryProvider } from './bootstrap';
export { EphemeralMemoryProvider } from './ephemeral';
export {
	getMemoryRegistry,
	MemoryProviderConflictError,
	MemoryProviderRegistry,
	type RegisterMemoryProviderOptions,
	resetMemoryRegistry
} from './registry';

export type {
	ConfidenceTier,
	ConsolidationOptions,
	ConsolidationResult,
	Edge,
	EdgeKind,
	ExtractionContext,
	MemoryCapability,
	MemoryCategory,
	MemoryCreateOptions,
	MemoryEmbedder,
	MemoryEmbeddingConfig,
	MemoryEntry,
	MemoryProvider,
	MemoryProviderClass,
	MemoryProviderContract,
	MemoryProviderDescriptor,
	MemoryProviderFactory,
	MemoryProviderInfo,
	MemoryQueryOptions,
	MemoryQueryResult,
	MemoryRecallConfig,
	MemoryRetentionConfig,
	MemorySource,
	MemoryStoreFile,
	MemoryVerifyReport,
	PurgeCriteria,
	PurgeResult,
	ReembedOptions,
	ReembedReport
} from '@windagency/valora-plugin-api';
