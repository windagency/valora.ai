/**
 * Pipeline Validator - Validates pipeline structure and dependencies
 *
 * MAINT-002: Large Files Need Splitting - Extracted from pipeline.ts
 */

import type { PipelineStage } from 'types/command.types';

export class PipelineValidator {
	/**
	 * Validate pipeline structure and dependencies
	 */
	validatePipeline(stages: PipelineStage[]): string[] {
		const errors: string[] = [];

		if (!Array.isArray(stages)) {
			errors.push('Pipeline must be an array of stages');
			return errors;
		}

		if (stages.length === 0) {
			errors.push('Pipeline must contain at least one stage');
			return errors;
		}

		// Validate each stage
		const allStageErrors = stages.flatMap((stage, i) => this.validateStage(stage, i));
		errors.push(...allStageErrors);

		// Validate stage dependencies
		const dependencyErrors = this.validateDependencies(stages);
		errors.push(...dependencyErrors);

		return errors;
	}

	/**
	 * Validate individual stage structure
	 */
	private validateStage(stage: PipelineStage, index: number): string[] {
		const errors: string[] = [];
		const prefix = `Stage ${index + 1}`;

		// Check required properties
		if (!stage || typeof stage !== 'object') {
			errors.push(`${prefix}: Stage must be an object`);
			return errors;
		}

		// Validate required fields
		const requiredFieldErrors = this.validateRequiredFields(stage, prefix);
		errors.push(...requiredFieldErrors);

		// Validate optional properties
		const optionalFieldErrors = this.validateOptionalFields(stage, prefix);
		errors.push(...optionalFieldErrors);

		return errors;
	}

	/**
	 * Validate required stage fields
	 */
	private validateRequiredFields(stage: PipelineStage, prefix: string): string[] {
		const errors: string[] = [];

		if (!stage.stage || typeof stage.stage !== 'string') {
			errors.push(`${prefix}: Missing or invalid 'stage' property`);
		}

		if (!stage.prompt || typeof stage.prompt !== 'string') {
			errors.push(`${prefix}: Missing or invalid 'prompt' property`);
		}

		return errors;
	}

	/**
	 * Validate optional stage fields
	 */
	private validateOptionalFields(stage: PipelineStage, prefix: string): string[] {
		const errors: string[] = [];

		if (stage.parallel !== undefined && typeof stage.parallel !== 'boolean') {
			errors.push(`${prefix}: 'parallel' property must be a boolean`);
		}

		if (stage.required !== undefined && typeof stage.required !== 'boolean') {
			errors.push(`${prefix}: 'required' property must be a boolean`);
		}

		return errors;
	}

	/**
	 * Validate stage dependencies and execution order
	 */
	private validateDependencies(stages: PipelineStage[]): string[] {
		const errors: string[] = [];

		// Check for duplicate stage names using reduce
		const stageNameCounts = stages.reduce((acc, stage) => {
			acc.set(stage.stage, (acc.get(stage.stage) ?? 0) + 1);
			return acc;
		}, new Map<string, number>());

		const duplicateErrors = Array.from(stageNameCounts.entries())
			.filter(([, count]) => count > 1)
			.map(([stageName]) => `Duplicate stage name: ${stageName}`);

		errors.push(...duplicateErrors);

		// Validate parallel execution constraints
		stages.reduce((_inParallelGroup, stage, i) => {
			const prevStage = i > 0 ? stages[i - 1] : null;

			if (stage.parallel) {
				// Starting or continuing a parallel group
				return true;
			}

			// Ending a parallel group
			// Check that parallel stages don't have dependencies on each other
			if (prevStage?.parallel) {
				// This is a basic check - in a real implementation you'd check variable dependencies
				// For now, just warn about potential issues
			}

			return false;
		}, false);

		return errors;
	}
}
