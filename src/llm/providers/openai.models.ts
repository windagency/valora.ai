/**
 * OpenAI model catalog — single source of truth for the OpenAI provider.
 * SDK-free: imports only from the types layer. See anthropic.models.ts for rationale.
 */

import type { ProviderDescriptor } from 'plugins/plugin-api.types';

import { ModelName } from 'types/provider-names.types';

export const OPENAI_DESCRIPTOR: ProviderDescriptor = {
	contextWindows: {
		[ModelName.GPT_5]: 256_000,
		[ModelName.GPT_5_1]: 256_000,
		[ModelName.GPT_5_5]: 1_000_000,
		[ModelName.GPT_5_6_LUNA]: 256_000,
		[ModelName.GPT_5_6_SOL]: 256_000,
		[ModelName.GPT_5_6_TERRA]: 256_000,
		[ModelName.GPT_5_MINI]: 256_000,
		[ModelName.GPT_5_NANO]: 128_000,
		[ModelName.O3]: 200_000,
		[ModelName.O3_PRO]: 200_000,
		[ModelName.O4_MINI]: 200_000
	},
	defaultModel: ModelName.GPT_5_5,
	description: 'GPT models from OpenAI',
	label: 'OpenAI',
	modelModes: [
		{ mode: 'minimal reasoning', model: ModelName.GPT_5_5 },
		{ mode: 'low reasoning', model: ModelName.GPT_5_5 },
		{ mode: 'medium reasoning', model: ModelName.GPT_5_5 },
		{ mode: 'high reasoning', model: ModelName.GPT_5_5 },
		// GPT-5.6 family (Sol/Terra/Luna) is in limited preview (gated to select orgs); most API keys cannot call it yet.
		{ mode: 'low reasoning', model: ModelName.GPT_5_6_SOL },
		{ mode: 'medium reasoning', model: ModelName.GPT_5_6_SOL },
		{ mode: 'high reasoning', model: ModelName.GPT_5_6_SOL },
		{ mode: 'low reasoning', model: ModelName.GPT_5_6_TERRA },
		{ mode: 'medium reasoning', model: ModelName.GPT_5_6_TERRA },
		{ mode: 'high reasoning', model: ModelName.GPT_5_6_TERRA },
		{ mode: 'low reasoning', model: ModelName.GPT_5_6_LUNA },
		{ mode: 'medium reasoning', model: ModelName.GPT_5_6_LUNA },
		{ mode: 'high reasoning', model: ModelName.GPT_5_6_LUNA },
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
	// GPT-5 family uses automatic caching (no cache_write surcharge).
	pricing: {
		[ModelName.GPT_5]: { cache_read: 0.125, input: 1.25, output: 10.0 },
		[ModelName.GPT_5_1]: { cache_read: 0.175, input: 1.75, output: 14.0 },
		[ModelName.GPT_5_6_LUNA]: { cache_read: 0.1, input: 1.0, output: 6.0 },
		[ModelName.GPT_5_6_SOL]: { cache_read: 0.5, input: 5.0, output: 30.0 },
		[ModelName.GPT_5_6_TERRA]: { cache_read: 0.25, input: 2.5, output: 15.0 },
		[ModelName.GPT_5_MINI]: { cache_read: 0.025, input: 0.25, output: 1.5 },
		[ModelName.GPT_5_NANO]: { cache_read: 0.01, input: 0.1, output: 0.4 },
		[ModelName.O3]: { cache_read: 1.0, input: 2.0, output: 8.0 },
		[ModelName.O3_PRO]: { cache_read: 5.0, input: 20.0, output: 80.0 },
		[ModelName.O4_MINI]: { cache_read: 0.275, input: 1.1, output: 4.4 }
	},
	requiresApiKey: true
};
