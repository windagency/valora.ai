/**
 * Cursor model catalog — single source of truth for the Cursor provider.
 * SDK-free: imports only from the types layer. See anthropic.models.ts for rationale.
 *
 * Cursor is used via the Cursor subscription (MCP sampling), so there is no
 * per-token pricing here — cost is covered by the subscription.
 */

import type { ProviderDescriptor } from 'plugins/plugin-api.types';

import { ModelName } from 'types/provider-names.types';

export const CURSOR_DESCRIPTOR: ProviderDescriptor = {
	contextWindows: {
		[ModelName.CURSOR_COMPOSER_2_5]: 256_000,
		[ModelName.CURSOR_FABLE_5]: 1_000_000,
		[ModelName.CURSOR_FUSION]: 256_000,
		[ModelName.CURSOR_GEMINI_3_5_FLASH]: 1_000_000,
		[ModelName.CURSOR_GPT_5_5]: 1_000_000,
		[ModelName.CURSOR_GROK_4_3]: 1_000_000,
		[ModelName.CURSOR_OPUS_4_8]: 1_000_000,
		[ModelName.CURSOR_SONNET_4_5]: 200_000,
		[ModelName.CURSOR_SONNET_4_6]: 1_000_000
	},
	defaultModel: ModelName.CURSOR_SONNET_4_6,
	description: 'Zero config - uses your Cursor subscription',
	helpText: 'The Cursor provider uses your Cursor subscription via MCP. No API key needed!',
	label: 'Cursor',
	modelModes: [
		// In-house Cursor models
		{ mode: 'default', model: ModelName.CURSOR_COMPOSER_2_5 },
		{ mode: 'default', model: ModelName.CURSOR_FUSION },
		// Frontier passthroughs via the Cursor subscription
		{ mode: 'normal', model: ModelName.CURSOR_SONNET_4_6 },
		{ mode: 'normal', model: ModelName.CURSOR_SONNET_4_5 },
		{ mode: 'high reasoning', model: ModelName.CURSOR_OPUS_4_8 },
		{ mode: 'high reasoning', model: ModelName.CURSOR_FABLE_5 },
		{ mode: 'high reasoning', model: ModelName.CURSOR_GPT_5_5 },
		{ mode: 'default', model: ModelName.CURSOR_GEMINI_3_5_FLASH },
		{ mode: 'reasoning', model: ModelName.CURSOR_GROK_4_3 }
	],
	requiresApiKey: false
};
