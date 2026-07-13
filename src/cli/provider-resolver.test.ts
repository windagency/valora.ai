/**
 * Tests for provider resolver alignment with config
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Config } from 'types/config.types';

import { BuiltinProviders, ModelName } from 'config/providers.config';
import { getProviderRegistry, resetProviderRegistry } from 'llm/registry';
import { DEFAULT_MODELS } from 'config/validation-helpers';
import { resetProviderCatalogForTests } from 'config/provider-catalog';
import { CLIProviderResolver, MODEL_PROVIDER_SUGGESTIONS } from './provider-resolver';

const mockConfigLoad = vi.hoisted(() => vi.fn());

vi.mock('config/loader', () => ({
	getConfigLoader: () => ({ load: mockConfigLoad })
}));

vi.mock('output/logger', () => ({
	getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

function registerFakeProvider(
	name: string,
	descriptor: {
		defaultModel: string;
		label: string;
		modelModes: Array<{ mode: string; model: string }>;
		modelPrefix?: string;
		requiresApiKey: boolean;
	}
): void {
	getProviderRegistry().registerProvider(
		name,
		() => ({ complete: async () => ({ content: '' }), isConfigured: () => false }) as never,
		{},
		descriptor
	);
}

describe('provider-resolver', () => {
	describe('MODEL_PROVIDER_SUGGESTIONS alignment', () => {
		it('should include all DEFAULT_MODELS in MODEL_PROVIDER_SUGGESTIONS', () => {
			// Verify each provider's default model exists in MODEL_PROVIDER_SUGGESTIONS
			Object.entries(DEFAULT_MODELS).forEach(([provider, defaultModel]) => {
				const providerData = MODEL_PROVIDER_SUGGESTIONS[provider];
				expect(providerData, `Provider ${provider} should exist in MODEL_PROVIDER_SUGGESTIONS`).toBeDefined();

				const modelExists = providerData.modelModes.some((mm) => mm.model === defaultModel);
				expect(
					modelExists,
					`Model ${defaultModel} for provider ${provider} should exist in MODEL_PROVIDER_SUGGESTIONS`
				).toBe(true);
			});
		});

		it('should include the grok-build code model for xAI provider', () => {
			const xaiProvider = MODEL_PROVIDER_SUGGESTIONS[BuiltinProviders.XAI];
			expect(xaiProvider).toBeDefined();

			const hasGrokBuild = xaiProvider.modelModes.some((mm) => mm.model === ModelName.GROK_BUILD_0_1);
			expect(hasGrokBuild).toBe(true);
		});

		it('should include cursor-sonnet-4.5 for Cursor provider', () => {
			const cursorProvider = MODEL_PROVIDER_SUGGESTIONS[BuiltinProviders.CURSOR];
			expect(cursorProvider).toBeDefined();

			const hasCursorSonnet = cursorProvider.modelModes.some((mm) => mm.model === ModelName.CURSOR_SONNET_4_5);
			expect(hasCursorSonnet).toBe(true);
		});

		it('should have consistent provider keys between DEFAULT_MODELS and MODEL_PROVIDER_SUGGESTIONS', () => {
			const defaultModelProviders = Object.keys(DEFAULT_MODELS);
			const suggestionProviders = Object.keys(MODEL_PROVIDER_SUGGESTIONS);

			// Every provider in DEFAULT_MODELS should exist in MODEL_PROVIDER_SUGGESTIONS
			defaultModelProviders.forEach((provider) => {
				expect(
					suggestionProviders,
					`Provider ${provider} from DEFAULT_MODELS should exist in MODEL_PROVIDER_SUGGESTIONS`
				).toContain(provider);
			});
		});

		it('should have xAI with grok-4.3 as first (frontier) model', () => {
			const xaiProvider = MODEL_PROVIDER_SUGGESTIONS[BuiltinProviders.XAI];
			expect(xaiProvider.modelModes[0].model).toBe(ModelName.GROK_4_3);
			expect(xaiProvider.modelModes[0].mode).toBe('default');
		});

		it('should have Cursor provider with correct structure', () => {
			const cursorProvider = MODEL_PROVIDER_SUGGESTIONS.cursor;
			expect(cursorProvider.provider).toBe(BuiltinProviders.CURSOR);
			expect(cursorProvider.modelModes.length).toBeGreaterThan(0);
			expect(cursorProvider.modelModes.every((mm) => mm.model && mm.mode)).toBe(true);
		});
	});

	describe('getProviderForModel — ollama routing (via resolveProvider())', () => {
		afterEach(() => {
			resetProviderRegistry();
			resetProviderCatalogForTests();
		});

		it('routes "ollama:llama3.1" to OLLAMA provider when the ollama descriptor is registered', async () => {
			registerFakeProvider('ollama', {
				defaultModel: 'llama3.1',
				label: 'Ollama',
				modelModes: [{ mode: 'default', model: 'llama3.1' }],
				modelPrefix: 'ollama:',
				requiresApiKey: false
			});
			mockConfigLoad.mockResolvedValue({ defaults: {}, providers: { ollama: {} } } as unknown as Config);

			const resolver = new CLIProviderResolver();
			const result = await resolver.resolveProvider('ollama:llama3.1', { flags: {} });

			expect(result.providerName).toBe('ollama');
		});

		it('routes "ollama:mistral" to OLLAMA provider when the ollama descriptor is registered', async () => {
			registerFakeProvider('ollama', {
				defaultModel: 'llama3.1',
				label: 'Ollama',
				modelModes: [{ mode: 'default', model: 'mistral' }],
				modelPrefix: 'ollama:',
				requiresApiKey: false
			});
			mockConfigLoad.mockResolvedValue({ defaults: {}, providers: { ollama: {} } } as unknown as Config);

			const resolver = new CLIProviderResolver();
			const result = await resolver.resolveProvider('ollama:mistral', { flags: {} });

			expect(result.providerName).toBe('ollama');
		});

		it('does not route "mistral" to OLLAMA (still goes to LOCAL via keyword matching)', async () => {
			mockConfigLoad.mockResolvedValue({ defaults: {}, providers: {} } as unknown as Config);

			const resolver = new CLIProviderResolver();
			const result = await resolver.resolveProvider('mistral', { flags: {} });

			expect(result.providerName).toBe('local');
		});
	});

	describe('model prefix routing via descriptors (via resolveProvider())', () => {
		afterEach(() => {
			resetProviderRegistry();
			resetProviderCatalogForTests();
		});

		it('routes a model with a registered descriptor modelPrefix to that provider', async () => {
			registerFakeProvider('fake', {
				defaultModel: 'fake:model',
				label: 'Fake',
				modelModes: [{ mode: 'default', model: 'fake:model' }],
				modelPrefix: 'fake:',
				requiresApiKey: false
			});
			mockConfigLoad.mockResolvedValue({ defaults: {}, providers: { fake: {} } } as unknown as Config);

			const resolver = new CLIProviderResolver();
			const result = await resolver.resolveProvider('fake:some-model', { flags: {} });

			expect(result.providerName).toBe('fake');
		});

		it('falls through to keyword matching when no descriptor prefix matches', async () => {
			mockConfigLoad.mockResolvedValue({ defaults: {}, providers: {} } as unknown as Config);

			const resolver = new CLIProviderResolver();
			// 'llama3.1' has no prefix — should fall through to keyword matching (LOCAL)
			const result = await resolver.resolveProvider('llama3.1', { flags: {} });

			expect(result.providerName).toBe(BuiltinProviders.LOCAL);
		});
	});
});

describe('CLIProviderResolver — getConfiguredProviders', () => {
	afterEach(() => {
		resetProviderRegistry();
		resetProviderCatalogForTests();
	});

	it('includes a plugin provider with requiresApiKey=false even when apiKey is empty string', () => {
		registerFakeProvider('ollama', {
			defaultModel: 'llama3.1',
			label: 'Ollama',
			modelModes: [{ mode: 'default', model: 'llama3.1' }],
			requiresApiKey: false
		});

		const config = {
			defaults: {},
			providers: { ollama: { apiKey: '', default_model: 'llama3.1' } }
		} as unknown as Config;
		const resolver = new CLIProviderResolver();
		const result = resolver.getConfiguredProviders(config);
		expect(result).toContain('ollama');
	});

	it('excludes a provider whose apiKey is empty and is not in the catalog', () => {
		const config = {
			defaults: {},
			providers: { unknown_provider: { apiKey: '', default_model: 'some-model' } }
		} as unknown as Config;
		const resolver = new CLIProviderResolver();
		const result = resolver.getConfiguredProviders(config);
		expect(result).not.toContain('unknown_provider');
	});
});

describe('CLIProviderResolver — auto-fallback to default provider', () => {
	beforeEach(() => {
		registerFakeProvider('ollama', {
			defaultModel: 'llama3.1',
			label: 'Ollama',
			modelModes: [{ mode: 'default', model: 'llama3.1' }],
			requiresApiKey: false
		});
	});

	afterEach(() => {
		resetProviderRegistry();
		resetProviderCatalogForTests();
		vi.clearAllMocks();
	});

	it('resolves to the configured default_provider when the requested provider is not in config', async () => {
		mockConfigLoad.mockResolvedValue({
			defaults: { default_provider: 'ollama' },
			providers: { ollama: { apiKey: '', default_model: 'llama3.1' } }
		});

		const resolver = new CLIProviderResolver();
		const result = await resolver.resolveProvider('claude-opus-4.6', { flags: {} });

		expect(result.providerName).toBe('ollama');
		expect(result.model).toBe('llama3.1');
	});

	it('still calls handleMissingProvider when no default_provider is set', async () => {
		mockConfigLoad.mockResolvedValue({
			defaults: {},
			providers: {}
		});

		const resolver = new CLIProviderResolver();
		await expect(resolver.resolveProvider('claude-opus-4.6', { flags: {} })).rejects.toThrow();
	});
});
