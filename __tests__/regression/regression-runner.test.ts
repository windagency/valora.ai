import { describe, expect, it } from 'vitest';

import { jaccardWordSimilarity, meetsOutputShape, RegressionRunner } from '../../src/regression/regression-runner';
import type { RegressionBaseline, RegressionScenario } from '../../src/regression/regression-runner';

const scenario: RegressionScenario = {
	description: 'test scenario',
	expectedOutputShape: { minLength: 5, mustContainAny: ['hello', 'hi'] },
	id: 'test',
	messages: [{ content: 'say hello', role: 'user' }]
};

const baseline: RegressionBaseline = {
	capturedAt: '2026-05-06T00:00:00Z',
	model: 'claude-test',
	modelVersion: 'test-version',
	scenarioId: 'test',
	transcript: [
		{
			request: { messages: [{ content: 'say hello', role: 'user' }] },
			response: { content: 'Hello there! How are you?', role: 'assistant' }
		}
	]
};

describe('jaccardWordSimilarity', () => {
	it('returns 1.0 for identical strings', () => {
		expect(jaccardWordSimilarity('hello world', 'hello world')).toBe(1);
	});

	it('returns 0 for completely different strings', () => {
		expect(jaccardWordSimilarity('foo bar', 'baz qux')).toBe(0);
	});

	it('returns a value between 0 and 1 for partially overlapping strings', () => {
		const sim = jaccardWordSimilarity('hello world foo', 'hello world bar');
		expect(sim).toBeGreaterThan(0);
		expect(sim).toBeLessThan(1);
	});

	it('is symmetric', () => {
		const a = 'apple banana cherry';
		const b = 'banana cherry date';
		expect(jaccardWordSimilarity(a, b)).toBeCloseTo(jaccardWordSimilarity(b, a));
	});
});

describe('meetsOutputShape', () => {
	it('passes when content meets all shape requirements', () => {
		expect(meetsOutputShape('hello world', { minLength: 5, mustContainAny: ['hello'] })).toBe(true);
	});

	it('fails when content is shorter than minLength', () => {
		expect(meetsOutputShape('hi', { minLength: 5, mustContainAny: [] })).toBe(false);
	});

	it('fails when none of mustContainAny terms are present', () => {
		expect(meetsOutputShape('goodbye world', { minLength: 5, mustContainAny: ['hello', 'hi'] })).toBe(false);
	});

	it('passes with empty mustContainAny', () => {
		expect(meetsOutputShape('anything here', { minLength: 5, mustContainAny: [] })).toBe(true);
	});
});

describe('RegressionRunner', () => {
	it('returns zero deviations when no baselines are present', async () => {
		const runner = new RegressionRunner([], 0.5);
		const results = await runner.run([scenario], async () => ({
			content: 'Hello there!',
			role: 'assistant'
		}));
		expect(results.deviations).toHaveLength(0);
		expect(results.skipped).toHaveLength(1);
	});

	it('passes when response meets shape and similarity is above threshold', async () => {
		const runner = new RegressionRunner([baseline], 0.3);
		const results = await runner.run([scenario], async () => ({
			content: 'Hello there! How are you?',
			role: 'assistant'
		}));
		expect(results.deviations).toHaveLength(0);
		expect(results.passed).toHaveLength(1);
	});

	it('reports deviation when response fails output shape check', async () => {
		const runner = new RegressionRunner([baseline], 0.3);
		const results = await runner.run([scenario], async () => ({
			content: 'x',
			role: 'assistant'
		}));
		expect(results.deviations).toHaveLength(1);
		expect(results.deviations[0]!.reason).toMatch(/shape/i);
	});

	it('reports deviation when similarity falls below threshold', async () => {
		const runner = new RegressionRunner([baseline], 0.99);
		// Meets shape (contains 'hello', long enough) but word overlap with baseline is low
		const results = await runner.run([scenario], async () => ({
			content: 'hello — completely unexpected response vocabulary diverges significantly from baseline',
			role: 'assistant'
		}));
		expect(results.deviations).toHaveLength(1);
		expect(results.deviations[0]!.reason).toMatch(/similarity/i);
	});
});
