/**
 * Tests for provider resolver alignment with config
 */

import { afterEach, describe, expect, it } from 'vitest';

import { BuiltinProviders, ModelName } from 'config/providers.config';
import { getProviderRegistry, resetProviderRegistry } from 'llm/registry';
import { DEFAULT_MODELS } from 'config/validation-helpers';
import { resetProviderCatalogForTests } from 'config/provider-catalog';
import { CLIProviderResolver, MODEL_PROVIDER_SUGGESTIONS } from './provider-resolver';

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

		it('should include grok-code for xAI provider', () => {
			const xaiProvider = MODEL_PROVIDER_SUGGESTIONS[BuiltinProviders.XAI];
			expect(xaiProvider).toBeDefined();

			const hasGrokCode = xaiProvider.modelModes.some((mm) => mm.model === ModelName.GROK_CODE);
			expect(hasGrokCode).toBe(true);
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

		it('should have xAI with grok-code as first model', () => {
			const xaiProvider = MODEL_PROVIDER_SUGGESTIONS[BuiltinProviders.XAI];
			expect(xaiProvider.modelModes[0].model).toBe(ModelName.GROK_CODE);
			expect(xaiProvider.modelModes[0].mode).toBe('default');
		});

		it('should have Cursor provider with correct structure', () => {
			const cursorProvider = MODEL_PROVIDER_SUGGESTIONS.cursor;
			expect(cursorProvider.provider).toBe(BuiltinProviders.CURSOR);
			expect(cursorProvider.modelModes.length).toBeGreaterThan(0);
			expect(cursorProvider.modelModes.every((mm) => mm.model && mm.mode)).toBe(true);
		});
	});

	describe('getProviderForModel — ollama routing', () => {
		afterEach(() => {
			resetProviderRegistry();
			resetProviderCatalogForTests();
		});

		it('routes "ollama:llama3.1" to OLLAMA provider when the ollama descriptor is registered', () => {
			getProviderRegistry().registerProvider(
				'ollama',
				() => ({ isConfigured: () => false, complete: async () => ({ content: '' }) }) as never,
				{},
				{
					defaultModel: 'llama3.1',
					label: 'Ollama',
					modelModes: [{ mode: 'default', model: 'llama3.1' }],
					modelPrefix: 'ollama:',
					requiresApiKey: false
				}
			);
			const resolver = new CLIProviderResolver();
			expect(
				(resolver as never as { getProviderForModel(m: string): string })['getProviderForModel']('ollama:llama3.1')
			).toBe('ollama');
		});

		it('routes "ollama:mistral" to OLLAMA provider when the ollama descriptor is registered', () => {
			getProviderRegistry().registerProvider(
				'ollama',
				() => ({ isConfigured: () => false, complete: async () => ({ content: '' }) }) as never,
				{},
				{
					defaultModel: 'llama3.1',
					label: 'Ollama',
					modelModes: [{ mode: 'default', model: 'mistral' }],
					modelPrefix: 'ollama:',
					requiresApiKey: false
				}
			);
			const resolver = new CLIProviderResolver();
			expect(
				(resolver as never as { getProviderForModel(m: string): string })['getProviderForModel']('ollama:mistral')
			).toBe('ollama');
		});

		it('does not route "mistral" to OLLAMA (still goes to LOCAL via keyword matching)', () => {
			const resolver = new CLIProviderResolver();
			expect((resolver as never as { getProviderForModel(m: string): string })['getProviderForModel']('mistral')).toBe(
				'local'
			);
		});
	});

	describe('model prefix routing via descriptors', () => {
		afterEach(() => {
			resetProviderRegistry();
			resetProviderCatalogForTests();
		});

		it('routes a model with a registered descriptor modelPrefix to that provider', () => {
			// Register a fake provider with modelPrefix: 'fake:'
			getProviderRegistry().registerProvider(
				'fake',
				// Minimal factory stub — provider routing only checks the descriptor
				() => ({ isConfigured: () => false, complete: async () => ({ content: '' }) }) as never,
				{},
				{
					defaultModel: 'fake:model',
					label: 'Fake',
					modelModes: [{ mode: 'default', model: 'fake:model' }],
					modelPrefix: 'fake:',
					requiresApiKey: false
				}
			);

			const resolver = new CLIProviderResolver();
			const result = (resolver as never as { getProviderForModel(m: string): string })['getProviderForModel'](
				'fake:some-model'
			);
			expect(result).toBe('fake');
		});

		it('falls through to keyword matching when no descriptor prefix matches', () => {
			const resolver = new CLIProviderResolver();
			// 'llama3.1' has no prefix — should fall through to keyword matching (LOCAL)
			const result = (resolver as never as { getProviderForModel(m: string): string })['getProviderForModel'](
				'llama3.1'
			);
			expect(result).toBe(BuiltinProviders.LOCAL);
		});
	});
});
