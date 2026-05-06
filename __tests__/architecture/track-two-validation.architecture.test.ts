import { describe, it, expect, beforeAll } from 'vitest';

// Load built-in registrations
import 'executor/validators/built-in/index';
import { hasValidator } from 'executor/validators/registry';

/**
 * Stages that are compliance-critical — every one of these must have a
 * registered DeterministicValidator.  Adding a stage here without a matching
 * registration will cause the build to fail (enforced by this test).
 */
const COMPLIANCE_CRITICAL_STAGES = ['secops', 'compliance', 'git-operations'] as const;

describe('Track-Two validation architecture', () => {
	it('every compliance-critical stage has a registered DeterministicValidator', () => {
		const missing = COMPLIANCE_CRITICAL_STAGES.filter((stage) => !hasValidator(stage));
		expect(missing, `Stages without a DeterministicValidator: ${missing.join(', ')}`).toHaveLength(0);
	});
});
