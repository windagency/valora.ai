import { describe, it, expect } from 'vitest';

import { complianceCriteriaValidator } from './compliance-criteria.validator';

const CTX = { stageName: 'asserter.compliance-check' };

describe('complianceCriteriaValidator', () => {
	it('passes when no clearances are claimed', () => {
		expect(complianceCriteriaValidator.validate({}, CTX).passed).toBe(true);
	});

	it('passes when sanctions clearance is claimed and checks_performed is non-empty', () => {
		const output = {
			sanctions_cleared: true,
			checks_performed: ['OFAC SDN lookup', 'EU sanctions list']
		};
		expect(complianceCriteriaValidator.validate(output, CTX).passed).toBe(true);
	});

	it('fails when sanctions_cleared is true but checks_performed is absent', () => {
		const result = complianceCriteriaValidator.validate({ sanctions_cleared: true }, CTX);
		expect(result.passed).toBe(false);
		expect(result.shouldStopPipeline).toBe(true);
		expect(result.violations[0]).toMatch(/sanctions/i);
	});

	it('fails when sanctions_cleared is true but checks_performed is empty', () => {
		const result = complianceCriteriaValidator.validate({ sanctions_cleared: true, checks_performed: [] }, CTX);
		expect(result.passed).toBe(false);
	});

	it('passes when ofac_cleared is false regardless of checks', () => {
		expect(complianceCriteriaValidator.validate({ ofac_cleared: false }, CTX).passed).toBe(true);
	});

	it('fails when ofac_cleared is true but checks_performed is absent', () => {
		const result = complianceCriteriaValidator.validate({ ofac_cleared: true }, CTX);
		expect(result.passed).toBe(false);
		expect(result.violations[0]).toMatch(/OFAC/i);
	});

	it('accumulates one violation per unsupported clearance claim', () => {
		const result = complianceCriteriaValidator.validate({ sanctions_cleared: true, ofac_cleared: true }, CTX);
		expect(result.violations).toHaveLength(2);
	});
});
