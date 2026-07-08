import { describe, expect, it } from 'vitest';

import { getProviderRegistry } from 'llm/registry';

import { MoonshotProvider } from './moonshot.provider';

describe('MoonshotProvider — descriptor registration', () => {
	it('registers a descriptor with label "Moonshot"', () => {
		expect(getProviderRegistry().getDescriptor('moonshot')?.label).toBe('Moonshot');
	});

	it('registers a descriptor with requiresApiKey: true', () => {
		expect(getProviderRegistry().getDescriptor('moonshot')?.requiresApiKey).toBe(true);
	});

	it('registers kimi-k2.6 as the default model', () => {
		expect(getProviderRegistry().getDescriptor('moonshot')?.defaultModel).toBe('kimi-k2.6');
	});

	it('exposes the kimi-k2.6 and kimi-k2.7-code models in modelModes', () => {
		const models = getProviderRegistry()
			.getDescriptor('moonshot')
			?.modelModes.map((mm) => mm.model);
		expect(models).toContain('kimi-k2.6');
		expect(models).toContain('kimi-k2.7-code');
	});
});

describe('MoonshotProvider — configuration', () => {
	it('is configured when an API key is present', () => {
		expect(new MoonshotProvider({ apiKey: 'test-key' }).isConfigured()).toBe(true);
	});

	it('is not configured without an API key', () => {
		expect(new MoonshotProvider({}).isConfigured()).toBe(false);
	});

	it('accepts models following the kimi-* / moonshot-* naming conventions', async () => {
		const provider = new MoonshotProvider({ apiKey: 'test-key' });
		await expect(provider.validateModel('kimi-k2.6')).resolves.toBe(true);
		await expect(provider.validateModel('moonshot-v1-128k')).resolves.toBe(true);
		await expect(provider.validateModel('gpt-5')).resolves.toBe(false);
	});
});
