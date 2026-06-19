/**
 * Provider and Model Name Type Definitions
 *
 * These are fundamental types that define available providers and models.
 * Extracted from config layer to avoid circular dependencies.
 */

/**
 * Branded string type for provider names.
 * Prevents accidental use of raw strings where a ProviderName is expected,
 * while allowing plugin-contributed names (arbitrary strings) to share the type.
 * Use `providerName(s)` to brand a raw string at system boundaries.
 */
export type ProviderName = string & { readonly __brand: 'ProviderName' };

/**
 * Brand a raw string as a ProviderName.
 * Call this at system boundaries (CLI arg parsing, config loading, plugin registration)
 * where a raw string enters the system and must become a ProviderName.
 */
export function providerName(s: string): ProviderName {
	return s as ProviderName;
}

/**
 * Built-in provider name constants.
 * Use these wherever the old `ProviderName.ANTHROPIC` enum members were used as values.
 */
export const BuiltinProviders = {
	ANTHROPIC: providerName('anthropic'),
	CURSOR: providerName('cursor'),
	GOOGLE: providerName('google'),
	LOCAL: providerName('local'),
	MOONSHOT: providerName('moonshot'),
	OPENAI: providerName('openai'),
	XAI: providerName('xai')
} as const;

/**
 * Commonly used model names as constants
 * Use these for type-safe model comparisons
 */

export const ModelName = {
	// Anthropic models
	CLAUDE_HAIKU_3_5: 'claude-haiku-3.5',
	CLAUDE_HAIKU_4_5: 'claude-haiku-4.5',
	CLAUDE_OPUS_4: 'claude-opus-4',
	CLAUDE_OPUS_4_1: 'claude-opus-4.1',
	CLAUDE_OPUS_4_5: 'claude-opus-4.5',
	CLAUDE_OPUS_4_6: 'claude-opus-4.6',
	CLAUDE_SONNET_4: 'claude-sonnet-4',
	CLAUDE_SONNET_4_5: 'claude-sonnet-4.5',
	CLAUDE_SONNET_4_6: 'claude-sonnet-4.6',

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
