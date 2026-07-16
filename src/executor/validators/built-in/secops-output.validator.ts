import type {
	DeterministicValidationResult,
	DeterministicValidator,
	ValidatorContext
} from 'executor/validators/types';

const HIGH_RISK_SEVERITIES = new Set(['critical', 'high']);

/**
 * `acknowledged: true` is set by the same stage reporting the finding — a
 * compromised or hallucinating stage can mark every finding acknowledged
 * with zero real investigation behind it. Requiring at least one
 * independently-observed real tool call during the stage is a minimal
 * ground-truth floor: a stage that made no real tool calls at all cannot
 * have investigated anything, regardless of what it claims.
 */
function checkFinding(finding: unknown, hasRealInvestigation: boolean): null | string {
	if (!isFinding(finding)) return null;
	const severity = String(finding['severity'] ?? '').toLowerCase();
	if (!HIGH_RISK_SEVERITIES.has(severity)) return null;
	if (finding['acknowledged'] === true && hasRealInvestigation) return null;
	const description = String(finding['description'] ?? finding['title'] ?? 'unknown finding');
	const reason = finding['acknowledged'] === true ? 'acknowledged but unverified' : 'unacknowledged';
	return `${reason} ${severity} finding: ${description}`;
}

function isFinding(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

export const secopOutputValidator: DeterministicValidator = {
	name: 'secops-output',

	validate(output: Record<string, unknown>, context: ValidatorContext): DeterministicValidationResult {
		const findings = output['findings'];
		if (!Array.isArray(findings) || findings.length === 0) {
			return { passed: true, shouldStopPipeline: false, violations: [] };
		}

		const hasRealInvestigation = (context.executedToolCalls?.length ?? 0) > 0;
		const violations = findings.flatMap((finding) => {
			const violation = checkFinding(finding, hasRealInvestigation);
			return violation !== null ? [violation] : [];
		});

		if (violations.length === 0) {
			return { passed: true, shouldStopPipeline: false, violations: [] };
		}

		return { passed: false, shouldStopPipeline: true, violations };
	}
};
