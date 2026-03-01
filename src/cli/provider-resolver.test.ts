/**
 * Tests for provider resolver alignment with config
 */

import { describe, expect, it } from 'vitest';

import { ModelName, ProviderName } from 'config/providers.config';
import { DEFAULT_MODELS } from 'config/validation-helpers';
import { MODEL_PROVIDER_SUGGESTIONS } from './provider-resolver';

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
			const xaiProvider = MODEL_PROVIDER_SUGGESTIONS[ProviderName.XAI];
			expect(xaiProvider).toBeDefined();

			const hasGrokCode = xaiProvider.modelModes.some((mm) => mm.model === ModelName.GROK_CODE);
			expect(hasGrokCode).toBe(true);
		});

		it('should include cursor-sonnet-4.5 for Cursor provider', () => {
			const cursorProvider = MODEL_PROVIDER_SUGGESTIONS[ProviderName.CURSOR];
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
			const xaiProvider = MODEL_PROVIDER_SUGGESTIONS[ProviderName.XAI];
			expect(xaiProvider.modelModes[0].model).toBe(ModelName.GROK_CODE);
			expect(xaiProvider.modelModes[0].mode).toBe('default');
		});

		it('should have Cursor provider with correct structure', () => {
			const cursorProvider = MODEL_PROVIDER_SUGGESTIONS.cursor;
			expect(cursorProvider.provider).toBe(ProviderName.CURSOR);
			expect(cursorProvider.modelModes.length).toBeGreaterThan(0);
			expect(cursorProvider.modelModes.every((mm) => mm.model && mm.mode)).toBe(true);
		});
	});
});
