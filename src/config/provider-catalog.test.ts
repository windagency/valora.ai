/**
 * Tests for the lazy ProviderCatalog service.
 *
 * Each test registers providers directly into the runtime registry,
 * then exercises the catalog on top of it. The registry is reset after
 * every test so tests remain independent.
 */

import { afterEach, describe, expect, it } from 'vitest';

import type { ProviderDescriptor } from 'plugins/plugin-api.types';
import type { LLMProvider } from 'types/llm.types';

import { getProviderRegistry, resetProviderRegistry } from 'llm/registry';
import { getProviderCatalog, resetProviderCatalogForTests } from './provider-catalog';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProviderClass() {
	return class {
		isConfigured() {
			return true;
		}
	} as unknown as new (config: Record<string, unknown>) => LLMProvider;
}

function makeDescriptor(overrides: Partial<ProviderDescriptor> = {}): ProviderDescriptor {
	return {
		defaultModel: 'model-a',
		label: 'Test Provider',
		modelModes: [{ mode: 'default', model: 'model-a' }],
		requiresApiKey: true,
		...overrides
	};
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

afterEach(() => {
	resetProviderCatalogForTests();
	resetProviderRegistry();
});

// ---------------------------------------------------------------------------
// Memoisation
// ---------------------------------------------------------------------------

describe('getProviderCatalog – memoisation', () => {
	it('returns the same instance on consecutive calls', () => {
		const first = getProviderCatalog();
		const second = getProviderCatalog();

		expect(second).toBe(first);
	});

	it('returns a fresh instance after resetProviderCatalogForTests()', () => {
		const first = getProviderCatalog();
		resetProviderCatalogForTests();
		const second = getProviderCatalog();

		expect(second).not.toBe(first);
	});
});

// ---------------------------------------------------------------------------
// getAllProviderKeys
// ---------------------------------------------------------------------------

describe('getAllProviderKeys', () => {
	it('returns the keys of all registered providers', () => {
		const registry = getProviderRegistry();
		registry.registerProvider('alpha', makeProviderClass(), { owner: 'test' });
		registry.registerProvider('beta', makeProviderClass(), { owner: 'test' });

		const catalog = getProviderCatalog();
		const keys = catalog.getAllProviderKeys();

		expect(keys).toContain('alpha');
		expect(keys).toContain('beta');
	});

	it('returns an empty array when no providers are registered', () => {
		const catalog = getProviderCatalog();

		expect(catalog.getAllProviderKeys()).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// getProviderMetadata
// ---------------------------------------------------------------------------

describe('getProviderMetadata', () => {
	it('returns the descriptor for a provider registered with one', () => {
		const descriptor = makeDescriptor({ label: 'Alpha' });
		const registry = getProviderRegistry();
		registry.registerProvider('alpha', makeProviderClass(), { owner: 'test' }, descriptor);

		const catalog = getProviderCatalog();

		expect(catalog.getProviderMetadata('alpha')).toStrictEqual(descriptor);
	});

	it('returns undefined for a provider registered without a descriptor', () => {
		const registry = getProviderRegistry();
		registry.registerProvider('bare', makeProviderClass(), { owner: 'test' });

		const catalog = getProviderCatalog();

		expect(catalog.getProviderMetadata('bare')).toBeUndefined();
	});

	it('returns undefined for an unregistered key', () => {
		const catalog = getProviderCatalog();

		expect(catalog.getProviderMetadata('nonexistent')).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// getProviderModels
// ---------------------------------------------------------------------------

describe('getProviderModels', () => {
	it('returns unique models for a provider with a descriptor', () => {
		const descriptor = makeDescriptor({
			modelModes: [
				{ mode: 'fast', model: 'model-x' },
				{ mode: 'slow', model: 'model-x' },
				{ mode: 'default', model: 'model-y' }
			]
		});
		const registry = getProviderRegistry();
		registry.registerProvider('gamma', makeProviderClass(), { owner: 'test' }, descriptor);

		const catalog = getProviderCatalog();
		const models = catalog.getProviderModels('gamma');

		expect(models).toContain('model-x');
		expect(models).toContain('model-y');
		expect(models.length).toBe(2);
	});

	it('returns an empty array for a provider without a descriptor', () => {
		const registry = getProviderRegistry();
		registry.registerProvider('bare', makeProviderClass(), { owner: 'test' });

		const catalog = getProviderCatalog();

		expect(catalog.getProviderModels('bare')).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// getDefaultModel
// ---------------------------------------------------------------------------

describe('getDefaultModel', () => {
	it('returns the default model for a provider with a descriptor', () => {
		const descriptor = makeDescriptor({ defaultModel: 'model-default' });
		const registry = getProviderRegistry();
		registry.registerProvider('delta', makeProviderClass(), { owner: 'test' }, descriptor);

		const catalog = getProviderCatalog();

		expect(catalog.getDefaultModel('delta')).toBe('model-default');
	});

	it('returns undefined for a provider without a descriptor', () => {
		const registry = getProviderRegistry();
		registry.registerProvider('bare', makeProviderClass(), { owner: 'test' });

		const catalog = getProviderCatalog();

		expect(catalog.getDefaultModel('bare')).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// getProvidersRequiringApiKey
// ---------------------------------------------------------------------------

describe('getProvidersRequiringApiKey', () => {
	it('returns only descriptors where requiresApiKey is true', () => {
		const withKey = makeDescriptor({ label: 'NeedsKey', requiresApiKey: true });
		const withoutKey = makeDescriptor({ label: 'NoKey', requiresApiKey: false });
		const registry = getProviderRegistry();
		registry.registerProvider('needs-key', makeProviderClass(), { owner: 'test' }, withKey);
		registry.registerProvider('no-key', makeProviderClass(), { owner: 'test' }, withoutKey);
		registry.registerProvider('bare', makeProviderClass(), { owner: 'test' });

		const catalog = getProviderCatalog();
		const result = catalog.getProvidersRequiringApiKey();

		expect(result).toContainEqual(withKey);
		expect(result).not.toContainEqual(withoutKey);
		expect(result.length).toBe(1);
	});

	it('returns an empty array when no descriptor-bearing providers require an API key', () => {
		const descriptor = makeDescriptor({ requiresApiKey: false });
		const registry = getProviderRegistry();
		registry.registerProvider('free', makeProviderClass(), { owner: 'test' }, descriptor);

		const catalog = getProviderCatalog();

		expect(catalog.getProvidersRequiringApiKey()).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// getProvidersWithoutApiKey
// ---------------------------------------------------------------------------

describe('getProvidersWithoutApiKey', () => {
	it('returns only descriptors where requiresApiKey is false', () => {
		const withKey = makeDescriptor({ label: 'NeedsKey', requiresApiKey: true });
		const withoutKey = makeDescriptor({ label: 'NoKey', requiresApiKey: false });
		const registry = getProviderRegistry();
		registry.registerProvider('needs-key', makeProviderClass(), { owner: 'test' }, withKey);
		registry.registerProvider('no-key', makeProviderClass(), { owner: 'test' }, withoutKey);

		const catalog = getProviderCatalog();
		const result = catalog.getProvidersWithoutApiKey();

		expect(result).toContainEqual(withoutKey);
		expect(result).not.toContainEqual(withKey);
		expect(result.length).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// hasModel
// ---------------------------------------------------------------------------

describe('hasModel', () => {
	it('returns true when a model exists in the provider descriptor', () => {
		const descriptor = makeDescriptor({
			modelModes: [{ mode: 'default', model: 'model-z' }]
		});
		const registry = getProviderRegistry();
		registry.registerProvider('epsilon', makeProviderClass(), { owner: 'test' }, descriptor);

		const catalog = getProviderCatalog();

		expect(catalog.hasModel('epsilon', 'model-z')).toBe(true);
	});

	it('returns false when the model does not exist in the descriptor', () => {
		const descriptor = makeDescriptor({
			modelModes: [{ mode: 'default', model: 'model-z' }]
		});
		const registry = getProviderRegistry();
		registry.registerProvider('epsilon', makeProviderClass(), { owner: 'test' }, descriptor);

		const catalog = getProviderCatalog();

		expect(catalog.hasModel('epsilon', 'model-missing')).toBe(false);
	});

	it('returns false for a provider without a descriptor', () => {
		const registry = getProviderRegistry();
		registry.registerProvider('bare', makeProviderClass(), { owner: 'test' });

		const catalog = getProviderCatalog();

		expect(catalog.hasModel('bare', 'any-model')).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// descriptors()
// ---------------------------------------------------------------------------

describe('descriptors()', () => {
	it('iterates only entries that have a descriptor', () => {
		const descA = makeDescriptor({ label: 'Provider A' });
		const descB = makeDescriptor({ label: 'Provider B' });
		const registry = getProviderRegistry();
		registry.registerProvider('with-desc-a', makeProviderClass(), { owner: 'test' }, descA);
		registry.registerProvider('with-desc-b', makeProviderClass(), { owner: 'test' }, descB);
		registry.registerProvider('bare', makeProviderClass(), { owner: 'test' });

		const catalog = getProviderCatalog();
		const entries = Array.from(catalog.descriptors());

		expect(entries).toHaveLength(2);

		const keys = entries.map(([k]) => k);
		expect(keys).toContain('with-desc-a');
		expect(keys).toContain('with-desc-b');
		expect(keys).not.toContain('bare');
	});

	it('returns an empty iterator when no providers have descriptors', () => {
		const registry = getProviderRegistry();
		registry.registerProvider('bare', makeProviderClass(), { owner: 'test' });

		const catalog = getProviderCatalog();

		expect(Array.from(catalog.descriptors())).toHaveLength(0);
	});
});
