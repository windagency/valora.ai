/**
 * Tests for validation helpers
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockPromptFn = vi.hoisted(() => vi.fn());
const mockGetProviderMetadata = vi.hoisted(() =>
	vi.fn<
		[string],
		ReturnType<ReturnType<(typeof import('config/provider-catalog'))['getProviderCatalog']>['getProviderMetadata']>
	>()
);

vi.mock('config/provider-catalog', () => ({
	getProviderCatalog: () => ({ getProviderMetadata: mockGetProviderMetadata })
}));

vi.mock('output/color-adapter.interface', () => ({
	getColorAdapter: () => ({
		cyan: (s: string) => s,
		gray: (s: string) => s,
		red: (s: string) => s,
		green: (s: string) => s
	})
}));

vi.mock('ui/prompt-adapter.interface', () => ({
	getPromptAdapter: () => ({ prompt: mockPromptFn })
}));

import { BuiltinProviders } from './providers.config';
import {
	configureDefaults,
	configureProvider,
	DEFAULT_MODELS,
	PROVIDER_CHOICES,
	PROVIDER_LABELS,
	QUICK_SETUP_CHOICES
} from './validation-helpers';

function makePluginDescriptor(overrides: Partial<{ requiresApiKey: boolean; helpText: string }> = {}) {
	return {
		defaultModel: 'plugin-default-model',
		description: 'A plugin-contributed provider',
		helpText: overrides.helpText,
		label: 'My Plugin',
		modelModes: [{ mode: 'default', model: 'plugin-default-model' }],
		requiresApiKey: overrides.requiresApiKey ?? true
	};
}

describe('validation-helpers', () => {
	describe('PROVIDER_LABELS', () => {
		it('should include Cursor provider', () => {
			expect(PROVIDER_LABELS).toHaveProperty(BuiltinProviders.CURSOR);
			expect(PROVIDER_LABELS[BuiltinProviders.CURSOR]).toBe('Cursor');
		});

		it('should include all standard providers', () => {
			expect(PROVIDER_LABELS).toHaveProperty(BuiltinProviders.ANTHROPIC);
			expect(PROVIDER_LABELS).toHaveProperty(BuiltinProviders.OPENAI);
			expect(PROVIDER_LABELS).toHaveProperty(BuiltinProviders.GOOGLE);
			expect(PROVIDER_LABELS).toHaveProperty(BuiltinProviders.XAI);
			expect(PROVIDER_LABELS).toHaveProperty(BuiltinProviders.MOONSHOT);
		});
	});

	describe('DEFAULT_MODELS', () => {
		it('should include Cursor with correct default model', () => {
			expect(DEFAULT_MODELS).toHaveProperty(BuiltinProviders.CURSOR);
			expect(DEFAULT_MODELS[BuiltinProviders.CURSOR]).toBe('cursor-sonnet-4.5');
		});

		it('should include xAI with grok-code', () => {
			expect(DEFAULT_MODELS).toHaveProperty(BuiltinProviders.XAI);
			expect(DEFAULT_MODELS[BuiltinProviders.XAI]).toBe('grok-code');
		});

		it('should have default models for all providers', () => {
			expect(DEFAULT_MODELS[BuiltinProviders.ANTHROPIC]).toBe('claude-opus-4.6');
			expect(DEFAULT_MODELS[BuiltinProviders.GOOGLE]).toBe('gemini-2.5-pro');
			expect(DEFAULT_MODELS[BuiltinProviders.MOONSHOT]).toBe('kimi-k2');
			expect(DEFAULT_MODELS[BuiltinProviders.OPENAI]).toBe('gpt-5');
		});
	});

	describe('PROVIDER_CHOICES', () => {
		it('should include Cursor provider option', () => {
			const cursorChoice = PROVIDER_CHOICES.find((choice) => choice.value === BuiltinProviders.CURSOR);
			expect(cursorChoice).toBeDefined();
			expect(cursorChoice?.name).toContain('Cursor');
			expect(cursorChoice?.name).toContain('Zero config');
		});

		it('should have skip option with updated text', () => {
			const skipChoice = PROVIDER_CHOICES.find((choice) => choice.value === '__skip__');
			expect(skipChoice).toBeDefined();
			expect(skipChoice?.name).toContain('Skip');
			expect(skipChoice?.name).toContain('No provider configuration');
		});

		it('should have all standard providers', () => {
			const providers = PROVIDER_CHOICES.map((c) => c.value);
			expect(providers).toContain(BuiltinProviders.ANTHROPIC);
			expect(providers).toContain(BuiltinProviders.CURSOR);
			expect(providers).toContain(BuiltinProviders.OPENAI);
			expect(providers).toContain(BuiltinProviders.GOOGLE);
			expect(providers).toContain(BuiltinProviders.XAI);
			expect(providers).toContain(BuiltinProviders.MOONSHOT);
		});
	});

	describe('QUICK_SETUP_CHOICES', () => {
		it('should have Cursor as first option', () => {
			expect(QUICK_SETUP_CHOICES[0].value).toBe(BuiltinProviders.CURSOR);
			expect(QUICK_SETUP_CHOICES[0].name).toContain('No API key needed');
		});

		it('should include key providers for quick setup', () => {
			const providers = QUICK_SETUP_CHOICES.map((c) => c.value);
			expect(providers).toContain(BuiltinProviders.CURSOR);
			expect(providers).toContain(BuiltinProviders.ANTHROPIC);
			expect(providers).toContain(BuiltinProviders.OPENAI);
			expect(providers).toContain(BuiltinProviders.GOOGLE);
		});

		it('should have at least 4 quick setup options', () => {
			expect(QUICK_SETUP_CHOICES.length).toBeGreaterThanOrEqual(4);
		});
	});
});

describe('configureProvider', () => {
	beforeEach(() => {
		vi.spyOn(console, 'group').mockImplementation(() => undefined);
		vi.spyOn(console, 'groupEnd').mockImplementation(() => undefined);
		vi.spyOn(console, 'info').mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('configures an API-key provider contributed by a plugin', async () => {
		mockGetProviderMetadata.mockImplementation((key: string) =>
			key === 'myplugin' ? makePluginDescriptor() : undefined
		);
		mockPromptFn.mockResolvedValueOnce({ apiKey: 'sk-test-123', defaultModel: 'plugin-default-model' });

		const config = { providers: {} as Record<string, unknown>, defaults: {} };
		await configureProvider('myplugin', config as never);

		expect(config.providers['myplugin']).toEqual({ apiKey: 'sk-test-123', default_model: 'plugin-default-model' });
	});

	it('configures a no-API-key provider contributed by a plugin', async () => {
		mockGetProviderMetadata.mockImplementation((key: string) =>
			key === 'myplugin' ? makePluginDescriptor({ requiresApiKey: false }) : undefined
		);
		mockPromptFn.mockResolvedValueOnce({ defaultModel: 'plugin-default-model' });

		const config = { providers: {} as Record<string, unknown>, defaults: {} };
		await configureProvider('myplugin', config as never);

		expect(config.providers['myplugin']).toEqual({ apiKey: '', default_model: 'plugin-default-model' });
	});

	it('throws Unknown provider when the provider is not in the catalog', async () => {
		mockGetProviderMetadata.mockImplementation(() => undefined);

		const config = { providers: {}, defaults: {} };
		await expect(configureProvider('nonexistent', config as never)).rejects.toThrow('Unknown provider: nonexistent');
	});
});

describe('configureDefaults', () => {
	beforeEach(() => {
		vi.spyOn(console, 'group').mockImplementation(() => undefined);
		vi.spyOn(console, 'groupEnd').mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('preserves existing fields on config.defaults such as default_provider', async () => {
		mockPromptFn.mockResolvedValueOnce({
			interactive: true,
			log_level: 'info',
			output_format: 'markdown',
			session_mode: true
		});

		const config = {
			defaults: { default_provider: 'ollama' },
			providers: {}
		};

		await configureDefaults(config as never);

		expect((config.defaults as Record<string, unknown>)['default_provider']).toBe('ollama');
	});
});
