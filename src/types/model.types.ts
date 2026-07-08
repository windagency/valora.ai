/**
 * Model metadata types shared across the provider descriptors and their consumers.
 *
 * These live in the types layer so that both the provider SSOT descriptors
 * (src/llm/providers/*.models.ts) and consumers such as the token/cost
 * estimator can reference them without creating an import cycle.
 */

/**
 * Per-model pricing, expressed in USD per million tokens.
 *
 * cache_write: cost per million tokens for writing to the prompt cache
 *              (Anthropic 5-min TTL ≈ 1.25x input; omit when the provider has
 *              no separate write surcharge, e.g. OpenAI automatic caching).
 * cache_read:  cost per million tokens for reading from cache (≈ 0.1x input).
 */
export interface ModelPricing {
	cache_read?: number;
	cache_write?: number;
	input: number;
	output: number;
}

/**
 * Real API model identifiers for a registry model alias.
 *
 * Some providers (notably Anthropic) expose a friendly dotted alias in the
 * registry (e.g. `claude-opus-4.8`) that must be resolved to the vendor's real
 * API id (`claude-opus-4-8`), with a distinct form for Vertex AI.
 */
export interface ApiModelId {
	standard: string;
	vertex?: string;
}
