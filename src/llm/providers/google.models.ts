/**
 * Google (Gemini) model catalog — single source of truth for the Google provider.
 * SDK-free: imports only from the types layer. See anthropic.models.ts for rationale.
 */

import type { ProviderDescriptor } from 'plugins/plugin-api.types';

import { ModelName } from 'types/provider-names.types';

export const GOOGLE_DESCRIPTOR: ProviderDescriptor = {
	contextWindows: {
		[ModelName.GEMINI_2_5_FLASH]: 1_000_000,
		[ModelName.GEMINI_2_5_FLASH_LITE]: 1_000_000,
		[ModelName.GEMINI_2_5_PRO]: 2_000_000,
		[ModelName.GEMINI_3_1_FLASH_LITE]: 1_000_000,
		[ModelName.GEMINI_3_5_FLASH]: 1_000_000,
		[ModelName.GEMINI_3_5_PRO]: 2_000_000,
		[ModelName.GEMINI_3_PRO]: 2_000_000,
		[ModelName.GEMMA_3]: 128_000,
		[ModelName.GEMMA_3N]: 128_000,
		[ModelName.GEMMA_4]: 256_000
	},
	defaultModel: ModelName.GEMINI_3_5_FLASH,
	description: 'Gemini models from Google',
	label: 'Google',
	modelModes: [
		// Gemini 3.5 Pro is rolling out (limited preview as of July 2026); Flash is generally available.
		{ mode: 'default', model: ModelName.GEMINI_3_5_PRO },
		{ mode: 'deep-think', model: ModelName.GEMINI_3_5_PRO },
		{ mode: 'default', model: ModelName.GEMINI_3_5_FLASH },
		{ mode: 'default', model: ModelName.GEMINI_3_PRO },
		{ mode: 'deep-think', model: ModelName.GEMINI_3_PRO },
		{ mode: 'default', model: ModelName.GEMINI_3_1_FLASH_LITE },
		{ mode: 'default', model: ModelName.GEMINI_2_5_PRO },
		{ mode: 'default', model: ModelName.GEMINI_2_5_FLASH },
		{ mode: 'default', model: ModelName.GEMINI_2_5_FLASH_LITE },
		{ mode: 'default', model: ModelName.GEMMA_4 },
		{ mode: 'default', model: ModelName.GEMMA_3N },
		{ mode: 'default', model: ModelName.GEMMA_3 }
	],
	// Gemma open models have no public per-token price; 3.5 tiers pending public pricing.
	pricing: {
		[ModelName.GEMINI_2_5_FLASH]: { cache_read: 0.03, input: 0.3, output: 2.5 },
		[ModelName.GEMINI_2_5_FLASH_LITE]: { cache_read: 0.01, input: 0.1, output: 0.4 },
		[ModelName.GEMINI_2_5_PRO]: { cache_read: 0.125, input: 1.25, output: 10.0 },
		[ModelName.GEMINI_3_PRO]: { cache_read: 0.2, input: 2.0, output: 12.0 }
	},
	requiresApiKey: true
};
