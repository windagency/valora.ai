/**
 * Tests for validation helpers
 */

import { describe, expect, it } from 'vitest';

import { ProviderName } from './providers.config';
import { DEFAULT_MODELS, PROVIDER_CHOICES, PROVIDER_LABELS, QUICK_SETUP_CHOICES } from './validation-helpers';

describe('validation-helpers', () => {
	describe('PROVIDER_LABELS', () => {
		it('should include Cursor provider', () => {
			expect(PROVIDER_LABELS).toHaveProperty(ProviderName.CURSOR);
			expect(PROVIDER_LABELS[ProviderName.CURSOR]).toBe('Cursor');
		});

		it('should include all standard providers', () => {
			expect(PROVIDER_LABELS).toHaveProperty(ProviderName.ANTHROPIC);
			expect(PROVIDER_LABELS).toHaveProperty(ProviderName.OPENAI);
			expect(PROVIDER_LABELS).toHaveProperty(ProviderName.GOOGLE);
			expect(PROVIDER_LABELS).toHaveProperty(ProviderName.XAI);
			expect(PROVIDER_LABELS).toHaveProperty(ProviderName.MOONSHOT);
		});
	});

	describe('DEFAULT_MODELS', () => {
		it('should include Cursor with correct default model', () => {
			expect(DEFAULT_MODELS).toHaveProperty(ProviderName.CURSOR);
			expect(DEFAULT_MODELS[ProviderName.CURSOR]).toBe('cursor-sonnet-4.5');
		});

		it('should include xAI with grok-code', () => {
			expect(DEFAULT_MODELS).toHaveProperty(ProviderName.XAI);
			expect(DEFAULT_MODELS[ProviderName.XAI]).toBe('grok-code');
		});

		it('should have default models for all providers', () => {
			expect(DEFAULT_MODELS[ProviderName.ANTHROPIC]).toBe('claude-opus-4.5');
			expect(DEFAULT_MODELS[ProviderName.GOOGLE]).toBe('gemini-2.5-pro');
			expect(DEFAULT_MODELS[ProviderName.MOONSHOT]).toBe('kimi-k2');
			expect(DEFAULT_MODELS[ProviderName.OPENAI]).toBe('gpt-5');
		});
	});

	describe('PROVIDER_CHOICES', () => {
		it('should include Cursor provider option', () => {
			const cursorChoice = PROVIDER_CHOICES.find((choice) => choice.value === ProviderName.CURSOR);
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
			expect(providers).toContain(ProviderName.ANTHROPIC);
			expect(providers).toContain(ProviderName.CURSOR);
			expect(providers).toContain(ProviderName.OPENAI);
			expect(providers).toContain(ProviderName.GOOGLE);
			expect(providers).toContain(ProviderName.XAI);
			expect(providers).toContain(ProviderName.MOONSHOT);
		});
	});

	describe('QUICK_SETUP_CHOICES', () => {
		it('should have Cursor as first option', () => {
			expect(QUICK_SETUP_CHOICES[0].value).toBe(ProviderName.CURSOR);
			expect(QUICK_SETUP_CHOICES[0].name).toContain('No API key needed');
		});

		it('should include key providers for quick setup', () => {
			const providers = QUICK_SETUP_CHOICES.map((c) => c.value);
			expect(providers).toContain(ProviderName.CURSOR);
			expect(providers).toContain(ProviderName.ANTHROPIC);
			expect(providers).toContain(ProviderName.OPENAI);
			expect(providers).toContain(ProviderName.GOOGLE);
		});

		it('should have at least 4 quick setup options', () => {
			expect(QUICK_SETUP_CHOICES.length).toBeGreaterThanOrEqual(4);
		});
	});
});
