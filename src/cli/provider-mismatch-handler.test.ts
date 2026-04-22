import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Config } from 'types/config.types';

const { mockPrompt } = vi.hoisted(() => ({ mockPrompt: vi.fn() }));

vi.mock('ui/prompt-adapter.interface', () => ({
	getPromptAdapter: vi.fn(() => ({ prompt: mockPrompt }))
}));

vi.mock('config/providers.config', () => ({
	getDefaultModel: vi.fn((provider: string) => `${provider}-default-model`)
}));

vi.mock('output/color-adapter.interface', () => ({
	getColorAdapter: vi.fn(() => ({
		cyan: (s: string) => s,
		gray: (s: string) => s,
		green: (s: string) => s,
		red: (s: string) => s,
		yellow: (s: string) => s
	}))
}));

import { ProviderMismatchHandler } from './provider-mismatch-handler';

function makeConfig(providers: Record<string, { default_model?: string }>): Config {
	return {
		defaults: { default_provider: Object.keys(providers)[0] ?? '' },
		providers: providers as Config['providers']
	} as Config;
}

describe('ProviderMismatchHandler', () => {
	let consoleSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		vi.spyOn(console, 'info').mockImplementation(() => undefined);
	});

	afterEach(() => {
		consoleSpy.mockRestore();
		vi.clearAllMocks();
	});

	it('includes one choice per configured provider in the prompt', async () => {
		mockPrompt.mockResolvedValueOnce({ action: 'cancel' });
		const config = makeConfig({ local: {}, openai: { default_model: 'gpt-5' } });

		await new ProviderMismatchHandler().handleMismatch('anthropic', 'claude-opus-4.6', ['local', 'openai'], config);

		const questions = mockPrompt.mock.calls[0]?.[0] as Array<{ choices: Array<{ value: string }> }>;
		const values = questions[0]?.choices.map((c) => c.value);
		expect(values).toContain('use:local');
		expect(values).toContain('use:openai');
	});

	it('returns the provider config and model when a configured provider is selected', async () => {
		mockPrompt.mockResolvedValueOnce({ action: 'use:openai' });
		const config = makeConfig({ openai: { default_model: 'gpt-5' } });

		const result = await new ProviderMismatchHandler().handleMismatch(
			'anthropic',
			'claude-opus-4.6',
			['openai'],
			config
		);

		expect(result).not.toBeNull();
		expect(result?.providerName).toBe('openai');
		expect(result?.model).toBe('gpt-5');
	});

	it('returns null when cancel is selected', async () => {
		mockPrompt.mockResolvedValueOnce({ action: 'cancel' });
		const config = makeConfig({ local: {} });

		const result = await new ProviderMismatchHandler().handleMismatch(
			'anthropic',
			'claude-opus-4.6',
			['local'],
			config
		);

		expect(result).toBeNull();
	});

	it('shows no use-provider choices when no providers are configured', async () => {
		mockPrompt.mockResolvedValueOnce({ action: 'cancel' });
		const config = makeConfig({});

		await new ProviderMismatchHandler().handleMismatch('anthropic', 'claude-opus-4.6', [], config);

		const questions = mockPrompt.mock.calls[0]?.[0] as Array<{ choices: Array<{ value: string }> }>;
		const values = questions[0]?.choices.map((c) => c.value);
		expect(values?.some((v) => v.startsWith('use:'))).toBe(false);
		expect(values).toContain('configure');
		expect(values).toContain('cancel');
	});

	it('uses the provider-specific model label in each choice name', async () => {
		mockPrompt.mockResolvedValueOnce({ action: 'cancel' });
		const config = makeConfig({ openai: { default_model: 'gpt-5' }, local: { default_model: 'llama-3' } });

		await new ProviderMismatchHandler().handleMismatch('anthropic', 'claude-opus-4.6', ['openai', 'local'], config);

		const questions = mockPrompt.mock.calls[0]?.[0] as Array<{ choices: Array<{ name: string; value: string }> }>;
		const choices = questions[0]?.choices ?? [];
		const openaiChoice = choices.find((c) => c.value === 'use:openai');
		const localChoice = choices.find((c) => c.value === 'use:local');
		expect(openaiChoice?.name).toContain('gpt-5');
		expect(localChoice?.name).toContain('llama-3');
	});
});
