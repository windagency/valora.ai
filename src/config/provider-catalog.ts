/**
 * Lazy catalog wrapping the runtime provider registry.
 *
 * On first access, ensures plugins are loaded so plugin-contributed
 * providers are visible.
 *
 * TODO: Wire up real plugin initialisation once the dynamic.ts loading
 * patterns are better understood. Currently the catalog is created
 * immediately from the current registry state without triggering a
 * plugin-init cycle.
 */

import type { ProviderDescriptor } from 'plugins/plugin-api.types';

import { getProviderRegistry } from 'llm/registry';

export interface ProviderCatalog {
	/** Returns all provider keys that have been registered in the runtime registry. */
	getAllProviderKeys(): string[];

	/** Returns the descriptor for a provider registered with one, or undefined for bare registrations. */
	getProviderMetadata(key: string): ProviderDescriptor | undefined;

	/** Returns unique models for a provider with a descriptor; empty array for bare registrations. */
	getProviderModels(key: string): string[];

	/** Returns the default model for a provider with a descriptor, or undefined. */
	getDefaultModel(key: string): string | undefined;

	/** Returns descriptors for all providers where requiresApiKey is true. */
	getProvidersRequiringApiKey(): ProviderDescriptor[];

	/** Returns descriptors for all providers where requiresApiKey is false. */
	getProvidersWithoutApiKey(): ProviderDescriptor[];

	/** Returns true when the model exists in the provider's descriptor modelModes. */
	hasModel(key: string, model: string): boolean;

	/** Iterates only entries that have a descriptor (skips bare-class registrations). */
	descriptors(): IterableIterator<[string, ProviderDescriptor]>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class ProviderCatalogImpl implements ProviderCatalog {
	*descriptors(): IterableIterator<[string, ProviderDescriptor]> {
		const registry = getProviderRegistry();
		for (const key of registry.getAvailableProviders()) {
			const descriptor = registry.getDescriptor(key);
			if (descriptor) {
				yield [key, descriptor];
			}
		}
	}

	getAllProviderKeys(): string[] {
		return getProviderRegistry().getAvailableProviders();
	}

	getDefaultModel(key: string): string | undefined {
		return getProviderRegistry().getDescriptor(key)?.defaultModel;
	}

	getProviderMetadata(key: string): ProviderDescriptor | undefined {
		return getProviderRegistry().getDescriptor(key);
	}

	getProviderModels(key: string): string[] {
		const descriptor = getProviderRegistry().getDescriptor(key);
		if (!descriptor) return [];

		const unique = new Set<string>();
		for (const { model } of descriptor.modelModes) {
			unique.add(model);
		}
		return Array.from(unique);
	}

	getProvidersRequiringApiKey(): ProviderDescriptor[] {
		return this.allDescriptors().filter((d) => d.requiresApiKey);
	}

	getProvidersWithoutApiKey(): ProviderDescriptor[] {
		return this.allDescriptors().filter((d) => !d.requiresApiKey);
	}

	hasModel(key: string, model: string): boolean {
		const descriptor = getProviderRegistry().getDescriptor(key);
		if (!descriptor) return false;
		return descriptor.modelModes.some((mm) => mm.model === model);
	}

	private allDescriptors(): ProviderDescriptor[] {
		return Array.from(this.descriptors()).map(([, d]) => d);
	}
}

// ---------------------------------------------------------------------------
// Singleton cache
// ---------------------------------------------------------------------------

let catalogInstance: null | ProviderCatalog = null;

/**
 * Returns the shared ProviderCatalog instance, creating it on first call.
 */
export function getProviderCatalog(): ProviderCatalog {
	catalogInstance ??= new ProviderCatalogImpl();
	return catalogInstance;
}

/**
 * Resets the cached instance. Intended for use in tests only.
 */
export function resetProviderCatalogForTests(): void {
	catalogInstance = null;
}
