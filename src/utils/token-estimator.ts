/**
 * Token and Cost Estimator
 *
 * Estimates token usage and cost for LLM API calls.
 * Uses approximate token counting (4 characters per token for English text).
 */

import type { LLMMessage, LLMUsage } from 'types/llm.types';

export interface TokenEstimate {
	/** Estimated cost in USD */
	estimatedCost: { amount: number; currency: 'USD' };
	/** Estimated completion tokens (based on typical response ratios) */
	estimatedCompletionTokens: number;
	/** Prompt tokens (input) */
	promptTokens: number;
	/** Total estimated tokens */
	totalTokens: number;
	/** Tokens read from cache (optional, populated from actual usage) */
	cacheReadTokens?: number;
	/** Tokens written to cache (optional, populated from actual usage) */
	cacheWriteTokens?: number;
	/** Estimated cost savings from caching in USD (optional) */
	cacheSavings?: number;
}

/**
 * Model pricing per million tokens (updated March 2026)
 * Sources:
 *   Anthropic: https://docs.anthropic.com/en/about-claude/pricing
 *   OpenAI:    https://openai.com/api/pricing/
 *   Google:    https://ai.google.dev/gemini-api/docs/pricing
 *   xAI:       https://docs.x.ai/developers/models
 *   Moonshot:  https://platform.moonshot.ai/docs/pricing/chat
 *
 * cache_write: cost per million tokens for writing to prompt cache (5-min TTL = 1.25x input)
 * cache_read:  cost per million tokens for reading from cache (0.1x input for Anthropic)
 *
 * Entries use both the short alias form AND the resolved API ID form so that
 * calculateActualCost() finds the correct pricing regardless of which form is passed.
 */
interface ModelPricing {
	cache_read?: number;
	cache_write?: number;
	input: number;
	output: number;
}

const MODEL_PRICING: Record<string, ModelPricing> = {
	// ─── Anthropic ────────────────────────────────────────────────────────────
	// Claude 4.6 — 1M context, $5/$25 input/output per MTok
	'claude-opus-4-6': { cache_read: 0.5, cache_write: 6.25, input: 5.0, output: 25.0 },
	'claude-opus-4.6': { cache_read: 0.5, cache_write: 6.25, input: 5.0, output: 25.0 },
	'claude-sonnet-4-6': { cache_read: 0.3, cache_write: 3.75, input: 3.0, output: 15.0 },
	'claude-sonnet-4.6': { cache_read: 0.3, cache_write: 3.75, input: 3.0, output: 15.0 },
	// Claude 4.5 — $5/$25 (Opus), $3/$15 (Sonnet), $1/$5 (Haiku)
	'claude-haiku-4-5-20251001': { cache_read: 0.1, cache_write: 1.25, input: 1.0, output: 5.0 },
	'claude-haiku-4.5': { cache_read: 0.1, cache_write: 1.25, input: 1.0, output: 5.0 },
	'claude-opus-4-5-20251101': { cache_read: 0.5, cache_write: 6.25, input: 5.0, output: 25.0 },
	'claude-opus-4.5': { cache_read: 0.5, cache_write: 6.25, input: 5.0, output: 25.0 },
	'claude-sonnet-4-5-20250929': { cache_read: 0.3, cache_write: 3.75, input: 3.0, output: 15.0 },
	'claude-sonnet-4.5': { cache_read: 0.3, cache_write: 3.75, input: 3.0, output: 15.0 },
	// Claude 4.1 — $15/$75 (Opus)
	'claude-opus-4-1-20250805': { cache_read: 1.5, cache_write: 18.75, input: 15.0, output: 75.0 },
	'claude-opus-4.1': { cache_read: 1.5, cache_write: 18.75, input: 15.0, output: 75.0 },
	// Claude 4.0 — $15/$75 (Opus), $3/$15 (Sonnet)
	'claude-opus-4': { cache_read: 1.5, cache_write: 18.75, input: 15.0, output: 75.0 },
	'claude-opus-4-20250514': { cache_read: 1.5, cache_write: 18.75, input: 15.0, output: 75.0 },
	'claude-sonnet-4': { cache_read: 0.3, cache_write: 3.75, input: 3.0, output: 15.0 },
	'claude-sonnet-4-20250514': { cache_read: 0.3, cache_write: 3.75, input: 3.0, output: 15.0 },
	// Claude 3.x legacy
	'claude-3-5-haiku-20241022': { cache_read: 0.08, cache_write: 1.0, input: 0.8, output: 4.0 },
	'claude-3-5-sonnet-20241022': { cache_read: 0.3, cache_write: 3.75, input: 3.0, output: 15.0 },
	'claude-3-5-sonnet-latest': { cache_read: 0.3, cache_write: 3.75, input: 3.0, output: 15.0 },
	'claude-3-7-sonnet-20250219': { cache_read: 0.3, cache_write: 3.75, input: 3.0, output: 15.0 },
	'claude-3-haiku-20240307': { cache_read: 0.03, cache_write: 0.3, input: 0.25, output: 1.25 },
	'claude-3-opus-20240229': { cache_read: 1.5, cache_write: 18.75, input: 15.0, output: 75.0 },
	'claude-3-sonnet-20240229': { cache_read: 0.3, cache_write: 3.75, input: 3.0, output: 15.0 },
	'claude-haiku-3.5': { cache_read: 0.08, cache_write: 1.0, input: 0.8, output: 4.0 },
	'claude-sonnet-3.7': { cache_read: 0.3, cache_write: 3.75, input: 3.0, output: 15.0 },

	// ─── OpenAI ───────────────────────────────────────────────────────────────
	// GPT-5 series — automatic caching (90% off for GPT-5 family)
	'gpt-5': { cache_read: 0.125, input: 1.25, output: 10.0 },
	'gpt-5-mini': { cache_read: 0.025, input: 0.25, output: 1.5 },
	'gpt-5-nano': { cache_read: 0.01, input: 0.1, output: 0.4 },
	'gpt-5.1': { cache_read: 0.175, input: 1.75, output: 14.0 },
	// GPT-5 thinking modes — high-effort reasoning, priced at o3 tier ($2/$8)
	'gpt-5-thinking-high': { cache_read: 1.0, input: 2.0, output: 8.0 },
	// o-series reasoning models — automatic caching (50% off)
	o3: { cache_read: 1.0, input: 2.0, output: 8.0 },
	'o3-pro': { cache_read: 5.0, input: 20.0, output: 80.0 },
	'o4-mini': { cache_read: 0.275, input: 1.1, output: 4.4 },

	// ─── Google Gemini ────────────────────────────────────────────────────────
	// Gemini 3 — Pro at $2/$12, cached $0.20
	'gemini-3-pro': { cache_read: 0.2, input: 2.0, output: 12.0 },
	// Gemini 2.5 series
	'gemini-2.5-flash': { cache_read: 0.03, input: 0.3, output: 2.5 },
	'gemini-2.5-flash-lite': { cache_read: 0.01, input: 0.1, output: 0.4 },
	'gemini-2.5-pro': { cache_read: 0.125, input: 1.25, output: 10.0 },
	// Gemma open models (self-hosted / Vertex, no public per-token price)
	// gemma-2, gemma-3, gemma-3n omitted — use default pricing as placeholder

	// ─── xAI Grok ─────────────────────────────────────────────────────────────
	// Grok 4.1 Fast — $0.20/$0.50, cached $0.05
	'grok-4.1-fast-non-reasoning': { cache_read: 0.05, input: 0.2, output: 0.5 },
	'grok-4.1-fast-reasoning': { cache_read: 0.05, input: 0.2, output: 0.5 },
	// Grok 4 Fast — $2/$6, cached $0.20
	'grok-4-fast-non-reasoning': { cache_read: 0.2, input: 2.0, output: 6.0 },
	'grok-4-fast-reasoning': { cache_read: 0.2, input: 2.0, output: 6.0 },
	// Grok Code Fast — $0.20/$1.50, cached $0.02
	'grok-code': { cache_read: 0.02, input: 0.2, output: 1.5 },

	// ─── Moonshot Kimi ────────────────────────────────────────────────────────
	// Kimi K2 — $0.60/$2.50, cached $0.15
	'kimi-k2': { cache_read: 0.15, input: 0.6, output: 2.5 }
};

/** Default pricing if model not found */
const DEFAULT_PRICING: ModelPricing = { input: 3.0, output: 15.0 };

/** Average characters per token (approximate for English text) */
const CHARS_PER_TOKEN = 4;

/** Typical completion/prompt ratio for code generation tasks */
const COMPLETION_RATIO = 0.3;

/**
 * Estimate token usage and cost for a set of messages
 *
 * @param messages - Array of LLM messages
 * @param model - Model name for pricing lookup
 * @returns Token estimate with cost
 */
export function estimateTokens(messages: LLMMessage[], model?: string): TokenEstimate {
	// Calculate prompt tokens from all messages using reduce
	const totalChars = messages.reduce((chars, message) => {
		// Add content length
		const contentLength = message.content?.length ?? 0;

		// Add overhead for message structure (role, etc.)
		const structureOverhead = 10;

		// Add tool call overhead if present
		const toolCallChars = (message.tool_calls ?? []).reduce(
			(toolChars, toolCall) => toolChars + toolCall.name.length + JSON.stringify(toolCall.arguments).length,
			0
		);

		return chars + contentLength + structureOverhead + toolCallChars;
	}, 0);

	const promptTokens = Math.ceil(totalChars / CHARS_PER_TOKEN);
	const estimatedCompletionTokens = Math.ceil(promptTokens * COMPLETION_RATIO);
	const totalTokens = promptTokens + estimatedCompletionTokens;

	// Calculate cost
	const pricing = MODEL_PRICING[model ?? ''] ?? DEFAULT_PRICING;
	const inputCost = (promptTokens / 1_000_000) * pricing.input;
	const outputCost = (estimatedCompletionTokens / 1_000_000) * pricing.output;
	const totalCost = inputCost + outputCost;

	return {
		estimatedCompletionTokens,
		estimatedCost: {
			amount: Math.round(totalCost * 10000) / 10000, // Round to 4 decimal places
			currency: 'USD'
		},
		promptTokens,
		totalTokens
	};
}

/**
 * Estimate tokens from a single string
 *
 * @param text - Text to estimate
 * @returns Approximate token count
 */
export function estimateTokensFromText(text: string): number {
	return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Format token estimate for display
 *
 * @param estimate - Token estimate to format
 * @returns Formatted string
 */
export function formatTokenEstimate(estimate: TokenEstimate): string {
	return [
		`  Prompt:     ~${estimate.promptTokens.toLocaleString()}`,
		`  Completion: ~${estimate.estimatedCompletionTokens.toLocaleString()}`,
		`  Total:      ~${estimate.totalTokens.toLocaleString()}`,
		`  Cost:       $${estimate.estimatedCost.amount.toFixed(4)} ${estimate.estimatedCost.currency}`
	].join('\n');
}

/**
 * Calculate actual cost from real usage data, including cache pricing
 *
 * @param usage - Actual token usage from API response
 * @param model - Model name for pricing lookup
 * @returns Total cost and cache savings in USD
 */
export interface ActualCostResult {
	cacheReadCost: number;
	cacheSavings: number;
	cacheWriteCost: number;
	inputCost: number;
	outputCost: number;
	totalCost: number;
	unknownModel: boolean;
}

export function calculateActualCost(usage: LLMUsage, model?: string): ActualCostResult {
	const pricing = MODEL_PRICING[model ?? ''];
	const unknownModel = pricing === undefined;
	const resolvedPricing = pricing ?? DEFAULT_PRICING;

	// Base input/output costs
	const inputCost = (usage.prompt_tokens / 1_000_000) * resolvedPricing.input;
	const outputCost = (usage.completion_tokens / 1_000_000) * resolvedPricing.output;

	// Cache costs (if present)
	const cacheWriteTokens = usage.cache_creation_input_tokens ?? 0;
	const cacheReadTokens = usage.cache_read_input_tokens ?? 0;

	const cacheWriteCost = resolvedPricing.cache_write ? (cacheWriteTokens / 1_000_000) * resolvedPricing.cache_write : 0;
	const cacheReadCost = resolvedPricing.cache_read ? (cacheReadTokens / 1_000_000) * resolvedPricing.cache_read : 0;

	// Savings: what those cached tokens would have cost at full input price
	const fullPriceForCachedTokens = (cacheReadTokens / 1_000_000) * resolvedPricing.input;
	const cacheSavings = fullPriceForCachedTokens - cacheReadCost;

	const totalCost = inputCost + outputCost + cacheWriteCost + cacheReadCost;

	return {
		cacheReadCost: Math.round(cacheReadCost * 10000) / 10000,
		cacheSavings: Math.round(cacheSavings * 10000) / 10000,
		cacheWriteCost: Math.round(cacheWriteCost * 10000) / 10000,
		inputCost: Math.round(inputCost * 10000) / 10000,
		outputCost: Math.round(outputCost * 10000) / 10000,
		totalCost: Math.round(totalCost * 10000) / 10000,
		unknownModel
	};
}

/**
 * Get pricing info for a model
 *
 * @param model - Model name
 * @returns Pricing info or undefined
 */
export function getModelPricing(model: string): ModelPricing | undefined {
	return MODEL_PRICING[model];
}

/**
 * Check if a model has known pricing
 *
 * @param model - Model name
 * @returns True if pricing is available
 */
export function hasKnownPricing(model: string): boolean {
	return model in MODEL_PRICING;
}
