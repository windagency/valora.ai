export interface DeterministicValidationResult {
	passed: boolean;
	shouldStopPipeline: boolean;
	violations: string[];
}

export interface DeterministicValidator {
	name: string;
	validate(output: Record<string, unknown>, context: ValidatorContext): DeterministicValidationResult;
}

export interface ValidatorContext {
	stageName: string;
}
