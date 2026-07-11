export interface DeterministicValidationResult {
	passed: boolean;
	shouldStopPipeline: boolean;
	violations: string[];
}

export interface DeterministicValidator {
	name: string;
	validate(output: Record<string, unknown>, context: ValidatorContext): DeterministicValidationResult;
}

/** A tool call actually executed and observed during the stage's tool loop — not a self-reported claim. */
export interface ExecutedToolCall {
	arguments: Record<string, unknown>;
	name: string;
}

export interface ValidatorContext {
	/**
	 * Tool calls actually executed during this stage, as independently recorded
	 * by the tool loop — not the LLM's own self-reported summary fields.
	 * Absent/empty means no real tool-call evidence is available for this
	 * stage; validators that require ground-truth backing for a claim should
	 * treat that as "no evidence", not as "trust the self-report".
	 */
	executedToolCalls?: ExecutedToolCall[];
	stageName: string;
}
