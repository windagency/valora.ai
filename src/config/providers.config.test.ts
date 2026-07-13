/**
 * Tests for centralized provider configuration
 */

import { describe, expect, it } from 'vitest';

import {
	BuiltinProviders,
	DEFAULT_CONTEXT_WINDOW,
	getAllModels,
	getAllProviderKeys,
	getDefaultModel,
	getModelContextWindow,
	getModelPricing,
	getProviderMetadata,
	getProviderModels,
	getProvidersRequiringApiKey,
	getProvidersWithoutApiKey,
	hasModel,
	isValidProvider,
	PROVIDER_REGISTRY,
	resolveApiModelId
} from './providers.config';
describe('providers.config', () => {
	describe('PROVIDER_REGISTRY', () => {
		it('should have all expected providers', () => {
			const expectedProviders = ['anthropic', 'cursor', 'google', 'local', 'moonshot', 'openai', 'xai'];
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
			expect(PROVIDER_REGISTRY[BuiltinProviders.CURSOR].requiresApiKey).toBe(false);
			expect(typeof PROVIDER_REGISTRY[BuiltinProviders.CURSOR].helpText).toBe('string');
			expect(PROVIDER_REGISTRY[BuiltinProviders.CURSOR].helpText?.length).toBeGreaterThan(0);
		});

		it('should have other providers requiring API keys', () => {
			expect(PROVIDER_REGISTRY[BuiltinProviders.ANTHROPIC].requiresApiKey).toBe(true);
			expect(PROVIDER_REGISTRY[BuiltinProviders.OPENAI].requiresApiKey).toBe(true);
			expect(PROVIDER_REGISTRY[BuiltinProviders.GOOGLE].requiresApiKey).toBe(true);
			expect(PROVIDER_REGISTRY[BuiltinProviders.XAI].requiresApiKey).toBe(true);
			expect(PROVIDER_REGISTRY[BuiltinProviders.MOONSHOT].requiresApiKey).toBe(true);
		});

		it('should have correct configuration for Local provider', () => {
			const local = PROVIDER_REGISTRY[BuiltinProviders.LOCAL];

			expect(local.defaultModel).toBe('llama3.1');
			expect(local.requiresApiKey).toBe(false);
			expect(local.label).toBe('Local');
			expect(local.modelModes).toHaveLength(1);
			expect(local.key).toBe(BuiltinProviders.LOCAL);
		});
	});

	describe('getAllProviderKeys', () => {
		it('should return all provider keys', () => {
			const keys = getAllProviderKeys();
			expect(keys).toContain(BuiltinProviders.ANTHROPIC);
			expect(keys).toContain(BuiltinProviders.CURSOR);
			expect(keys).toContain(BuiltinProviders.OPENAI);
			expect(keys).toContain(BuiltinProviders.GOOGLE);
			expect(keys).toContain(BuiltinProviders.XAI);
			expect(keys).toContain(BuiltinProviders.MOONSHOT);
		});

		it('should return at least 6 providers', () => {
			const keys = getAllProviderKeys();
			expect(keys.length).toBeGreaterThanOrEqual(6);
		});
	});

	describe('getProviderMetadata', () => {
		it('should return metadata for valid provider', () => {
			const metadata = getProviderMetadata(BuiltinProviders.ANTHROPIC);
			expect(metadata).toBe(PROVIDER_REGISTRY[BuiltinProviders.ANTHROPIC]);
			expect(metadata?.key).toBe(BuiltinProviders.ANTHROPIC);
			expect(metadata?.label).toBe('Anthropic');
		});

		it('should return undefined for invalid provider', () => {
			const metadata = getProviderMetadata('invalid-provider');
			expect(metadata).toBeUndefined();
		});

		it('should return cursor metadata correctly', () => {
			const metadata = getProviderMetadata(BuiltinProviders.CURSOR);
			expect(metadata).toBe(PROVIDER_REGISTRY[BuiltinProviders.CURSOR]);
			expect(metadata?.requiresApiKey).toBe(false);
			expect(metadata?.defaultModel).toBe('cursor-sonnet-4.6');
		});
	});

	describe('getProvidersRequiringApiKey', () => {
		it('should return providers that require API key', () => {
			const providers = getProvidersRequiringApiKey();
			const keys = providers.map((p) => p.key);

			expect(keys).toContain(BuiltinProviders.ANTHROPIC);
			expect(keys).toContain(BuiltinProviders.OPENAI);
			expect(keys).toContain(BuiltinProviders.GOOGLE);
			expect(keys).not.toContain(BuiltinProviders.CURSOR);
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

			expect(keys).toContain(BuiltinProviders.CURSOR);
			expect(keys).not.toContain(BuiltinProviders.ANTHROPIC);
			expect(keys).not.toContain(BuiltinProviders.OPENAI);
		});

		it('should return at least 1 provider', () => {
			const providers = getProvidersWithoutApiKey();
			expect(providers.length).toBeGreaterThanOrEqual(1);
		});
	});

	describe('hasModel', () => {
		it('should return true for existing model', () => {
			expect(hasModel(BuiltinProviders.ANTHROPIC, 'claude-opus-4.6')).toBe(true);
			expect(hasModel(BuiltinProviders.ANTHROPIC, 'claude-sonnet-4.6')).toBe(true);
			expect(hasModel(BuiltinProviders.ANTHROPIC, 'claude-opus-4.5')).toBe(true);
			expect(hasModel(BuiltinProviders.OPENAI, 'gpt-5')).toBe(true);
			expect(hasModel(BuiltinProviders.CURSOR, 'cursor-sonnet-4.5')).toBe(true);
			expect(hasModel(BuiltinProviders.XAI, 'grok-4.3')).toBe(true);
		});

		it('should include the newly added frontier models', () => {
			expect(hasModel(BuiltinProviders.ANTHROPIC, 'claude-opus-4.8')).toBe(true);
			expect(hasModel(BuiltinProviders.ANTHROPIC, 'claude-fable-5')).toBe(true);
			expect(hasModel(BuiltinProviders.ANTHROPIC, 'claude-sonnet-5')).toBe(true);
			expect(hasModel(BuiltinProviders.OPENAI, 'gpt-5.5')).toBe(true);
			expect(hasModel(BuiltinProviders.OPENAI, 'gpt-5.6-sol')).toBe(true);
			expect(hasModel(BuiltinProviders.GOOGLE, 'gemini-3.5-flash')).toBe(true);
			expect(hasModel(BuiltinProviders.GOOGLE, 'gemini-3.5-pro')).toBe(true);
			expect(hasModel(BuiltinProviders.XAI, 'grok-4.3')).toBe(true);
			expect(hasModel(BuiltinProviders.MOONSHOT, 'kimi-k2.6')).toBe(true);
			expect(hasModel(BuiltinProviders.MOONSHOT, 'kimi-k2.7-code')).toBe(true);
		});

		it('should include the model variations', () => {
			// GPT-5.6 sibling tiers
			expect(hasModel(BuiltinProviders.OPENAI, 'gpt-5.6-terra')).toBe(true);
			expect(hasModel(BuiltinProviders.OPENAI, 'gpt-5.6-luna')).toBe(true);
			// Google cheapest tier
			expect(hasModel(BuiltinProviders.GOOGLE, 'gemini-3.1-flash-lite')).toBe(true);
			// xAI multi-agent variant
			expect(hasModel(BuiltinProviders.XAI, 'grok-4.20-multi-agent-0309')).toBe(true);
			// Moonshot prior flagship
			expect(hasModel(BuiltinProviders.MOONSHOT, 'kimi-k2.5')).toBe(true);
			// Anthropic fast speed variants
			expect(hasModel(BuiltinProviders.ANTHROPIC, 'claude-opus-4.8-fast')).toBe(true);
			expect(hasModel(BuiltinProviders.ANTHROPIC, 'claude-opus-4.7-fast')).toBe(true);
			expect(hasModel(BuiltinProviders.ANTHROPIC, 'claude-opus-4.6-fast')).toBe(true);
			// Cursor in-house + frontier passthroughs
			expect(hasModel(BuiltinProviders.CURSOR, 'cursor-fusion')).toBe(true);
			expect(hasModel(BuiltinProviders.CURSOR, 'cursor-opus-4.8')).toBe(true);
			expect(hasModel(BuiltinProviders.CURSOR, 'cursor-grok-4.3')).toBe(true);
		});

		it('should expose Anthropic effort modes', () => {
			const modes = PROVIDER_REGISTRY[BuiltinProviders.ANTHROPIC].modelModes
				.filter((mm) => mm.model === 'claude-opus-4.8')
				.map((mm) => mm.mode);
			expect(modes).toContain('low effort');
			expect(modes).toContain('high effort');
			expect(modes).toContain('xhigh effort');
			expect(modes).toContain('max effort');
		});

		it('should return false for non-existing model', () => {
			expect(hasModel(BuiltinProviders.ANTHROPIC, 'non-existent-model')).toBe(false);
			expect(hasModel('invalid-provider', 'any-model')).toBe(false);
		});
	});

	describe('getProviderModels', () => {
		it('should return models for valid provider', () => {
			const models = getProviderModels(BuiltinProviders.ANTHROPIC);
			expect(models.length).toBeGreaterThan(0);
			expect(models).toContain('claude-opus-4.6');
			expect(models).toContain('claude-sonnet-4.6');
			expect(models).toContain('claude-opus-4.5');
		});

		it('should return empty array for invalid provider', () => {
			const models = getProviderModels('invalid-provider');
			expect(models).toEqual([]);
		});

		it('should return unique models only', () => {
			const models = getProviderModels(BuiltinProviders.OPENAI);
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
			expect(models).toContain('grok-4.3');
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
			expect(getDefaultModel(BuiltinProviders.ANTHROPIC)).toBe('claude-fable-5');
			expect(getDefaultModel(BuiltinProviders.OPENAI)).toBe('gpt-5.5');
			expect(getDefaultModel(BuiltinProviders.CURSOR)).toBe('cursor-sonnet-4.6');
			expect(getDefaultModel(BuiltinProviders.XAI)).toBe('grok-4.3');
			expect(getDefaultModel(BuiltinProviders.GOOGLE)).toBe('gemini-3.5-flash');
			expect(getDefaultModel(BuiltinProviders.MOONSHOT)).toBe('kimi-k2.6');
		});

		it('should return undefined for invalid provider', () => {
			expect(getDefaultModel('invalid-provider')).toBeUndefined();
		});
	});

	describe('getModelContextWindow', () => {
		it('should report context windows for the new frontier models', () => {
			expect(getModelContextWindow('claude-opus-4.8')).toBe(1_000_000);
			expect(getModelContextWindow('claude-fable-5')).toBe(1_000_000);
			expect(getModelContextWindow('claude-sonnet-5')).toBe(1_000_000);
			expect(getModelContextWindow('gpt-5.5')).toBe(1_000_000);
			expect(getModelContextWindow('gemini-3.5-pro')).toBe(2_000_000);
			expect(getModelContextWindow('grok-4.3')).toBe(1_000_000);
			expect(getModelContextWindow('kimi-k2.6')).toBe(256_000);
		});

		it('should fall back to the default window for unknown models', () => {
			expect(getModelContextWindow('totally-unknown-model')).toBe(DEFAULT_CONTEXT_WINDOW);
		});
	});

	describe('isValidProvider', () => {
		it('should return true for valid providers', () => {
			expect(isValidProvider(BuiltinProviders.ANTHROPIC)).toBe(true);
			expect(isValidProvider(BuiltinProviders.OPENAI)).toBe(true);
			expect(isValidProvider(BuiltinProviders.CURSOR)).toBe(true);
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

	describe('single source of truth', () => {
		it('every offered model is owned by exactly one provider descriptor', () => {
			const owners = new Map<string, string[]>();
			for (const [key, metadata] of Object.entries(PROVIDER_REGISTRY)) {
				for (const { model } of metadata.modelModes) {
					owners.set(model, [...(owners.get(model) ?? []), key]);
				}
			}
			for (const [model, providers] of owners) {
				expect(new Set(providers).size, `${model} is offered by more than one provider: ${providers.join(', ')}`).toBe(
					1
				);
			}
		});

		it('sources pricing from the owning provider descriptor', () => {
			// Anthropic Opus 4.8 pricing lives in anthropic.models.ts and is surfaced via the aggregator.
			expect(getModelPricing('claude-opus-4.8')).toEqual({
				cache_read: 0.5,
				cache_write: 6.25,
				input: 5.0,
				output: 25.0
			});
			expect(getModelPricing('gpt-5.6-terra')).toEqual({ cache_read: 0.25, input: 2.5, output: 15.0 });
			// A model without declared pricing returns undefined (no hidden fallback table).
			expect(getModelPricing('gemini-3.5-pro')).toBeUndefined();
		});

		it('resolves both alias and resolved API id to the same context window and pricing', () => {
			// The aggregator expands each alias to its standard/vertex API ids.
			expect(getModelContextWindow('claude-opus-4-8')).toBe(getModelContextWindow('claude-opus-4.8'));
			expect(getModelPricing('claude-haiku-4-5-20251001')).toEqual(getModelPricing('claude-haiku-4.5'));
		});
	});

	describe('resolveApiModelId', () => {
		it('maps Anthropic dotted aliases to real API ids (standard and Vertex)', () => {
			expect(resolveApiModelId('claude-opus-4.8')).toBe('claude-opus-4-8');
			expect(resolveApiModelId('claude-opus-4.8', true)).toBe('claude-opus-4-8');
			expect(resolveApiModelId('claude-haiku-4.5')).toBe('claude-haiku-4-5-20251001');
			expect(resolveApiModelId('claude-haiku-4.5', true)).toBe('claude-haiku-4-5@20251001');
		});

		it('returns the model unchanged when the provider declares no mapping', () => {
			expect(resolveApiModelId('gpt-5.5')).toBe('gpt-5.5');
			expect(resolveApiModelId('grok-4.3')).toBe('grok-4.3');
		});
	});
});
