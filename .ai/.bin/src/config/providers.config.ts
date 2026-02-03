/**
 * Centralized Provider Configuration
 *
 * Single source of truth for all LLM provider metadata, models, and capabilities.
 * This eliminates duplication across validation-helpers.ts, provider-resolver.ts, and other files.
 */

import { ModelName, ModelNameValue, ProviderName } from 'types/provider-names.types';

/**
 * Re-export for backward compatibility
 */
export { ModelName, ProviderName };
export type { ModelNameValue };

export interface ModelMode {
	mode: string;
	model: string;
}

/**
 * Context window sizes for models (in tokens)
 * These are approximate maximum context sizes for each model
 */
export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
	// Anthropic models - 200K context
	[ModelName.CLAUDE_HAIKU_3_5]: 200_000,
	[ModelName.CLAUDE_HAIKU_4_5]: 200_000,
	[ModelName.CLAUDE_OPUS_4]: 200_000,
	[ModelName.CLAUDE_OPUS_4_1]: 200_000,
	[ModelName.CLAUDE_OPUS_4_5]: 200_000,
	[ModelName.CLAUDE_SONNET_4]: 200_000,
	[ModelName.CLAUDE_SONNET_4_5]: 200_000,

	// Cursor models (inherit from underlying models)
	[ModelName.CURSOR_CLAUDE_3_5]: 200_000,
	[ModelName.CURSOR_GPT_4]: 128_000,
	[ModelName.CURSOR_SONNET_4_5]: 200_000,

	// Google models
	[ModelName.GEMINI_2_5_FLASH]: 1_000_000,
	[ModelName.GEMINI_2_5_FLASH_LITE]: 1_000_000,
	[ModelName.GEMINI_2_5_PRO]: 2_000_000,
	[ModelName.GEMINI_3_PRO]: 2_000_000,
	[ModelName.GEMMA_2]: 8_192,
	[ModelName.GEMMA_3]: 128_000,
	[ModelName.GEMMA_3N]: 128_000,

	// Moonshot models
	[ModelName.KIMI_K2]: 128_000,

	// OpenAI models
	[ModelName.GPT_5]: 256_000,
	[ModelName.GPT_5_1]: 256_000,
	[ModelName.GPT_5_MINI]: 256_000,
	[ModelName.GPT_5_NANO]: 128_000,
	[ModelName.O3]: 200_000,
	[ModelName.O3_PRO]: 200_000,
	[ModelName.O4_MINI]: 200_000,

	// xAI models
	[ModelName.GROK_4_1_FAST_NON_REASONING]: 256_000,
	[ModelName.GROK_4_1_FAST_REASONING]: 256_000,
	[ModelName.GROK_4_FAST_NON_REASONING]: 256_000,
	[ModelName.GROK_4_FAST_REASONING]: 256_000,
	[ModelName.GROK_CODE]: 256_000
};

/**
 * Default context window size for unknown models
 */
export const DEFAULT_CONTEXT_WINDOW = 128_000;

/**
 * Get context window size for a model
 */
export function getModelContextWindow(model: string): number {
	return MODEL_CONTEXT_WINDOWS[model] ?? DEFAULT_CONTEXT_WINDOW;
}

export interface ProviderMetadata {
	/** Internal provider key */
	key: ProviderName;
	/** Display name for UI */
	label: string;
	/** Default model for this provider */
	defaultModel: string;
	/** Available models with their modes */
	modelModes: Array<ModelMode>;
	/** Whether this provider requires an API key */
	requiresApiKey: boolean;
	/** Description for setup wizard */
	description?: string;
	/** Help text or notes */
	helpText?: string;
}

/**
 * Comprehensive provider registry
 */
export const PROVIDER_REGISTRY: Record<string, ProviderMetadata> = {
	[ProviderName.ANTHROPIC]: {
		defaultModel: ModelName.CLAUDE_OPUS_4_5,
		description: 'Claude models from Anthropic',
		key: ProviderName.ANTHROPIC,
		label: 'Anthropic',
		modelModes: [
			{ mode: 'normal', model: ModelName.CLAUDE_OPUS_4_5 },
			{ mode: 'extended thinking', model: ModelName.CLAUDE_OPUS_4_5 },
			{ mode: 'normal', model: ModelName.CLAUDE_OPUS_4 },
			{ mode: 'extended thinking', model: ModelName.CLAUDE_OPUS_4 },
			{ mode: 'normal', model: ModelName.CLAUDE_SONNET_4_5 },
			{ mode: 'extended thinking', model: ModelName.CLAUDE_SONNET_4_5 },
			{ mode: 'normal', model: ModelName.CLAUDE_SONNET_4 },
			{ mode: 'extended thinking', model: ModelName.CLAUDE_SONNET_4 },
			{ mode: 'normal', model: ModelName.CLAUDE_HAIKU_4_5 },
			{ mode: 'normal', model: ModelName.CLAUDE_HAIKU_3_5 }
		],
		requiresApiKey: true
	},
	[ProviderName.CURSOR]: {
		defaultModel: ModelName.CURSOR_SONNET_4_5,
		description: 'Zero config - uses your Cursor subscription',
		helpText: 'The Cursor provider uses your Cursor subscription via MCP. No API key needed!',
		key: ProviderName.CURSOR,
		label: 'Cursor',
		modelModes: [
			{ mode: 'normal', model: ModelName.CURSOR_SONNET_4_5 },
			{ mode: 'high reasoning', model: ModelName.CURSOR_GPT_4 },
			{ mode: 'normal', model: ModelName.CURSOR_CLAUDE_3_5 }
		],
		requiresApiKey: false
	},
	[ProviderName.GOOGLE]: {
		defaultModel: ModelName.GEMINI_2_5_PRO,
		description: 'Gemini models from Google',
		key: ProviderName.GOOGLE,
		label: 'Google',
		modelModes: [
			{ mode: 'default', model: ModelName.GEMINI_3_PRO },
			{ mode: 'deep-think', model: ModelName.GEMINI_3_PRO },
			{ mode: 'default', model: ModelName.GEMINI_2_5_PRO },
			{ mode: 'default', model: ModelName.GEMINI_2_5_FLASH },
			{ mode: 'default', model: ModelName.GEMINI_2_5_FLASH_LITE },
			{ mode: 'default', model: ModelName.GEMMA_3N },
			{ mode: 'default', model: ModelName.GEMMA_3 },
			{ mode: 'default', model: ModelName.GEMMA_2 }
		],
		requiresApiKey: true
	},
	[ProviderName.MOONSHOT]: {
		defaultModel: ModelName.KIMI_K2,
		description: 'Kimi models from Moonshot',
		key: ProviderName.MOONSHOT,
		label: 'Moonshot',
		modelModes: [{ mode: 'default', model: ModelName.KIMI_K2 }],
		requiresApiKey: true
	},
	[ProviderName.OPENAI]: {
		defaultModel: ModelName.GPT_5,
		description: 'GPT models from OpenAI',
		key: ProviderName.OPENAI,
		label: 'OpenAI',
		modelModes: [
			{ mode: 'minimal reasoning', model: ModelName.GPT_5 },
			{ mode: 'low reasoning', model: ModelName.GPT_5 },
			{ mode: 'medium reasoning', model: ModelName.GPT_5 },
			{ mode: 'high reasoning', model: ModelName.GPT_5 },
			{ mode: 'minimal reasoning', model: ModelName.GPT_5_MINI },
			{ mode: 'low reasoning', model: ModelName.GPT_5_MINI },
			{ mode: 'medium reasoning', model: ModelName.GPT_5_MINI },
			{ mode: 'high reasoning', model: ModelName.GPT_5_MINI },
			{ mode: 'minimal reasoning', model: ModelName.GPT_5_NANO },
			{ mode: 'low reasoning', model: ModelName.GPT_5_NANO },
			{ mode: 'medium reasoning', model: ModelName.GPT_5_NANO },
			{ mode: 'high reasoning', model: ModelName.GPT_5_NANO },
			{ mode: 'none reasoning', model: ModelName.GPT_5_1 },
			{ mode: 'low reasoning', model: ModelName.GPT_5_1 },
			{ mode: 'medium reasoning', model: ModelName.GPT_5_1 },
			{ mode: 'high reasoning', model: ModelName.GPT_5_1 },
			{ mode: 'low reasoning', model: ModelName.O3 },
			{ mode: 'medium reasoning', model: ModelName.O3 },
			{ mode: 'high reasoning', model: ModelName.O3 },
			{ mode: 'high reasoning', model: ModelName.O3_PRO },
			{ mode: 'low reasoning', model: ModelName.O4_MINI },
			{ mode: 'medium reasoning', model: ModelName.O4_MINI },
			{ mode: 'high reasoning', model: ModelName.O4_MINI }
		],
		requiresApiKey: true
	},
	[ProviderName.XAI]: {
		defaultModel: ModelName.GROK_CODE,
		description: 'Grok models from xAI',
		// TODO: Verify xAI's actual API model names when official documentation is available
		key: ProviderName.XAI,
		label: 'xAI',
		modelModes: [
			{ mode: 'default', model: ModelName.GROK_CODE },
			{ mode: 'reasoning', model: ModelName.GROK_4_1_FAST_REASONING },
			{ mode: 'non-reasoning', model: ModelName.GROK_4_1_FAST_NON_REASONING },
			{ mode: 'reasoning', model: ModelName.GROK_4_FAST_REASONING },
			{ mode: 'non-reasoning', model: ModelName.GROK_4_FAST_NON_REASONING }
		],
		requiresApiKey: true
	}
} as const;

/**
 * Provider keys as a type-safe array
 */
export const PROVIDER_KEYS = Object.values(ProviderName) as Array<ProviderName>;

/**
 * Get all provider keys
 */
export function getAllProviderKeys(): Array<string> {
	return PROVIDER_KEYS as unknown as Array<string>;
}

/**
 * Get provider metadata by key
 */
export function getProviderMetadata(key: string): ProviderMetadata | undefined {
	return PROVIDER_REGISTRY[key];
}

/**
 * Get all providers that require API keys
 */
export function getProvidersRequiringApiKey(): Array<ProviderMetadata> {
	return PROVIDER_KEYS.map((key) => PROVIDER_REGISTRY[key]).filter(
		(p): p is ProviderMetadata => p !== undefined && p.requiresApiKey
	);
}

/**
 * Get all providers that don't require API keys
 */
export function getProvidersWithoutApiKey(): Array<ProviderMetadata> {
	return PROVIDER_KEYS.map((key) => PROVIDER_REGISTRY[key]).filter(
		(p): p is ProviderMetadata => p !== undefined && !p.requiresApiKey
	);
}

/**
 * Check if a model exists for a provider
 */
export function hasModel(providerKey: string, model: string): boolean {
	const provider = PROVIDER_REGISTRY[providerKey];
	if (!provider) return false;
	return provider.modelModes.some((mm) => mm.model === model);
}

/**
 * Get all unique models for a provider
 */
export function getProviderModels(providerKey: string): Array<string> {
	const provider = PROVIDER_REGISTRY[providerKey];
	if (!provider) return [];

	// Extract unique models from modelModes
	const uniqueModels = new Set<string>();
	provider.modelModes.forEach((mm: ModelMode) => {
		uniqueModels.add(mm.model);
	});

	return Array.from(uniqueModels);
}

/**
 * Get all unique models across all providers
 */
export function getAllModels(): Array<string> {
	const models = new Set<string>();
	PROVIDER_KEYS.forEach((key) => {
		PROVIDER_REGISTRY[key]?.modelModes.forEach((mm: ModelMode) => {
			models.add(mm.model);
		});
	});
	return Array.from(models).sort();
}

/**
 * Get default model for a provider
 */
export function getDefaultModel(providerKey: string): string | undefined {
	const provider = PROVIDER_REGISTRY[providerKey];
	return provider?.defaultModel;
}

/**
 * Validate provider key
 */
export function isValidProvider(key: string): key is ProviderName {
	return Object.values(ProviderName).includes(key as ProviderName);
}
