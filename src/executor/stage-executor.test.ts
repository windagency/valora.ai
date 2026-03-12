import { describe, expect, it } from 'vitest';
import { DEFAULT_FAILURE_POLICY } from './stage-executor';

describe('DEFAULT_FAILURE_POLICY', () => {
	it('assigns tolerant to read-only/exploratory stage types', () => {
		expect(DEFAULT_FAILURE_POLICY.context).toBe('tolerant');
		expect(DEFAULT_FAILURE_POLICY.review).toBe('tolerant');
		expect(DEFAULT_FAILURE_POLICY.plan).toBe('tolerant');
		expect(DEFAULT_FAILURE_POLICY.breakdown).toBe('tolerant');
		expect(DEFAULT_FAILURE_POLICY.onboard).toBe('tolerant');
		expect(DEFAULT_FAILURE_POLICY.documentation).toBe('tolerant');
	});

	it('assigns strict to mutating stage types', () => {
		expect(DEFAULT_FAILURE_POLICY.code).toBe('strict');
		expect(DEFAULT_FAILURE_POLICY.test).toBe('strict');
		expect(DEFAULT_FAILURE_POLICY.refactor).toBe('strict');
		expect(DEFAULT_FAILURE_POLICY.deployment).toBe('strict');
		expect(DEFAULT_FAILURE_POLICY.maintenance).toBe('strict');
	});

	it('covers all stage types', () => {
		const allStageTypes = [
			'breakdown',
			'code',
			'context',
			'deployment',
			'documentation',
			'maintenance',
			'onboard',
			'plan',
			'refactor',
			'review',
			'test'
		];
		for (const stageType of allStageTypes) {
			expect(DEFAULT_FAILURE_POLICY).toHaveProperty(stageType);
		}
	});

	it('only contains valid policy values', () => {
		const validPolicies = ['strict', 'tolerant', 'lenient'];
		for (const policy of Object.values(DEFAULT_FAILURE_POLICY)) {
			expect(validPolicies).toContain(policy);
		}
	});
});
