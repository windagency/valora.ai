/**
 * OpenRouter model slugs — vendor/model format used by openrouter.ai.
 * Defined locally so the plugin is self-contained and does not import
 * runtime values from core.
 */
export const OPENROUTER_MODELS = {
	CLAUDE_SONNET_4_5: 'anthropic/claude-sonnet-4.5',
	GEMMA_4_31B_FREE: 'google/gemma-4-31b-it:free',
	GPT_4O: 'openai/gpt-4o',
	LLAMA_3_3_70B: 'meta-llama/llama-3.3-70b-instruct',
	MISTRAL_LARGE: 'mistralai/mistral-large'
} as const;
