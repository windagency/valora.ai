/**
 * Provider registration boundary test.
 *
 * Enforces the invariant that every declared built-in provider is actually
 * implemented and self-registered at runtime. Before xAI and Moonshot were
 * implemented, both were declared in the static registry but never registered
 * at runtime, so the setup wizard silently omitted them. This test guards
 * against that class of drift: a declared provider with no implementation.
 */

import { describe, expect, it } from 'vitest';

import { BuiltinProviders } from 'config/providers.config';
import { getProviderRegistry } from 'llm/registry';

// Importing the barrel triggers self-registration of every built-in provider.
import './index';

describe('built-in provider registration', () => {
	const registry = getProviderRegistry();

	it('registers a runtime provider for every declared built-in provider key', () => {
		for (const key of Object.values(BuiltinProviders)) {
			expect(registry.hasProvider(key), `provider "${key}" must be registered at runtime`).toBe(true);
		}
	});

	it('registers a descriptor for every declared built-in provider key', () => {
		for (const key of Object.values(BuiltinProviders)) {
			expect(registry.getDescriptor(key), `provider "${key}" must register a descriptor`).toBeDefined();
		}
	});

	it('exposes every built-in provider through getAvailableProviders()', () => {
		const available = registry.getAvailableProviders();
		for (const key of Object.values(BuiltinProviders)) {
			expect(available).toContain(key);
		}
	});
});
