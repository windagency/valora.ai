import { describe, it, expect } from 'vitest';

import type { ExecutedToolCall } from 'executor/validators/types';
import { complianceCriteriaValidator } from './compliance-criteria.validator';

const CTX = { stageName: 'asserter.compliance-check' };

const ONE_REAL_TOOL_CALL: ExecutedToolCall[] = [{ arguments: { query: 'OFAC SDN lookup' }, name: 'web_search' }];

const CTX_WITH_EVIDENCE = { ...CTX, executedToolCalls: ONE_REAL_TOOL_CALL };

describe('complianceCriteriaValidator', () => {
	it('passes when no clearances are claimed', () => {
		expect(complianceCriteriaValidator.validate({}, CTX).passed).toBe(true);
	});

	it('passes when sanctions clearance is claimed, checks_performed is non-empty, and at least one real tool call backs it', () => {
		const output = {
			sanctions_cleared: true,
			checks_performed: ['OFAC SDN lookup', 'EU sanctions list']
		};
		expect(complianceCriteriaValidator.validate(output, CTX_WITH_EVIDENCE).passed).toBe(true);
	});

	it('fails when sanctions_cleared is claimed with a non-empty checks_performed array but zero real tool calls were made — self-reported evidence alone is not enough', () => {
		// The exact spoof: checks_performed: ["x"] alongside sanctions_cleared:
		// true previously satisfied this validator with zero real
		// verification. A stage that made no real tool calls at all cannot
		// have actually performed any check, regardless of what it claims.
		const output = {
			sanctions_cleared: true,
			checks_performed: ['OFAC SDN lookup', 'EU sanctions list']
		};
		const result = complianceCriteriaValidator.validate(output, CTX);
		expect(result.passed).toBe(false);
		expect(result.shouldStopPipeline).toBe(true);
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
