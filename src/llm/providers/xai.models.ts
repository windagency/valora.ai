/**
 * xAI (Grok) model catalog — single source of truth for the xAI provider.
 * SDK-free: imports only from the types layer. See anthropic.models.ts for rationale.
 */

import type { ProviderDescriptor } from 'plugins/plugin-api.types';

import { ModelName } from 'types/provider-names.types';

export const XAI_DESCRIPTOR: ProviderDescriptor = {
	contextWindows: {
		[ModelName.GROK_4_3]: 1_000_000,
		[ModelName.GROK_4_20_MULTI_AGENT]: 1_000_000,
		[ModelName.GROK_4_20_NON_REASONING]: 1_000_000,
		[ModelName.GROK_4_20_REASONING]: 1_000_000,
		[ModelName.GROK_BUILD_0_1]: 256_000
	},
	defaultModel: ModelName.GROK_4_3,
	description: 'Grok models from xAI',
	label: 'xAI',
	modelModes: [
		{ mode: 'default', model: ModelName.GROK_4_3 },
		{ mode: 'reasoning', model: ModelName.GROK_4_20_REASONING },
		{ mode: 'non-reasoning', model: ModelName.GROK_4_20_NON_REASONING },
		{ mode: 'multi-agent', model: ModelName.GROK_4_20_MULTI_AGENT },
		{ mode: 'code', model: ModelName.GROK_BUILD_0_1 }
	],
	pricing: {
		[ModelName.GROK_4_3]: { cache_read: 0.05, input: 1.25, output: 2.5 }
	},
	requiresApiKey: true
};

/**
 * Models that select reasoning depth via a dedicated `reasoning` mode/model variant
 * instead of `temperature`/`top_p`. The xAI API rejects both as unsupported for these
 * models. Matched by exact mode equality (not substring) so `non-reasoning` doesn't match.
 */
export const REASONING_CONTROLLED_MODELS: ReadonlySet<string> = new Set(
	XAI_DESCRIPTOR.modelModes.filter((mm) => mm.mode === 'reasoning').map((mm) => mm.model)
);
