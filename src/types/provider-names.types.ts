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
	CLAUDE_FABLE_5: 'claude-fable-5',
	CLAUDE_HAIKU_4_5: 'claude-haiku-4.5',
	CLAUDE_OPUS_4_1: 'claude-opus-4.1',
	CLAUDE_OPUS_4_5: 'claude-opus-4.5',
	CLAUDE_OPUS_4_6: 'claude-opus-4.6',
	CLAUDE_OPUS_4_6_FAST: 'claude-opus-4.6-fast',
	CLAUDE_OPUS_4_7: 'claude-opus-4.7',
	CLAUDE_OPUS_4_7_FAST: 'claude-opus-4.7-fast',
	CLAUDE_OPUS_4_8: 'claude-opus-4.8',
	CLAUDE_OPUS_4_8_FAST: 'claude-opus-4.8-fast',
	CLAUDE_SONNET_4_5: 'claude-sonnet-4.5',
	CLAUDE_SONNET_4_6: 'claude-sonnet-4.6',
	CLAUDE_SONNET_5: 'claude-sonnet-5',

	// Cursor models (in-house + frontier passthroughs via the Cursor subscription)
	CURSOR_COMPOSER_2_5: 'cursor-composer-2.5',
	CURSOR_FABLE_5: 'cursor-fable-5',
	CURSOR_FUSION: 'cursor-fusion',
	CURSOR_GEMINI_3_5_FLASH: 'cursor-gemini-3.5-flash',
	CURSOR_GPT_5_5: 'cursor-gpt-5.5',
	CURSOR_GROK_4_3: 'cursor-grok-4.3',
	CURSOR_OPUS_4_8: 'cursor-opus-4.8',
	CURSOR_SONNET_4_5: 'cursor-sonnet-4.5',
	CURSOR_SONNET_4_6: 'cursor-sonnet-4.6',

	// Google models
	GEMINI_2_5_FLASH: 'gemini-2.5-flash',
	GEMINI_2_5_FLASH_LITE: 'gemini-2.5-flash-lite',
	GEMINI_2_5_PRO: 'gemini-2.5-pro',
	GEMINI_3_1_FLASH_LITE: 'gemini-3.1-flash-lite',
	GEMINI_3_5_FLASH: 'gemini-3.5-flash',
	GEMINI_3_5_PRO: 'gemini-3.5-pro',
	GEMINI_3_PRO: 'gemini-3-pro',
	GEMMA_3: 'gemma-3',
	GEMMA_3N: 'gemma-3n',
	GEMMA_4: 'gemma-4',

	// Moonshot models
	KIMI_K2_5: 'kimi-k2.5',
	KIMI_K2_6: 'kimi-k2.6',
	KIMI_K2_7_CODE: 'kimi-k2.7-code',
	KIMI_K2_7_CODE_HIGHSPEED: 'kimi-k2.7-code-highspeed',

	// OpenAI models
	GPT_5: 'gpt-5',
	GPT_5_1: 'gpt-5.1',
	GPT_5_5: 'gpt-5.5',
	GPT_5_6_LUNA: 'gpt-5.6-luna',
	GPT_5_6_SOL: 'gpt-5.6-sol',
	GPT_5_6_TERRA: 'gpt-5.6-terra',
	GPT_5_MINI: 'gpt-5-mini',
	GPT_5_NANO: 'gpt-5-nano',
	O3: 'o3',
	O3_PRO: 'o3-pro',
	O4_MINI: 'o4-mini',

	// xAI models
	GROK_4_3: 'grok-4.3',
	GROK_4_20_MULTI_AGENT: 'grok-4.20-multi-agent-0309',
	GROK_4_20_NON_REASONING: 'grok-4.20-0309-non-reasoning',
	GROK_4_20_REASONING: 'grok-4.20-0309-reasoning',
	GROK_BUILD_0_1: 'grok-build-0.1'
} as const;

export type ModelNameValue = (typeof ModelName)[keyof typeof ModelName];
