import { describe, expect, it } from 'vitest';

import { getProviderRegistry } from 'llm/registry';

import { XAIProvider } from './xai.provider';

describe('XAIProvider — descriptor registration', () => {
	it('registers a descriptor with label "xAI"', () => {
		expect(getProviderRegistry().getDescriptor('xai')?.label).toBe('xAI');
	});

	it('registers a descriptor with requiresApiKey: true', () => {
		expect(getProviderRegistry().getDescriptor('xai')?.requiresApiKey).toBe(true);
	});

	it('registers grok-4.3 as the default model', () => {
		expect(getProviderRegistry().getDescriptor('xai')?.defaultModel).toBe('grok-4.3');
	});

	it('exposes the grok-4.3 frontier model in modelModes', () => {
		const models = getProviderRegistry()
			.getDescriptor('xai')
			?.modelModes.map((mm) => mm.model);
		expect(models).toContain('grok-4.3');
	});
});

describe('XAIProvider — configuration', () => {
	it('is configured when an API key is present', () => {
		expect(new XAIProvider({ apiKey: 'test-key' }).isConfigured()).toBe(true);
	});

	it('is not configured without an API key', () => {
		expect(new XAIProvider({}).isConfigured()).toBe(false);
	});

	it('accepts models following the grok-* naming convention', async () => {
		const provider = new XAIProvider({ apiKey: 'test-key' });
		await expect(provider.validateModel('grok-4.3')).resolves.toBe(true);
		await expect(provider.validateModel('grok-some-future-model')).resolves.toBe(true);
		await expect(provider.validateModel('gpt-5')).resolves.toBe(false);
	});
});
