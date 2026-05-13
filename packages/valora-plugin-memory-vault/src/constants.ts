/**
 * Memory-domain constants for the bundled vault implementation.
 *
 * These are the defaults the vault uses when configuration omits them. The
 * host's `config/constants` re-exports these for back-compat with the Zod
 * memory schema and any other host code that referenced them.
 */

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const MEMORY_STORE_VERSION = 1;
export const MEMORY_HALF_LIFE_CAP_MULTIPLIER = 10;
export const MEMORY_PERSIST_DEBOUNCE_MS = 2000;

export const DEFAULT_MEMORY_ENABLED = true;
export const DEFAULT_MEMORY_BACKEND = 'vault' as const;

export const DEFAULT_MEMORY_EPISODIC_HALF_LIFE_DAYS = 7;
export const DEFAULT_MEMORY_SEMANTIC_HALF_LIFE_DAYS = 30;
export const DEFAULT_MEMORY_DECISION_HALF_LIFE_DAYS = 21;
export const DEFAULT_MEMORY_RETRIEVAL_BOOST_DAYS = 2;
export const DEFAULT_MEMORY_PRUNE_THRESHOLD = 0.05;
export const DEFAULT_MEMORY_MAX_ENTRIES_PER_STORE = 500;
export const DEFAULT_MEMORY_ERROR_HALF_LIFE_MULTIPLIER = 2;

export const DEFAULT_MEMORY_INJECTION_TOKEN_BUDGET = 2000;
export const DEFAULT_MEMORY_INJECTION_STRENGTH_THRESHOLD = 0.2;

export const DEFAULT_MEMORY_EMBED_MODEL = 'nomic-embed-text';
export const DEFAULT_MEMORY_EMBED_DIM = 768;
export const DEFAULT_MEMORY_EMBED_BATCH_SIZE = 32;

export const DEFAULT_MEMORY_RECALL_SEED_K = 12;
export const DEFAULT_MEMORY_RECALL_WALK_DEPTH = 2;
export const DEFAULT_MEMORY_RECALL_WALK_DECAY = 0.6;
export const DEFAULT_MEMORY_RECALL_CO_ACCESS_INCREMENT = 1;
