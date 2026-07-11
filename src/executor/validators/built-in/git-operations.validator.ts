import type {
	DeterministicValidationResult,
	DeterministicValidator,
	ExecutedToolCall,
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

/**
 * Re-derives the real git-shaped commands actually executed via
 * `run_terminal_cmd` during this stage — independent of what the stage's own
 * `operations`/`commands` output claims. A compromised or hallucinating
 * stage can force `passed: true` simply by omitting a dangerous operation
 * from its self-report while still executing it via a real tool call; this
 * ground-truth cross-check closes that specific spoof.
 */
function extractExecutedGitCommands(executedToolCalls: ExecutedToolCall[] | undefined): string[] {
	if (!executedToolCalls) return [];
	return executedToolCalls
		.filter((call) => call.name === 'run_terminal_cmd')
		.map((call) => call.arguments['command'])
		.filter((command): command is string => typeof command === 'string');
}

function isDangerous(op: string): boolean {
	return DANGEROUS_PATTERNS.some((pattern) => pattern.test(op));
}

export const gitOperationsValidator: DeterministicValidator = {
	name: 'git-operations',

	validate(output: Record<string, unknown>, context: ValidatorContext): DeterministicValidationResult {
		const operations = [...extractOperations(output), ...extractExecutedGitCommands(context.executedToolCalls)];
		if (operations.length === 0) {
			return { passed: true, shouldStopPipeline: false, violations: [] };
		}

		const violations = [...new Set(operations.filter(isDangerous))].map(
			(op) => `Dangerous git operation blocked: ${op}`
		);

		if (violations.length === 0) {
			return { passed: true, shouldStopPipeline: false, violations: [] };
		}

		return { passed: false, shouldStopPipeline: true, violations };
	}
};
