import { describe, expect, it } from 'vitest';

import { getProviderRegistry } from 'llm/registry';

import './local.provider';

describe('LocalProvider — descriptor registration', () => {
	it('registers a descriptor with label "Local"', () => {
		expect(getProviderRegistry().getDescriptor('local')?.label).toBe('Local');
	});

	it('registers a descriptor with requiresApiKey: false', () => {
		expect(getProviderRegistry().getDescriptor('local')?.requiresApiKey).toBe(false);
	});

	it('registers a non-empty modelModes list', () => {
		expect(getProviderRegistry().getDescriptor('local')?.modelModes.length ?? 0).toBeGreaterThan(0);
	});
});
