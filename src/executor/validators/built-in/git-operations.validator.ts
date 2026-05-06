import type {
	DeterministicValidationResult,
	DeterministicValidator,
	ValidatorContext
} from 'executor/validators/types';

const DANGEROUS_PATTERNS: RegExp[] = [
	/git\s+push\s+(-f|--force)\s+\S*\s+(main|master)/,
	/git\s+reset\s+--hard/,
	/git\s+branch\s+-D\s+(main|master)/,
	/git\s+push\s+\S*\s+--delete\s+(main|master)/
];

function extractOperations(output: Record<string, unknown>): string[] {
	const ops = output['operations'] ?? output['commands'];
	if (!Array.isArray(ops)) return [];
	return ops.filter((op): op is string => typeof op === 'string');
}

function isDangerous(op: string): boolean {
	return DANGEROUS_PATTERNS.some((pattern) => pattern.test(op));
}

export const gitOperationsValidator: DeterministicValidator = {
	name: 'git-operations',

	validate(output: Record<string, unknown>, _context: ValidatorContext): DeterministicValidationResult {
		const operations = extractOperations(output);
		if (operations.length === 0) {
			return { passed: true, shouldStopPipeline: false, violations: [] };
		}

		const violations = operations.filter(isDangerous).map((op) => `Dangerous git operation blocked: ${op}`);

		if (violations.length === 0) {
			return { passed: true, shouldStopPipeline: false, violations: [] };
		}

		return { passed: false, shouldStopPipeline: true, violations };
	}
};
