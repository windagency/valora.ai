/**
 * Vault-specific configuration schema.
 *
 * All vault-tuning knobs live under `plugins.memory-vault.*`; the host's
 * `memory.*` block owns only `{enabled, provider}`. This schema is the
 * bundled vault's own source of truth, read from the raw plugin namespace
 * via `parseVaultPluginConfig()`.
 */

import { z } from 'zod';

import {
	DEFAULT_MEMORY_DECISION_HALF_LIFE_DAYS,
	DEFAULT_MEMORY_EMBED_BATCH_SIZE,
	DEFAULT_MEMORY_EMBED_DIM,
	DEFAULT_MEMORY_EMBED_MODEL,
	DEFAULT_MEMORY_EPISODIC_HALF_LIFE_DAYS,
	DEFAULT_MEMORY_ERROR_HALF_LIFE_MULTIPLIER,
	DEFAULT_MEMORY_INJECTION_STRENGTH_THRESHOLD,
	DEFAULT_MEMORY_INJECTION_TOKEN_BUDGET,
	DEFAULT_MEMORY_MAX_ENTRIES_PER_STORE,
	DEFAULT_MEMORY_PRUNE_THRESHOLD,
	DEFAULT_MEMORY_RECALL_CO_ACCESS_INCREMENT,
	DEFAULT_MEMORY_RECALL_SEED_K,
	DEFAULT_MEMORY_RECALL_WALK_DECAY,
	DEFAULT_MEMORY_RECALL_WALK_DEPTH,
	DEFAULT_MEMORY_RETRIEVAL_BOOST_DAYS,
	DEFAULT_MEMORY_SEMANTIC_HALF_LIFE_DAYS
} from './constants.js';

const VAULT_EMBEDDING_SCHEMA = z.object({
	batch_size: z.number().min(1).max(256).default(DEFAULT_MEMORY_EMBED_BATCH_SIZE),
	dim: z.number().min(1).default(DEFAULT_MEMORY_EMBED_DIM),
	model: z.string().default(DEFAULT_MEMORY_EMBED_MODEL),
	provider: z.string().default('auto')
});

const VAULT_RECALL_SCHEMA = z.object({
	co_access_increment: z.number().min(0).default(DEFAULT_MEMORY_RECALL_CO_ACCESS_INCREMENT),
	seed_k: z.number().min(1).max(100).default(DEFAULT_MEMORY_RECALL_SEED_K),
	walk_decay: z.number().min(0).max(1).default(DEFAULT_MEMORY_RECALL_WALK_DECAY),
	walk_depth: z.number().min(0).max(10).default(DEFAULT_MEMORY_RECALL_WALK_DEPTH)
});

export const VAULT_PLUGIN_CONFIG_SCHEMA = z.object({
	decision_half_life_days: z.number().min(1).max(365).default(DEFAULT_MEMORY_DECISION_HALF_LIFE_DAYS),
	embedding: VAULT_EMBEDDING_SCHEMA.optional(),
	episodic_half_life_days: z.number().min(1).max(365).default(DEFAULT_MEMORY_EPISODIC_HALF_LIFE_DAYS),
	error_half_life_multiplier: z.number().min(1).max(10).default(DEFAULT_MEMORY_ERROR_HALF_LIFE_MULTIPLIER),
	injection_strength_threshold: z.number().min(0).max(1).default(DEFAULT_MEMORY_INJECTION_STRENGTH_THRESHOLD),
	injection_token_budget: z.number().min(100).max(10000).default(DEFAULT_MEMORY_INJECTION_TOKEN_BUDGET),
	max_entries_per_store: z.number().min(10).max(10000).default(DEFAULT_MEMORY_MAX_ENTRIES_PER_STORE),
	prune_threshold: z.number().min(0).max(1).default(DEFAULT_MEMORY_PRUNE_THRESHOLD),
	recall: VAULT_RECALL_SCHEMA.optional(),
	retrieval_boost_days: z.number().min(0).max(30).default(DEFAULT_MEMORY_RETRIEVAL_BOOST_DAYS),
	semantic_half_life_days: z.number().min(1).max(365).default(DEFAULT_MEMORY_SEMANTIC_HALF_LIFE_DAYS)
});

export type VaultPluginConfig = z.infer<typeof VAULT_PLUGIN_CONFIG_SCHEMA>;

/**
 * Parse the raw `plugins['memory-vault']` subtree into a fully-defaulted
 * {@link VaultPluginConfig}. Returns the all-defaults config when the
 * subtree is missing or empty.
 */
export function parseVaultPluginConfig(raw: unknown): VaultPluginConfig {
	return VAULT_PLUGIN_CONFIG_SCHEMA.parse(raw ?? {});
}
