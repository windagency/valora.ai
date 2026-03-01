/**
 * Stage Validation Service
 *
 * Validates stage outputs to determine if the pipeline should stop early
 * due to insufficient or invalid input data.
 */

import { getColorAdapter } from 'output/color-adapter.interface';
import { getConsoleOutput } from 'output/console-output';
import { getRenderer } from 'output/markdown';
import { isNonEmptyArray } from 'utils/type-guards';

/**
 * Validation result from stage output check
 */
export interface StageValidationResult {
	/** Whether the stage output is valid and pipeline should continue */
	isValid: boolean;
	/** Reasons why validation failed */
	reasons: string[];
	/** Whether this is a critical failure that should stop the pipeline */
	shouldStopPipeline: boolean;
	/** Summary message for display */
	summary?: string;
}

/**
 * Thresholds for validation
 */
const VALIDATION_THRESHOLDS = {
	/** Minimum completeness score for specifications */
	MIN_COMPLETENESS_SCORE: 0.6,
	/** Minimum confidence for requirements analysis */
	MIN_CONFIDENCE_SCORE: 0.5
};

/**
 * Stages that require validation (stage.prompt format)
 * Note: Stage names are constructed as `${stage.stage}.${stage.prompt}`
 */
const VALIDATED_STAGES = [
	'context.context.load-specifications',
	'onboard.onboard.analyze-requirements',
	// Also check without the duplicate prefix in case format changes
	'context.load-specifications',
	'onboard.analyze-requirements'
];

export class StageValidationService {
	private readonly color = getColorAdapter();
	private readonly console = getConsoleOutput();
	private readonly renderer = getRenderer();

	/**
	 * Stage patterns mapped to their validation handlers
	 */
	private readonly stageValidators: Record<string, (outputs: Record<string, unknown>) => StageValidationResult> = {
		['analyze-requirements']: (outputs) => this.validateAnalyzeRequirements(outputs),
		['load-specifications']: (outputs) => this.validateLoadSpecifications(outputs)
	};

	/**
	 * Check if a stage requires validation
	 */
	requiresValidation(stageName: string): boolean {
		return (
			VALIDATED_STAGES.includes(stageName) ||
			Object.keys(this.stageValidators).some((pattern) => stageName.includes(pattern))
		);
	}

	/**
	 * Validate stage outputs and determine if pipeline should continue
	 */
	validate(stageName: string, outputs: Record<string, unknown>): StageValidationResult {
		// Find matching validator using object lookup
		const matchingPattern = Object.keys(this.stageValidators).find((pattern) => stageName.includes(pattern));

		if (matchingPattern) {
			return this.stageValidators[matchingPattern]!(outputs);
		}

		return { isValid: true, reasons: [], shouldStopPipeline: false };
	}

	/**
	 * Validate load-specifications stage outputs
	 */
	private validateLoadSpecifications(outputs: Record<string, unknown>): StageValidationResult {
		const reasons: string[] = [];

		this.checkPrdReadiness(outputs, reasons);
		this.checkCompletenessScore(outputs, reasons);
		this.checkSpecifications(outputs, reasons);
		this.checkValidationErrors(outputs, reasons);
		this.checkBlockers(outputs, reasons);

		const isValid = reasons.length === 0;

		return {
			isValid,
			reasons,
			shouldStopPipeline: !isValid,
			summary: isValid ? undefined : this.buildSpecificationsSummary(outputs, reasons)
		};
	}

	/**
	 * Check if ready_for_prd is explicitly false
	 */
	private checkPrdReadiness(outputs: Record<string, unknown>, reasons: string[]): void {
		if (outputs['ready_for_prd'] === false) {
			reasons.push('Specifications are not ready for PRD generation');
		}
	}

	/**
	 * Check completeness score threshold
	 */
	private checkCompletenessScore(outputs: Record<string, unknown>, reasons: string[]): void {
		const completenessScore = outputs['completeness_score'];
		if (typeof completenessScore === 'number' && completenessScore < VALIDATION_THRESHOLDS.MIN_COMPLETENESS_SCORE) {
			reasons.push(
				`Completeness score (${Math.round(completenessScore * 100)}%) is below minimum threshold (${Math.round(VALIDATION_THRESHOLDS.MIN_COMPLETENESS_SCORE * 100)}%)`
			);
		}
	}

	/**
	 * Check specifications for missing critical sections
	 */
	private checkSpecifications(outputs: Record<string, unknown>, reasons: string[]): void {
		const specifications = outputs['specifications'];
		if (!specifications) {
			reasons.push('No specifications found in input');
			return;
		}
		if (typeof specifications !== 'object') {
			return;
		}
		const missingCriticalFields = this.checkMissingCriticalFields(specifications as Record<string, unknown>);
		if (missingCriticalFields.length > 0) {
			reasons.push(`Missing critical sections: ${missingCriticalFields.join(', ')}`);
		}
	}

	/**
	 * Check for validation errors in output
	 */
	private checkValidationErrors(outputs: Record<string, unknown>, reasons: string[]): void {
		const validationErrors = outputs['validation_errors'];
		if (isNonEmptyArray(validationErrors)) {
			reasons.push(...validationErrors.map((e) => (typeof e === 'string' ? e : String(e))));
		}
	}

	/**
	 * Check for blockers
	 */
	private checkBlockers(outputs: Record<string, unknown>, reasons: string[]): void {
		const blockers = outputs['blockers'];
		if (isNonEmptyArray(blockers)) {
			reasons.push(`Blockers found: ${blockers.map((b) => (typeof b === 'string' ? b : String(b))).join(', ')}`);
		}
	}

	/**
	 * Validate analyze-requirements stage outputs
	 */
	private validateAnalyzeRequirements(outputs: Record<string, unknown>): StageValidationResult {
		const reasons: string[] = [];

		this.validateRequirementAnalysis(outputs, reasons);
		this.validateComplexityEstimate(outputs, reasons);
		this.validateExplicitFailures(outputs, reasons);

		const valid = reasons.length === 0;

		return {
			isValid: valid,
			reasons,
			shouldStopPipeline: !valid,
			summary: valid ? undefined : this.buildRequirementsSummary(outputs, reasons)
		};
	}

	/**
	 * Validate the requirement_analysis field
	 */
	private validateRequirementAnalysis(outputs: Record<string, unknown>, reasons: string[]): void {
		const analysis = outputs['requirement_analysis'];
		if (!analysis) {
			reasons.push('No requirement analysis generated');
			return;
		}

		if (typeof analysis !== 'object') {
			return;
		}

		const analysisObj = analysis as Record<string, unknown>;
		if (this.isEmptyOrPlaceholder(analysisObj)) {
			reasons.push('Requirement analysis is empty or contains only placeholders');
		}

		this.validateCriticalGaps(analysisObj, reasons);
	}

	/**
	 * Check for critical gaps in analysis
	 */
	private validateCriticalGaps(analysisObj: Record<string, unknown>, reasons: string[]): void {
		const gaps = analysisObj['critical_gaps'] ?? analysisObj['gaps'];
		if (!isNonEmptyArray(gaps)) {
			return;
		}

		const criticalGaps = gaps.filter(
			(g) => typeof g === 'object' && g && (g as Record<string, unknown>)['severity'] === 'critical'
		);
		if (criticalGaps.length > 0) {
			reasons.push(`${criticalGaps.length} critical gap(s) identified in requirements`);
		}
	}

	/**
	 * Validate complexity estimate for blockers
	 */
	private validateComplexityEstimate(outputs: Record<string, unknown>, reasons: string[]): void {
		const complexity = outputs['complexity_estimate'];
		if (!complexity || typeof complexity !== 'object') {
			return;
		}

		const complexityObj = complexity as Record<string, unknown>;
		this.validateBlockingRisks(complexityObj, reasons);
		this.validateConfidence(complexityObj, reasons);
	}

	/**
	 * Check for blocking risks
	 */
	private validateBlockingRisks(complexityObj: Record<string, unknown>, reasons: string[]): void {
		const riskFactors = complexityObj['risk_factors'] ?? complexityObj['risks'];
		if (!Array.isArray(riskFactors)) {
			return;
		}

		const blockingRisks = riskFactors.filter(
			(r) => typeof r === 'object' && r && (r as Record<string, unknown>)['blocking'] === true
		);
		if (blockingRisks.length > 0) {
			reasons.push(`${blockingRisks.length} blocking risk(s) identified`);
		}
	}

	/**
	 * Validate confidence level
	 */
	private validateConfidence(complexityObj: Record<string, unknown>, reasons: string[]): void {
		const confidence = complexityObj['confidence'];
		if (typeof confidence === 'number' && confidence < VALIDATION_THRESHOLDS.MIN_CONFIDENCE_SCORE) {
			reasons.push(`Analysis confidence (${Math.round(confidence * 100)}%) is too low - insufficient input data`);
		}
	}

	/**
	 * Check for explicit validation failures
	 */
	private validateExplicitFailures(outputs: Record<string, unknown>, reasons: string[]): void {
		const isValid = outputs['is_valid'];
		if (isValid !== false) {
			return;
		}

		const reason = outputs['validation_message'] ?? outputs['error_message'];
		if (typeof reason === 'string') {
			reasons.push(reason);
		} else {
			reasons.push('Requirements analysis validation failed');
		}
	}

	/**
	 * Check for missing critical fields in specifications
	 * Accepts multiple key variations for robustness against LLM output variations
	 */
	private checkMissingCriticalFields(specs: Record<string, unknown>): string[] {
		const criticalFieldVariations: Record<string, string[]> = {
			'functional requirements': ['functional_requirements', 'functionalRequirements', 'requirements', 'features'],
			'problem statement': ['problem_statement', 'problemStatement', 'problem', 'overview', 'description'],
			'success criteria': ['success_criteria', 'successCriteria', 'goals', 'objectives', 'success_metrics'],
			'target users': ['target_users', 'targetUsers', 'users', 'audience', 'target_audience']
		};
		const missing: string[] = [];

		for (const [displayName, variations] of Object.entries(criticalFieldVariations)) {
			const value = this.findFieldValue(specs, variations);
			if (this.isEmptyValue(value)) {
				missing.push(displayName);
			}
		}

		return missing;
	}

	/**
	 * Find field value using multiple key variations
	 */
	private findFieldValue(specs: Record<string, unknown>, variations: string[]): unknown {
		for (const key of variations) {
			if (specs[key] !== undefined) {
				return specs[key];
			}
		}
		return undefined;
	}

	/**
	 * Check if a value is empty/missing
	 */
	private isEmptyValue(value: unknown): boolean {
		if (!value) {
			return true;
		}
		if (typeof value === 'string' && value.trim() === '') {
			return true;
		}
		if (Array.isArray(value) && value.length === 0) {
			return true;
		}
		if (typeof value === 'object' && Object.keys(value as object).length === 0) {
			return true;
		}
		return false;
	}

	/**
	 * Check if analysis object is empty or contains only placeholders
	 */
	private isEmptyOrPlaceholder(obj: Record<string, unknown>): boolean {
		const values = Object.values(obj);
		if (values.length === 0) return true;

		const placeholderPatterns = [/^tbd$/i, /^todo$/i, /^placeholder$/i, /^\[.*\]$/, /^<.*>$/];

		for (const value of values) {
			if (typeof value === 'string') {
				const isPlaceholder = placeholderPatterns.some((p) => p.test(value.trim()));
				if (!isPlaceholder && value.trim().length > 0) {
					return false;
				}
			} else if (isNonEmptyArray(value)) {
				return false;
			} else if (typeof value === 'object' && value && Object.keys(value).length > 0) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Build summary message for specifications validation failure
	 */
	private buildSpecificationsSummary(outputs: Record<string, unknown>, reasons: string[]): string {
		const completenessScore = outputs['completeness_score'];
		const scoreDisplay = typeof completenessScore === 'number' ? `${Math.round(completenessScore * 100)}%` : 'Unknown';

		return `
${this.renderer.box('Specifications Validation Failed', 'Pipeline Stopped')}

${this.color.bold('Completeness Score:')} ${scoreDisplay}
${this.color.bold('Minimum Required:')} ${Math.round(VALIDATION_THRESHOLDS.MIN_COMPLETENESS_SCORE * 100)}%

${this.color.bold('Issues Found:')}
${reasons.map((r) => `  ${this.color.red('•')} ${r}`).join('\n')}

${this.color.bold('What This Means:')}
  ${this.color.gray('•')} The input specifications are incomplete or invalid
  ${this.color.gray('•')} PRD generation would produce an unreliable document
  ${this.color.gray('•')} The pipeline has been stopped to prevent wasted effort

${this.color.bold('How to Fix:')}
  ${this.color.cyan('1.')} Review and complete the input specifications
  ${this.color.cyan('2.')} Ensure problem statement, users, and requirements are defined
  ${this.color.cyan('3.')} Re-run the command with complete specifications
`;
	}

	/**
	 * Build summary message for requirements analysis validation failure
	 */
	private buildRequirementsSummary(outputs: Record<string, unknown>, reasons: string[]): string {
		const complexity = outputs['complexity_estimate'] as Record<string, unknown> | undefined;
		const confidence = complexity?.['confidence'];
		const confidenceDisplay = typeof confidence === 'number' ? `${Math.round(confidence * 100)}%` : 'Unknown';

		return `
${this.renderer.box('Requirements Analysis Failed', 'Pipeline Stopped')}

${this.color.bold('Analysis Confidence:')} ${confidenceDisplay}
${this.color.bold('Minimum Required:')} ${Math.round(VALIDATION_THRESHOLDS.MIN_CONFIDENCE_SCORE * 100)}%

${this.color.bold('Issues Found:')}
${reasons.map((r) => `  ${this.color.red('•')} ${r}`).join('\n')}

${this.color.bold('What This Means:')}
  ${this.color.gray('•')} The requirements could not be properly analyzed
  ${this.color.gray('•')} Critical gaps or blocking risks were identified
  ${this.color.gray('•')} Proceeding would produce unreliable results

${this.color.bold('How to Fix:')}
  ${this.color.cyan('1.')} Review the identified gaps and risks
  ${this.color.cyan('2.')} Provide more detailed requirements
  ${this.color.cyan('3.')} Address blocking risks before proceeding
`;
	}

	/**
	 * Display validation failure summary
	 */
	displayValidationFailure(result: StageValidationResult): void {
		if (result.summary) {
			this.console.print(result.summary);
		} else {
			this.console.blank();
			this.console.error('Pipeline stopped due to validation failure:');
			result.reasons.forEach((r) => this.console.print(`  • ${r}`));
			this.console.blank();
		}
	}
}

// Singleton instance
let validationServiceInstance: null | StageValidationService = null;

/**
 * Get the singleton stage validation service instance
 */
export function getStageValidationService(): StageValidationService {
	validationServiceInstance ??= new StageValidationService();
	return validationServiceInstance;
}
