/**
 * Centralized Provider Configuration (consumer facade)
 *
 * The single source of truth for each provider's models is its own
 * `src/llm/providers/<name>.models.ts` descriptor. This module aggregates the
 * built-in descriptors into the shapes the rest of the codebase already consumes
 * (PROVIDER_REGISTRY + model lookups) so that no component hand-maintains a
 * second copy of model metadata.
 */

import type { ProviderDescriptor } from 'plugins/plugin-api.types';
import type { ApiModelId, ModelPricing } from 'types/model.types';

import { ANTHROPIC_DESCRIPTOR } from 'llm/providers/anthropic.models';
import { CURSOR_DESCRIPTOR } from 'llm/providers/cursor.models';
import { GOOGLE_DESCRIPTOR } from 'llm/providers/google.models';
import { LOCAL_DESCRIPTOR } from 'llm/providers/local.models';
import { MOONSHOT_DESCRIPTOR } from 'llm/providers/moonshot.models';
import { OPENAI_DESCRIPTOR } from 'llm/providers/openai.models';
import { XAI_DESCRIPTOR } from 'llm/providers/xai.models';
import { BuiltinProviders, ModelName, ModelNameValue, ProviderName } from 'types/provider-names.types';

/**
 * Re-export for backward compatibility
 */
export { BuiltinProviders, ModelName };
export type { ModelNameValue, ProviderName };

export interface ModelMode {
	mode: string;
	model: string;
}

/** Provider metadata is the provider's descriptor plus its registry key. */
export type ProviderMetadata = ProviderDescriptor & { key: ProviderName };

/**
 * Built-in provider descriptors, keyed by provider name.
 * The SSOT for each entry lives in the corresponding `llm/providers/*.models.ts`.
 */
const BUILTIN_DESCRIPTORS: Record<string, ProviderDescriptor> = {
	[BuiltinProviders.ANTHROPIC]: ANTHROPIC_DESCRIPTOR,
	[BuiltinProviders.CURSOR]: CURSOR_DESCRIPTOR,
	[BuiltinProviders.GOOGLE]: GOOGLE_DESCRIPTOR,
	[BuiltinProviders.LOCAL]: LOCAL_DESCRIPTOR,
	[BuiltinProviders.MOONSHOT]: MOONSHOT_DESCRIPTOR,
	[BuiltinProviders.OPENAI]: OPENAI_DESCRIPTOR,
	[BuiltinProviders.XAI]: XAI_DESCRIPTOR
};

/**
 * Comprehensive provider registry, derived from the per-provider descriptors.
 */
export const PROVIDER_REGISTRY: Record<string, ProviderMetadata> = Object.fromEntries(
	Object.entries(BUILTIN_DESCRIPTORS).map(([key, descriptor]) => [key, { ...descriptor, key: key as ProviderName }])
);

/**
 * Default context window size for unknown models
 */
export const DEFAULT_CONTEXT_WINDOW = 128_000;

/**
 * Build a lookup keyed by every form a model may be referenced by: its registry
 * alias plus, when the provider declares apiModelIds, the resolved standard and
 * Vertex API ids. Consumers can therefore pass either the alias or the API id.
 */
function buildModelLookup<T>(
	select: (descriptor: ProviderDescriptor) => Record<string, T> | undefined
): Record<string, T> {
	const out: Record<string, T> = {};
	for (const descriptor of Object.values(BUILTIN_DESCRIPTORS)) {
		const table = select(descriptor);
		if (!table) continue;
		for (const [alias, value] of Object.entries(table)) {
			out[alias] = value;
			const api = descriptor.apiModelIds?.[alias];
			if (api) {
				out[api.standard] = value;
				if (api.vertex) out[api.vertex] = value;
			}
		}
	}
	return out;
}

const MODEL_CONTEXT_WINDOWS: Record<string, number> = buildModelLookup((descriptor) => descriptor.contextWindows);
const MODEL_PRICING: Record<string, ModelPricing> = buildModelLookup((descriptor) => descriptor.pricing);
const API_MODEL_IDS: Record<string, ApiModelId> = (() => {
	const out: Record<string, ApiModelId> = {};
	for (const descriptor of Object.values(BUILTIN_DESCRIPTORS)) {
		Object.assign(out, descriptor.apiModelIds ?? {});
	}
	return out;
})();

/**
 * Get context window size for a model (accepts the registry alias or a resolved API id).
 */
export function getModelContextWindow(model: string): number {
	return MODEL_CONTEXT_WINDOWS[model] ?? DEFAULT_CONTEXT_WINDOW;
}

/**
 * Get pricing for a model (accepts the registry alias or a resolved API id).
 * Returns undefined when the model has no declared pricing.
 */
export function getModelPricing(model: string): ModelPricing | undefined {
	return MODEL_PRICING[model];
}

/**
 * Resolve a registry alias to the vendor's real API id (standard or Vertex form).
 * Returns the input unchanged when the provider declares no mapping (alias === API id).
 */
export function resolveApiModelId(model: string, useVertex = false): string {
	const api = API_MODEL_IDS[model];
	if (!api) return model;
	return useVertex ? (api.vertex ?? api.standard) : api.standard;
}

/**
 * Provider keys as a type-safe array
 */
export const PROVIDER_KEYS = Object.values(BuiltinProviders) as Array<ProviderName>;

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
	const builtinValues = Object.values(BuiltinProviders) as string[];
	return builtinValues.includes(key);
}
