/**
 * Token and Cost Estimator
 *
 * Estimates token usage and cost for LLM API calls.
 * Uses approximate token counting (4 characters per token for English text).
 */

import type { LLMMessage } from 'types/llm.types';

export interface TokenEstimate {
	/** Estimated cost in USD */
	estimatedCost: { amount: number; currency: 'USD' };
	/** Estimated completion tokens (based on typical response ratios) */
	estimatedCompletionTokens: number;
	/** Prompt tokens (input) */
	promptTokens: number;
	/** Total estimated tokens */
	totalTokens: number;
}

/**
 * Model pricing per 1K tokens (approximate as of 2024)
 * Format: { input: pricePerMillion, output: pricePerMillion }
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
	// Anthropic models
	'claude-3-5-haiku-20241022': { input: 1.0, output: 5.0 },
	'claude-3-5-haiku-latest': { input: 1.0, output: 5.0 },
	'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
	'claude-3-5-sonnet-latest': { input: 3.0, output: 15.0 },
	'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
	'claude-3-opus-20240229': { input: 15.0, output: 75.0 },
	'claude-3-sonnet-20240229': { input: 3.0, output: 15.0 },
	// OpenAI models
	'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
	'gpt-4': { input: 30.0, output: 60.0 },
	'gpt-4-turbo': { input: 10.0, output: 30.0 },
	'gpt-4o': { input: 2.5, output: 10.0 },
	'gpt-4o-mini': { input: 0.15, output: 0.6 },
	// Google models
	'gemini-1.5-flash': { input: 0.075, output: 0.3 },
	'gemini-1.5-pro': { input: 1.25, output: 5.0 },
	'gemini-2.0-flash-exp': { input: 0.075, output: 0.3 }
};

/** Default pricing if model not found */
const DEFAULT_PRICING = { input: 3.0, output: 15.0 };

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
 * Get pricing info for a model
 *
 * @param model - Model name
 * @returns Pricing info or undefined
 */
export function getModelPricing(model: string): undefined | { input: number; output: number } {
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
