/**
 * Tests for centralized provider configuration
 */

import { describe, expect, it } from 'vitest';

import {
	getAllModels,
	getAllProviderKeys,
	getDefaultModel,
	getProviderMetadata,
	getProviderModels,
	getProvidersRequiringApiKey,
	getProvidersWithoutApiKey,
	hasModel,
	isValidProvider,
	PROVIDER_REGISTRY,
	ProviderName
} from './providers.config';

describe('providers.config', () => {
	describe('PROVIDER_REGISTRY', () => {
		it('should have all expected providers', () => {
			const expectedProviders = ['anthropic', 'cursor', 'google', 'moonshot', 'openai', 'xai'];
			const actualProviders = Object.keys(PROVIDER_REGISTRY);

			expectedProviders.forEach((provider) => {
				expect(actualProviders).toContain(provider);
			});
		});

		it('should have consistent structure for each provider', () => {
			Object.entries(PROVIDER_REGISTRY).forEach(([key, metadata]) => {
				expect(metadata).toHaveProperty('key');
				expect(metadata).toHaveProperty('label');
				expect(metadata).toHaveProperty('defaultModel');
				expect(metadata).toHaveProperty('modelModes');
				expect(metadata).toHaveProperty('requiresApiKey');
				expect(metadata.key).toBe(key);
				expect(Array.isArray(metadata.modelModes)).toBe(true);
				expect(metadata.modelModes.length).toBeGreaterThan(0);
			});
		});

		it('should have valid modelModes for each provider', () => {
			Object.values(PROVIDER_REGISTRY).forEach((metadata) => {
				metadata.modelModes.forEach((mm) => {
					expect(mm).toHaveProperty('mode');
					expect(mm).toHaveProperty('model');
					expect(typeof mm.mode).toBe('string');
					expect(typeof mm.model).toBe('string');
					expect(mm.mode.length).toBeGreaterThan(0);
					expect(mm.model.length).toBeGreaterThan(0);
				});
			});
		});

		it('should have cursor provider without API key requirement', () => {
			expect(PROVIDER_REGISTRY[ProviderName.CURSOR].requiresApiKey).toBe(false);
			expect(PROVIDER_REGISTRY[ProviderName.CURSOR].helpText).toBeDefined();
		});

		it('should have other providers requiring API keys', () => {
			expect(PROVIDER_REGISTRY[ProviderName.ANTHROPIC].requiresApiKey).toBe(true);
			expect(PROVIDER_REGISTRY[ProviderName.OPENAI].requiresApiKey).toBe(true);
			expect(PROVIDER_REGISTRY[ProviderName.GOOGLE].requiresApiKey).toBe(true);
			expect(PROVIDER_REGISTRY[ProviderName.XAI].requiresApiKey).toBe(true);
			expect(PROVIDER_REGISTRY[ProviderName.MOONSHOT].requiresApiKey).toBe(true);
		});
	});

	describe('getAllProviderKeys', () => {
		it('should return all provider keys', () => {
			const keys = getAllProviderKeys();
			expect(keys).toContain(ProviderName.ANTHROPIC);
			expect(keys).toContain(ProviderName.CURSOR);
			expect(keys).toContain(ProviderName.OPENAI);
			expect(keys).toContain(ProviderName.GOOGLE);
			expect(keys).toContain(ProviderName.XAI);
			expect(keys).toContain(ProviderName.MOONSHOT);
		});

		it('should return at least 6 providers', () => {
			const keys = getAllProviderKeys();
			expect(keys.length).toBeGreaterThanOrEqual(6);
		});
	});

	describe('getProviderMetadata', () => {
		it('should return metadata for valid provider', () => {
			const metadata = getProviderMetadata(ProviderName.ANTHROPIC);
			expect(metadata).toBeDefined();
			expect(metadata?.key).toBe(ProviderName.ANTHROPIC);
			expect(metadata?.label).toBe('Anthropic');
		});

		it('should return undefined for invalid provider', () => {
			const metadata = getProviderMetadata('invalid-provider');
			expect(metadata).toBeUndefined();
		});

		it('should return cursor metadata correctly', () => {
			const metadata = getProviderMetadata(ProviderName.CURSOR);
			expect(metadata).toBeDefined();
			expect(metadata?.requiresApiKey).toBe(false);
			expect(metadata?.defaultModel).toBe('cursor-sonnet-4.5');
		});
	});

	describe('getProvidersRequiringApiKey', () => {
		it('should return providers that require API key', () => {
			const providers = getProvidersRequiringApiKey();
			const keys = providers.map((p) => p.key);

			expect(keys).toContain(ProviderName.ANTHROPIC);
			expect(keys).toContain(ProviderName.OPENAI);
			expect(keys).toContain(ProviderName.GOOGLE);
			expect(keys).not.toContain(ProviderName.CURSOR);
		});

		it('should return at least 5 providers', () => {
			const providers = getProvidersRequiringApiKey();
			expect(providers.length).toBeGreaterThanOrEqual(5);
		});
	});

	describe('getProvidersWithoutApiKey', () => {
		it('should return providers that dont require API key', () => {
			const providers = getProvidersWithoutApiKey();
			const keys = providers.map((p) => p.key);

			expect(keys).toContain(ProviderName.CURSOR);
			expect(keys).not.toContain(ProviderName.ANTHROPIC);
			expect(keys).not.toContain(ProviderName.OPENAI);
		});

		it('should return at least 1 provider', () => {
			const providers = getProvidersWithoutApiKey();
			expect(providers.length).toBeGreaterThanOrEqual(1);
		});
	});

	describe('hasModel', () => {
		it('should return true for existing model', () => {
			expect(hasModel(ProviderName.ANTHROPIC, 'claude-opus-4.5')).toBe(true);
			expect(hasModel(ProviderName.OPENAI, 'gpt-5')).toBe(true);
			expect(hasModel(ProviderName.CURSOR, 'cursor-sonnet-4.5')).toBe(true);
			expect(hasModel(ProviderName.XAI, 'grok-code')).toBe(true);
		});

		it('should return false for non-existing model', () => {
			expect(hasModel(ProviderName.ANTHROPIC, 'non-existent-model')).toBe(false);
			expect(hasModel('invalid-provider', 'any-model')).toBe(false);
		});
	});

	describe('getProviderModels', () => {
		it('should return models for valid provider', () => {
			const models = getProviderModels(ProviderName.ANTHROPIC);
			expect(models.length).toBeGreaterThan(0);
			expect(models).toContain('claude-opus-4.5');
		});

		it('should return empty array for invalid provider', () => {
			const models = getProviderModels('invalid-provider');
			expect(models).toEqual([]);
		});

		it('should return unique models only', () => {
			const models = getProviderModels(ProviderName.OPENAI);
			const uniqueModels = Array.from(new Set(models));
			expect(models.length).toBe(uniqueModels.length);
		});
	});

	describe('getAllModels', () => {
		it('should return all unique models across providers', () => {
			const models = getAllModels();
			expect(models.length).toBeGreaterThan(0);
			expect(models).toContain('claude-opus-4.5');
			expect(models).toContain('gpt-5');
			expect(models).toContain('cursor-sonnet-4.5');
			expect(models).toContain('grok-code');
		});

		it('should return unique models only', () => {
			const models = getAllModels();
			const uniqueModels = Array.from(new Set(models));
			expect(models.length).toBe(uniqueModels.length);
		});

		it('should return sorted models', () => {
			const models = getAllModels();
			const sortedModels = [...models].sort();
			expect(models).toEqual(sortedModels);
		});
	});

	describe('getDefaultModel', () => {
		it('should return default model for valid provider', () => {
			expect(getDefaultModel(ProviderName.ANTHROPIC)).toBe('claude-opus-4.5');
			expect(getDefaultModel(ProviderName.OPENAI)).toBe('gpt-5');
			expect(getDefaultModel(ProviderName.CURSOR)).toBe('cursor-sonnet-4.5');
			expect(getDefaultModel(ProviderName.XAI)).toBe('grok-code');
		});

		it('should return undefined for invalid provider', () => {
			expect(getDefaultModel('invalid-provider')).toBeUndefined();
		});
	});

	describe('isValidProvider', () => {
		it('should return true for valid providers', () => {
			expect(isValidProvider(ProviderName.ANTHROPIC)).toBe(true);
			expect(isValidProvider(ProviderName.OPENAI)).toBe(true);
			expect(isValidProvider(ProviderName.CURSOR)).toBe(true);
		});

		it('should return false for invalid providers', () => {
			expect(isValidProvider('invalid-provider')).toBe(false);
			expect(isValidProvider('')).toBe(false);
		});
	});

	describe('Default models should exist in modelModes', () => {
		it('should have default model in modelModes for each provider', () => {
			Object.entries(PROVIDER_REGISTRY).forEach(([key, metadata]) => {
				const hasDefaultModel = metadata.modelModes.some((mm) => mm.model === metadata.defaultModel);
				expect(hasDefaultModel, `Default model ${metadata.defaultModel} should exist in ${key} modelModes`).toBe(true);
			});
		});
	});
});
