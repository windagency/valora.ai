/**
 * Tests for token estimator cache pricing functionality
 */

import { describe, expect, it } from 'vitest';

import type { LLMUsage } from 'types/llm.types';

import { calculateActualCost, getModelPricing } from './token-estimator';

describe('calculateActualCost', () => {
	it('should calculate basic cost without cache fields', () => {
		const usage: LLMUsage = {
			completion_tokens: 500,
			prompt_tokens: 1000,
			total_tokens: 1500
		};

		const result = calculateActualCost(usage, 'claude-3-5-sonnet-latest');

		// input: 1000/1M * 3.0 = 0.003
		// output: 500/1M * 15.0 = 0.0075
		// total = 0.0105
		expect(result.totalCost).toBe(0.0105);
		expect(result.cacheSavings).toBe(0);
	});

	it('should calculate cost with cache write tokens', () => {
		const usage: LLMUsage = {
			cache_creation_input_tokens: 2000,
			completion_tokens: 500,
			prompt_tokens: 1000,
			total_tokens: 1500
		};

		const result = calculateActualCost(usage, 'claude-3-5-sonnet-latest');

		// input: 1000/1M * 3.0 = 0.003
		// output: 500/1M * 15.0 = 0.0075
		// cache_write: 2000/1M * 3.75 = 0.0075
		// total = 0.018
		expect(result.totalCost).toBe(0.018);
		expect(result.cacheSavings).toBe(0);
	});

	it('should calculate cost with cache read tokens and savings', () => {
		const usage: LLMUsage = {
			cache_read_input_tokens: 10000,
			completion_tokens: 500,
			prompt_tokens: 1000,
			total_tokens: 1500
		};

		const result = calculateActualCost(usage, 'claude-3-5-sonnet-latest');

		// input: 1000/1M * 3.0 = 0.003
		// output: 500/1M * 15.0 = 0.0075
		// cache_read: 10000/1M * 0.3 = 0.003
		// total = 0.0135
		expect(result.totalCost).toBe(0.0135);

		// savings: (10000/1M * 3.0) - (10000/1M * 0.3) = 0.03 - 0.003 = 0.027
		expect(result.cacheSavings).toBe(0.027);
	});

	it('should use default pricing for unknown models', () => {
		const usage: LLMUsage = {
			completion_tokens: 1000,
			prompt_tokens: 1000,
			total_tokens: 2000
		};

		const result = calculateActualCost(usage, 'unknown-model');

		// default input: 1000/1M * 3.0 = 0.003
		// default output: 1000/1M * 15.0 = 0.015
		expect(result.totalCost).toBe(0.018);
	});

	it('should handle undefined model', () => {
		const usage: LLMUsage = {
			completion_tokens: 0,
			prompt_tokens: 0,
			total_tokens: 0
		};

		const result = calculateActualCost(usage);

		expect(result.totalCost).toBe(0);
		expect(result.cacheSavings).toBe(0);
	});

	it('should calculate correctly for OpenAI model with automatic caching (no write surcharge)', () => {
		const usage: LLMUsage = {
			cache_read_input_tokens: 20000,
			completion_tokens: 500,
			prompt_tokens: 5000,
			total_tokens: 5500
		};

		const result = calculateActualCost(usage, 'gpt-5');

		// input: 5000/1M * 1.25 = 0.00625
		// output: 500/1M * 10.0 = 0.005
		// cache_read: 20000/1M * 0.125 = 0.0025
		// no cache_write surcharge for OpenAI
		// total = 0.01375
		expect(result.totalCost).toBe(0.0138); // rounded to 4 decimal places

		// savings: (20000/1M * 1.25) - (20000/1M * 0.125) = 0.025 - 0.0025 = 0.0225
		expect(result.cacheSavings).toBe(0.0225);
	});

	it('should calculate correctly for Google model with context caching', () => {
		const usage: LLMUsage = {
			cache_read_input_tokens: 100000,
			completion_tokens: 1000,
			prompt_tokens: 10000,
			total_tokens: 11000
		};

		const result = calculateActualCost(usage, 'gemini-2.5-pro');

		// input: 10000/1M * 1.25 = 0.0125
		// output: 1000/1M * 10.0 = 0.01
		// cache_read: 100000/1M * 0.125 = 0.0125
		// total = 0.035
		expect(result.totalCost).toBe(0.035);

		// savings: (100000/1M * 1.25) - (100000/1M * 0.125) = 0.125 - 0.0125 = 0.1125
		expect(result.cacheSavings).toBe(0.1125);
	});

	it('should calculate correctly for haiku model with caching', () => {
		const usage: LLMUsage = {
			cache_creation_input_tokens: 5000,
			cache_read_input_tokens: 50000,
			completion_tokens: 1000,
			prompt_tokens: 2000,
			total_tokens: 3000
		};

		const result = calculateActualCost(usage, 'claude-haiku-4.5');

		// input: 2000/1M * 1.0 = 0.002
		// output: 1000/1M * 5.0 = 0.005
		// cache_write: 5000/1M * 1.25 = 0.00625
		// cache_read: 50000/1M * 0.1 = 0.005
		// total = 0.01825
		expect(result.totalCost).toBe(0.0183); // rounded to 4 decimal places

		// savings: (50000/1M * 1.0) - (50000/1M * 0.1) = 0.05 - 0.005 = 0.045
		expect(result.cacheSavings).toBe(0.045);
	});
});

describe('getModelPricing', () => {
	it('should return cache pricing for Anthropic models', () => {
		const pricing = getModelPricing('claude-sonnet-4.6');

		expect(pricing).toBeDefined();
		expect(pricing?.cache_read).toBeDefined();
		expect(pricing?.cache_write).toBeDefined();
		expect(pricing?.cache_read).toBeLessThan(pricing!.input);
		expect(pricing?.cache_write).toBeGreaterThan(pricing!.input);
	});

	it('should include cache_read pricing for OpenAI models with automatic caching', () => {
		const pricing = getModelPricing('gpt-5');

		expect(pricing).toBeDefined();
		expect(pricing?.cache_read).toBeDefined();
		expect(pricing?.cache_read).toBeLessThan(pricing!.input);
		// OpenAI automatic caching has no write surcharge
		expect(pricing?.cache_write).toBeUndefined();
	});

	it('should include cache_read pricing for Google models with context caching', () => {
		const pricing = getModelPricing('gemini-2.5-pro');

		expect(pricing).toBeDefined();
		expect(pricing?.cache_read).toBeDefined();
		expect(pricing?.cache_read).toBeLessThan(pricing!.input);
	});

	it('should return undefined for unknown models', () => {
		const pricing = getModelPricing('unknown-model');
		expect(pricing).toBeUndefined();
	});
});
