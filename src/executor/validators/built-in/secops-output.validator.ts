import type {
	DeterministicValidationResult,
	DeterministicValidator,
	ValidatorContext
} from 'executor/validators/types';

const HIGH_RISK_SEVERITIES = new Set(['critical', 'high']);

function checkFinding(finding: unknown): null | string {
	if (!isFinding(finding)) return null;
	if (finding['acknowledged'] === true) return null;
	const severity = String(finding['severity'] ?? '').toLowerCase();
	if (!HIGH_RISK_SEVERITIES.has(severity)) return null;
	const description = String(finding['description'] ?? finding['title'] ?? 'unknown finding');
	return `Unacknowledged ${severity} finding: ${description}`;
}

function isFinding(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

export const secopOutputValidator: DeterministicValidator = {
	name: 'secops-output',

	validate(output: Record<string, unknown>, _context: ValidatorContext): DeterministicValidationResult {
		const findings = output['findings'];
		if (!Array.isArray(findings) || findings.length === 0) {
			return { passed: true, shouldStopPipeline: false, violations: [] };
		}

		const violations = findings.flatMap((finding) => {
			const violation = checkFinding(finding);
			return violation !== null ? [violation] : [];
		});

		if (violations.length === 0) {
			return { passed: true, shouldStopPipeline: false, violations: [] };
		}

		return { passed: false, shouldStopPipeline: true, violations };
	}
};
