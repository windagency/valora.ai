/**
 * Token and Cost Estimator
 *
 * Estimates token usage and cost for LLM API calls.
 * Uses approximate token counting (4 characters per token for English text).
 *
 * Pricing is NOT owned here — it is sourced from the provider descriptors (the
 * single source of truth) via `getModelPricing` from `config/providers.config`.
 * This module only turns that pricing into token/cost estimates.
 */

import type { LLMMessage, LLMUsage } from 'types/llm.types';
import type { ModelPricing } from 'types/model.types';

import { getModelPricing as lookupModelPricing } from 'config/providers.config';

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
	const pricing = lookupModelPricing(model ?? '') ?? DEFAULT_PRICING;
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
	const pricing = lookupModelPricing(model ?? '');
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
 * Get pricing info for a model (sourced from the provider descriptors)
 *
 * @param model - Model name (registry alias or resolved API id)
 * @returns Pricing info or undefined
 */
export function getModelPricing(model: string): ModelPricing | undefined {
	return lookupModelPricing(model);
}

/**
 * Check if a model has known pricing
 *
 * @param model - Model name
 * @returns True if pricing is available
 */
export function hasKnownPricing(model: string): boolean {
	return lookupModelPricing(model) !== undefined;
}
