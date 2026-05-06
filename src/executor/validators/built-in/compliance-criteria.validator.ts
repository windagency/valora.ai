import type {
	DeterministicValidationResult,
	DeterministicValidator,
	ValidatorContext
} from 'executor/validators/types';

interface ClearanceClaim {
	label: string;
	outputKey: string;
}

const CLEARANCE_CLAIMS: ClearanceClaim[] = [
	{ label: 'Sanctions clearance', outputKey: 'sanctions_cleared' },
	{ label: 'OFAC clearance', outputKey: 'ofac_cleared' }
];

function hasEvidence(output: Record<string, unknown>): boolean {
	const checks = output['checks_performed'];
	return Array.isArray(checks) && checks.length > 0;
}

export const complianceCriteriaValidator: DeterministicValidator = {
	name: 'compliance-criteria',

	validate(output: Record<string, unknown>, _context: ValidatorContext): DeterministicValidationResult {
		const violations: string[] = [];

		for (const { label, outputKey } of CLEARANCE_CLAIMS) {
			if (output[outputKey] !== true) continue;
			if (!hasEvidence(output)) {
				violations.push(
					`${label} claimed true but no supporting checks_performed entries found — possible hallucination`
				);
			}
		}

		if (violations.length === 0) {
			return { passed: true, shouldStopPipeline: false, violations: [] };
		}

		return { passed: false, shouldStopPipeline: true, violations };
	}
};
