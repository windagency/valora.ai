import { describe, expect, it } from 'vitest';

import { getProviderRegistry } from 'llm/registry';

import './openai.provider';

describe('OpenAIProvider — descriptor registration', () => {
	it('registers a descriptor with label "OpenAI"', () => {
		expect(getProviderRegistry().getDescriptor('openai')?.label).toBe('OpenAI');
	});

	it('registers a descriptor with requiresApiKey: true', () => {
		expect(getProviderRegistry().getDescriptor('openai')?.requiresApiKey).toBe(true);
	});

	it('registers a non-empty modelModes list', () => {
		expect(getProviderRegistry().getDescriptor('openai')?.modelModes.length ?? 0).toBeGreaterThan(0);
	});
});
