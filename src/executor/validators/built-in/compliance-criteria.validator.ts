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

function hasSelfReportedEvidence(output: Record<string, unknown>): boolean {
	const checks = output['checks_performed'];
	return Array.isArray(checks) && checks.length > 0;
}

/**
 * A non-empty `checks_performed` array is entirely self-reported by the same
 * stage claiming the clearance — `checks_performed: ["x"]` alongside
 * `sanctions_cleared: true` satisfied this validator with zero real
 * verification. Requiring at least one independently-observed real tool
 * call during the stage closes that: a stage that made no real tool calls at
 * all cannot have actually performed any check, regardless of what it claims.
 */
function hasRealToolCallEvidence(context: ValidatorContext): boolean {
	return (context.executedToolCalls?.length ?? 0) > 0;
}

export const complianceCriteriaValidator: DeterministicValidator = {
	name: 'compliance-criteria',

	validate(output: Record<string, unknown>, context: ValidatorContext): DeterministicValidationResult {
		const violations: string[] = [];
		const hasEvidence = hasSelfReportedEvidence(output) && hasRealToolCallEvidence(context);

		for (const { label, outputKey } of CLEARANCE_CLAIMS) {
			if (output[outputKey] !== true) continue;
			if (!hasEvidence) {
				violations.push(
					`${label} claimed true but no supporting checks_performed entries backed by real tool-call evidence found — possible hallucination`
				);
			}
		}

		if (violations.length === 0) {
			return { passed: true, shouldStopPipeline: false, violations: [] };
		}

		return { passed: false, shouldStopPipeline: true, violations };
	}
};
