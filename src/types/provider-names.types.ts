/**
 * Provider and Model Name Type Definitions
 *
 * These are fundamental types that define available providers and models.
 * Extracted from config layer to avoid circular dependencies.
 */

/**
 * Type-safe provider names enum
 * Use this instead of hard-coded strings for provider comparisons
 */
export enum ProviderName {
	ANTHROPIC = 'anthropic',
	CURSOR = 'cursor',
	GOOGLE = 'google',
	MOONSHOT = 'moonshot',
	OPENAI = 'openai',
	XAI = 'xai'
}

/**
 * Commonly used model names as constants
 * Use these for type-safe model comparisons
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- PascalCase for const enum object following TypeScript enum pattern
export const ModelName = {
	// Anthropic models
	CLAUDE_HAIKU_3_5: 'claude-haiku-3.5',
	CLAUDE_HAIKU_4_5: 'claude-haiku-4.5',
	CLAUDE_OPUS_4: 'claude-opus-4',
	CLAUDE_OPUS_4_1: 'claude-opus-4.1',
	CLAUDE_OPUS_4_5: 'claude-opus-4.5',
	CLAUDE_SONNET_4: 'claude-sonnet-4',
	CLAUDE_SONNET_4_5: 'claude-sonnet-4.5',

	// Cursor models
	CURSOR_CLAUDE_3_5: 'cursor-claude-3.5',
	CURSOR_GPT_4: 'cursor-gpt-4',
	CURSOR_SONNET_4_5: 'cursor-sonnet-4.5',

	// Google models
	GEMINI_2_5_FLASH: 'gemini-2.5-flash',
	GEMINI_2_5_FLASH_LITE: 'gemini-2.5-flash-lite',
	GEMINI_2_5_PRO: 'gemini-2.5-pro',
	GEMINI_3_PRO: 'gemini-3-pro',
	GEMMA_2: 'gemma-2',
	GEMMA_3: 'gemma-3',
	GEMMA_3N: 'gemma-3n',

	// Moonshot models
	KIMI_K2: 'kimi-k2',

	// OpenAI models
	GPT_5: 'gpt-5',
	GPT_5_1: 'gpt-5.1',
	GPT_5_MINI: 'gpt-5-mini',
	GPT_5_NANO: 'gpt-5-nano',
	O3: 'o3',
	O3_PRO: 'o3-pro',
	O4_MINI: 'o4-mini',

	// xAI models
	GROK_4_1_FAST_NON_REASONING: 'grok-4-1-fast-non-reasoning',
	GROK_4_1_FAST_REASONING: 'grok-4-1-fast-reasoning',
	GROK_4_FAST_NON_REASONING: 'grok-4-fast-non-reasoning',
	GROK_4_FAST_REASONING: 'grok-4-fast-reasoning',
	GROK_CODE: 'grok-code'
} as const;

export type ModelNameValue = (typeof ModelName)[keyof typeof ModelName];
