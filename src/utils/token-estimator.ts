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
 * Model pricing per million tokens (approximate as of 2024)
 * cache_write: cost per million tokens for writing to cache (1.25x input)
 * cache_read: cost per million tokens for reading from cache (0.1x input)
 */
interface ModelPricing {
	cache_read?: number;
	cache_write?: number;
	input: number;
	output: number;
}

const MODEL_PRICING: Record<string, ModelPricing> = {
	// Anthropic models (with cache pricing)
	'claude-3-5-haiku-20241022': { cache_read: 0.1, cache_write: 1.25, input: 1.0, output: 5.0 },
	'claude-3-5-haiku-latest': { cache_read: 0.1, cache_write: 1.25, input: 1.0, output: 5.0 },
	'claude-3-5-sonnet-20241022': { cache_read: 0.3, cache_write: 3.75, input: 3.0, output: 15.0 },
	'claude-3-5-sonnet-latest': { cache_read: 0.3, cache_write: 3.75, input: 3.0, output: 15.0 },
	'claude-3-haiku-20240307': { cache_read: 0.025, cache_write: 0.3125, input: 0.25, output: 1.25 },
	'claude-3-opus-20240229': { cache_read: 1.5, cache_write: 18.75, input: 15.0, output: 75.0 },
	'claude-3-sonnet-20240229': { cache_read: 0.3, cache_write: 3.75, input: 3.0, output: 15.0 },
	// OpenAI models (automatic caching: cached reads at 50% discount, no write surcharge)
	'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
	'gpt-4': { input: 30.0, output: 60.0 },
	'gpt-4-turbo': { cache_read: 5.0, input: 10.0, output: 30.0 },
	'gpt-4o': { cache_read: 1.25, input: 2.5, output: 10.0 },
	'gpt-4o-mini': { cache_read: 0.075, input: 0.15, output: 0.6 },
	// Google models (context caching: cached reads at 75% discount)
	'gemini-1.5-flash': { cache_read: 0.01875, input: 0.075, output: 0.3 },
	'gemini-1.5-pro': { cache_read: 0.3125, input: 1.25, output: 5.0 },
	'gemini-2.0-flash-exp': { cache_read: 0.01875, input: 0.075, output: 0.3 }
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
export function calculateActualCost(usage: LLMUsage, model?: string): { cacheSavings: number; totalCost: number } {
	const pricing = MODEL_PRICING[model ?? ''] ?? DEFAULT_PRICING;

	// Base input/output costs
	const inputCost = (usage.prompt_tokens / 1_000_000) * pricing.input;
	const outputCost = (usage.completion_tokens / 1_000_000) * pricing.output;

	// Cache costs (if present)
	const cacheWriteTokens = usage.cache_creation_input_tokens ?? 0;
	const cacheReadTokens = usage.cache_read_input_tokens ?? 0;

	const cacheWriteCost = pricing.cache_write ? (cacheWriteTokens / 1_000_000) * pricing.cache_write : 0;
	const cacheReadCost = pricing.cache_read ? (cacheReadTokens / 1_000_000) * pricing.cache_read : 0;

	// Savings: what those cached tokens would have cost at full input price
	const fullPriceForCachedTokens = (cacheReadTokens / 1_000_000) * pricing.input;
	const cacheSavings = fullPriceForCachedTokens - cacheReadCost;

	const totalCost = inputCost + outputCost + cacheWriteCost + cacheReadCost;

	return {
		cacheSavings: Math.round(cacheSavings * 10000) / 10000,
		totalCost: Math.round(totalCost * 10000) / 10000
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
