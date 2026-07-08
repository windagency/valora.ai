/**
 * Moonshot (Kimi) model catalog — single source of truth for the Moonshot provider.
 * SDK-free: imports only from the types layer. See anthropic.models.ts for rationale.
 */

import type { ProviderDescriptor } from 'plugins/plugin-api.types';

import { ModelName } from 'types/provider-names.types';

export const MOONSHOT_DESCRIPTOR: ProviderDescriptor = {
	contextWindows: {
		[ModelName.KIMI_K2_5]: 256_000,
		[ModelName.KIMI_K2_6]: 256_000,
		[ModelName.KIMI_K2_7_CODE]: 256_000,
		[ModelName.KIMI_K2_7_CODE_HIGHSPEED]: 256_000
	},
	defaultModel: ModelName.KIMI_K2_6,
	description: 'Kimi models from Moonshot',
	label: 'Moonshot',
	modelModes: [
		{ mode: 'default', model: ModelName.KIMI_K2_6 },
		{ mode: 'thinking', model: ModelName.KIMI_K2_6 },
		{ mode: 'default', model: ModelName.KIMI_K2_7_CODE },
		{ mode: 'high-speed', model: ModelName.KIMI_K2_7_CODE_HIGHSPEED },
		{ mode: 'default', model: ModelName.KIMI_K2_5 }
	],
	pricing: {
		[ModelName.KIMI_K2_6]: { input: 0.95, output: 4.0 }
	},
	requiresApiKey: true
};
