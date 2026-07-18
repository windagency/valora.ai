/**
 * Anthropic model catalog — single source of truth for the Anthropic provider.
 *
 * SDK-free by design: this module imports only from the types layer so it can be
 * aggregated by `config/providers.config.ts` without dragging in the Anthropic
 * SDK. The provider implementation (`anthropic.provider.ts`) imports and
 * registers this descriptor; every other component consumes it.
 *
 * Owns: model/mode list, context windows, pricing, and the alias→API-id mapping
 * (standard + Vertex) that previously lived in `llm/model-mapping-registry.ts`.
 */

import type { ProviderDescriptor } from 'plugins/plugin-api.types';

import { BuiltinProviders, ModelName } from 'types/provider-names.types';

const OPUS_PRICING = { cache_read: 0.5, cache_write: 6.25, input: 5.0, output: 25.0 };
const SONNET_PRICING = { cache_read: 0.3, cache_write: 3.75, input: 3.0, output: 15.0 };

export const ANTHROPIC_DESCRIPTOR: ProviderDescriptor = {
	apiModelIds: {
		[ModelName.CLAUDE_FABLE_5]: { standard: 'claude-fable-5', vertex: 'claude-fable-5' },
		[ModelName.CLAUDE_HAIKU_4_5]: { standard: 'claude-haiku-4-5-20251001', vertex: 'claude-haiku-4-5@20251001' },
		[ModelName.CLAUDE_OPUS_4_1]: { standard: 'claude-opus-4-1-20250805', vertex: 'claude-opus-4-1@20250805' },
		[ModelName.CLAUDE_OPUS_4_5]: { standard: 'claude-opus-4-5-20251101', vertex: 'claude-opus-4-5@20251101' },
		[ModelName.CLAUDE_OPUS_4_6]: { standard: 'claude-opus-4-6', vertex: 'claude-opus-4-6' },
		[ModelName.CLAUDE_OPUS_4_6_FAST]: { standard: 'claude-opus-4-6-fast', vertex: 'claude-opus-4-6-fast' },
		[ModelName.CLAUDE_OPUS_4_7]: { standard: 'claude-opus-4-7', vertex: 'claude-opus-4-7' },
		[ModelName.CLAUDE_OPUS_4_7_FAST]: { standard: 'claude-opus-4-7-fast', vertex: 'claude-opus-4-7-fast' },
		[ModelName.CLAUDE_OPUS_4_8]: { standard: 'claude-opus-4-8', vertex: 'claude-opus-4-8' },
		[ModelName.CLAUDE_OPUS_4_8_FAST]: { standard: 'claude-opus-4-8-fast', vertex: 'claude-opus-4-8-fast' },
		[ModelName.CLAUDE_SONNET_4_5]: { standard: 'claude-sonnet-4-5-20250929', vertex: 'claude-sonnet-4-5@20250929' },
		[ModelName.CLAUDE_SONNET_4_6]: { standard: 'claude-sonnet-4-6', vertex: 'claude-sonnet-4-6' },
		[ModelName.CLAUDE_SONNET_5]: { standard: 'claude-sonnet-5', vertex: 'claude-sonnet-5' }
	},
	contextWindows: {
		[ModelName.CLAUDE_FABLE_5]: 1_000_000,
		[ModelName.CLAUDE_HAIKU_4_5]: 200_000,
		[ModelName.CLAUDE_OPUS_4_1]: 200_000,
		[ModelName.CLAUDE_OPUS_4_5]: 200_000,
		[ModelName.CLAUDE_OPUS_4_6]: 1_000_000,
		[ModelName.CLAUDE_OPUS_4_6_FAST]: 1_000_000,
		[ModelName.CLAUDE_OPUS_4_7]: 1_000_000,
		[ModelName.CLAUDE_OPUS_4_7_FAST]: 1_000_000,
		[ModelName.CLAUDE_OPUS_4_8]: 1_000_000,
		[ModelName.CLAUDE_OPUS_4_8_FAST]: 1_000_000,
		[ModelName.CLAUDE_SONNET_4_5]: 200_000,
		[ModelName.CLAUDE_SONNET_4_6]: 1_000_000,
		[ModelName.CLAUDE_SONNET_5]: 1_000_000
	},
	defaultModel: ModelName.CLAUDE_FABLE_5,
	description: 'Claude models from Anthropic',
	label: 'Anthropic',
	// Modes map to the API `effort` parameter. xhigh: Fable 5 / Opus 4.7 / 4.8 only.
	// max: Fable 5 / Opus 4.6+ / Sonnet 4.6+. Sonnet 4.5 and Haiku 4.5 have no effort control.
	modelModes: [
		{ mode: 'low effort', model: ModelName.CLAUDE_FABLE_5 },
		{ mode: 'medium effort', model: ModelName.CLAUDE_FABLE_5 },
		{ mode: 'high effort', model: ModelName.CLAUDE_FABLE_5 },
		{ mode: 'xhigh effort', model: ModelName.CLAUDE_FABLE_5 },
		{ mode: 'max effort', model: ModelName.CLAUDE_FABLE_5 },
		{ mode: 'low effort', model: ModelName.CLAUDE_OPUS_4_8 },
		{ mode: 'medium effort', model: ModelName.CLAUDE_OPUS_4_8 },
		{ mode: 'high effort', model: ModelName.CLAUDE_OPUS_4_8 },
		{ mode: 'xhigh effort', model: ModelName.CLAUDE_OPUS_4_8 },
		{ mode: 'max effort', model: ModelName.CLAUDE_OPUS_4_8 },
		{ mode: 'fast', model: ModelName.CLAUDE_OPUS_4_8_FAST },
		{ mode: 'low effort', model: ModelName.CLAUDE_OPUS_4_7 },
		{ mode: 'medium effort', model: ModelName.CLAUDE_OPUS_4_7 },
		{ mode: 'high effort', model: ModelName.CLAUDE_OPUS_4_7 },
		{ mode: 'xhigh effort', model: ModelName.CLAUDE_OPUS_4_7 },
		{ mode: 'max effort', model: ModelName.CLAUDE_OPUS_4_7 },
		{ mode: 'fast', model: ModelName.CLAUDE_OPUS_4_7_FAST },
		{ mode: 'low effort', model: ModelName.CLAUDE_SONNET_5 },
		{ mode: 'medium effort', model: ModelName.CLAUDE_SONNET_5 },
		{ mode: 'high effort', model: ModelName.CLAUDE_SONNET_5 },
		{ mode: 'max effort', model: ModelName.CLAUDE_SONNET_5 },
		{ mode: 'low effort', model: ModelName.CLAUDE_OPUS_4_6 },
		{ mode: 'medium effort', model: ModelName.CLAUDE_OPUS_4_6 },
		{ mode: 'high effort', model: ModelName.CLAUDE_OPUS_4_6 },
		{ mode: 'max effort', model: ModelName.CLAUDE_OPUS_4_6 },
		{ mode: 'fast', model: ModelName.CLAUDE_OPUS_4_6_FAST },
		{ mode: 'low effort', model: ModelName.CLAUDE_SONNET_4_6 },
		{ mode: 'medium effort', model: ModelName.CLAUDE_SONNET_4_6 },
		{ mode: 'high effort', model: ModelName.CLAUDE_SONNET_4_6 },
		{ mode: 'max effort', model: ModelName.CLAUDE_SONNET_4_6 },
		{ mode: 'low effort', model: ModelName.CLAUDE_OPUS_4_5 },
		{ mode: 'medium effort', model: ModelName.CLAUDE_OPUS_4_5 },
		{ mode: 'high effort', model: ModelName.CLAUDE_OPUS_4_5 },
		{ mode: 'normal', model: ModelName.CLAUDE_SONNET_4_5 },
		{ mode: 'extended thinking', model: ModelName.CLAUDE_SONNET_4_5 },
		{ mode: 'normal', model: ModelName.CLAUDE_HAIKU_4_5 }
	],
	pricing: {
		[ModelName.CLAUDE_FABLE_5]: { cache_read: 1.0, cache_write: 12.5, input: 10.0, output: 50.0 },
		[ModelName.CLAUDE_HAIKU_4_5]: { cache_read: 0.1, cache_write: 1.25, input: 1.0, output: 5.0 },
		[ModelName.CLAUDE_OPUS_4_1]: { cache_read: 1.5, cache_write: 18.75, input: 15.0, output: 75.0 },
		[ModelName.CLAUDE_OPUS_4_5]: OPUS_PRICING,
		[ModelName.CLAUDE_OPUS_4_6]: OPUS_PRICING,
		[ModelName.CLAUDE_OPUS_4_6_FAST]: OPUS_PRICING,
		[ModelName.CLAUDE_OPUS_4_7]: OPUS_PRICING,
		[ModelName.CLAUDE_OPUS_4_7_FAST]: OPUS_PRICING,
		[ModelName.CLAUDE_OPUS_4_8]: OPUS_PRICING,
		[ModelName.CLAUDE_OPUS_4_8_FAST]: OPUS_PRICING,
		[ModelName.CLAUDE_SONNET_4_5]: SONNET_PRICING,
		[ModelName.CLAUDE_SONNET_4_6]: SONNET_PRICING,
		[ModelName.CLAUDE_SONNET_5]: SONNET_PRICING
	},
	requiresApiKey: true
};

export const ANTHROPIC_PROVIDER_KEY = BuiltinProviders.ANTHROPIC;

/** modelModes entries using effort-based reasoning control rather than a sampling temperature. */
const EFFORT_MODES = new Set(['fast', 'high effort', 'low effort', 'max effort', 'medium effort', 'xhigh effort']);

/**
 * Models that select reasoning depth via the `effort` mode instead of `temperature`.
 * The Anthropic API rejects `temperature` as deprecated for these models.
 */
export const EFFORT_CONTROLLED_MODELS: ReadonlySet<string> = new Set(
	ANTHROPIC_DESCRIPTOR.modelModes.filter((mm) => EFFORT_MODES.has(mm.mode)).map((mm) => mm.model)
);
