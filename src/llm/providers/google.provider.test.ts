import { describe, expect, it } from 'vitest';

import { getProviderRegistry } from 'llm/registry';

import './google.provider';

describe('GoogleProvider — descriptor registration', () => {
	it('registers a descriptor with label "Google"', () => {
		expect(getProviderRegistry().getDescriptor('google')?.label).toBe('Google');
	});

	it('registers a descriptor with requiresApiKey: true', () => {
		expect(getProviderRegistry().getDescriptor('google')?.requiresApiKey).toBe(true);
	});

	it('registers a non-empty modelModes list', () => {
		expect(getProviderRegistry().getDescriptor('google')?.modelModes.length ?? 0).toBeGreaterThan(0);
	});
});
