/**
 * Memory system type definitions.
 *
 * Canonical definitions live in `@windagency/valora-plugin-api` so memory
 * plugins (in any workspace package) can import them from a single stable
 * location. This file re-exports the same names so existing host imports
 * (`from 'types/memory.types'`) continue to resolve.
 */

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
	MemoryProviderDescriptor,
	MemoryProviderFactory,
	MemoryProviderInfo,
	MemoryQueryOptions,
	MemoryQueryResult,
	MemoryRecallConfig,
	MemoryRetentionConfig,
	MemorySource,
	MemoryStoreFile,
	MemoryStorePort,
	MemoryVerifyReport,
	PurgeCriteria,
	PurgeResult,
	ReembedOptions,
	ReembedReport
} from '@windagency/valora-plugin-api';
