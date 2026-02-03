/**
 * Execution Context - Manages shared state between pipeline execution and variable resolution
 *
 * Separates concerns between:
 * - PipelineExecutor: Orchestrates stage execution (Command)
 * - VariableResolver: Resolves variables (Query)
 * - ExecutionContext: Manages shared state and coordination
 *
 * This implements Command Query Separation by ensuring:
 * - Commands (execution) don't perform queries (resolution)
 * - Queries (resolution) don't modify state
 * - State management is centralized in the context
 */

import type { AllowedTool, IsolatedExecutionOptions, StageOutput } from 'types/command.types';
import type { LLMProvider } from 'types/llm.types';

import { VariableResolutionService } from './variable-resolution.service';

/**
 * Session information for tracking execution mode
 */
export interface ExecutionContextOptions {
	agentRole: string;
	allowedTools?: AllowedTool[];
	args: string[];
	commandName: string;
	flags: Record<string, boolean | string | undefined>;
	initialStageOutputs?: Record<string, Record<string, unknown>>;
	interactive?: boolean;
	isolation?: IsolatedExecutionOptions;
	/**
	 * Knowledge files to load from knowledge-base/ directory.
	 * These are command-specific and loaded selectively to save tokens.
	 */
	knowledgeFiles?: string[];
	mode?: string;
	model?: string;
	provider: LLMProvider;
	sessionContext?: Record<string, unknown>;
	/**
	 * Session information for tracking execution mode (live vs resumed)
	 */
	sessionInfo?: SessionInfo;
}

export interface SessionInfo {
	/** Whether this is a resumed session (vs newly created) */
	isResumed: boolean;
	/** The session ID */
	sessionId: string;
}

/**
 * Execution Context - Coordinates between pipeline execution and variable resolution
 *
 * Responsible for:
 * - Maintaining execution state (stages, context, resolver)
 * - Coordinating between PipelineExecutor and VariableResolver
 * - Providing clean interfaces for both query and command operations
 */
export class ExecutionContext {
	public readonly agentRole: string;
	public readonly allowedTools?: AllowedTool[];
	public readonly args: string[];
	public readonly commandName: string;
	public readonly flags: Record<string, boolean | string | undefined>;
	public readonly interactive?: boolean;
	public readonly isolation?: IsolatedExecutionOptions;
	public readonly knowledgeFiles?: string[];
	public readonly mode?: string;
	public readonly model?: string;
	public readonly provider: LLMProvider;
	public readonly sessionInfo?: SessionInfo;

	public stages: Record<string, Record<string, unknown>> = {};
	private completedStages = new Set<string>();
	private stageOutputs: StageOutput[] = [];
	private variableResolutionService: VariableResolutionService;

	constructor(options: ExecutionContextOptions, variableResolutionService?: VariableResolutionService) {
		this.commandName = options.commandName;
		this.args = options.args;
		this.flags = options.flags;
		this.provider = options.provider;
		this.agentRole = options.agentRole;
		this.model = options.model;
		this.mode = options.mode;
		this.isolation = options.isolation;
		this.interactive = options.interactive;
		this.allowedTools = options.allowedTools;
		this.knowledgeFiles = options.knowledgeFiles;
		this.sessionInfo = options.sessionInfo;

		// Initialize variable resolution service with initial context or use provided one
		this.variableResolutionService = variableResolutionService ?? this.createVariableResolutionService(options);
	}

	/**
	 * Get the variable resolution service for query operations
	 * This allows stages to resolve variables without modifying state
	 */
	getVariableResolver(): VariableResolutionService {
		return this.variableResolutionService;
	}

	/**
	 * Record a completed stage and update variable resolution context
	 * This is the command operation that modifies state
	 */
	recordStageCompletion(stageOutput: StageOutput): void {
		this.stageOutputs.push(stageOutput);

		if (stageOutput.success) {
			// Update variable resolution service with new stage outputs for future resolutions
			this.variableResolutionService.addStageOutputs(stageOutput.stage, stageOutput.outputs);
			this.completedStages.add(stageOutput.stage);
		} else {
			// Track failed stages for potential retry logic or error reporting
			// Could be extended to support stage retry mechanisms
			this.completedStages.add(`${stageOutput.stage}:failed`);
		}
	}

	/**
	 * Get all stage outputs
	 */
	getStageOutputs(): StageOutput[] {
		return [...this.stageOutputs];
	}

	/**
	 * Check if a stage has been completed successfully
	 */
	isStageCompleted(stageName: string): boolean {
		return this.completedStages.has(stageName);
	}

	/**
	 * Get execution summary
	 */
	getExecutionSummary(): unknown {
		const totalStages = this.stageOutputs.length;
		const successfulStages = this.stageOutputs.filter((s) => s.success).length;
		const failedStages = totalStages - successfulStages;

		return {
			commandName: this.commandName,
			completedStages: Array.from(this.completedStages),
			failedStages,
			successfulStages,
			totalStages
		};
	}

	/**
	 * Validate that all stage dependencies are satisfied
	 * This is a query operation that checks state without modifying it
	 */
	validateStageDependencies(stageInputs?: Record<string, unknown>): string[] {
		const errors: string[] = [];

		if (!stageInputs) {
			return errors;
		}

		// Check if any inputs reference stages that haven't completed yet
		const validationErrors = this.variableResolutionService.validateVariables(stageInputs);
		errors.push(...validationErrors);

		return errors;
	}

	/**
	 * Create the initial variable resolution service with context
	 */
	private createVariableResolutionService(options: ExecutionContextOptions): VariableResolutionService {
		// Convert positional args to indexed object
		const argsObj: Record<string, unknown> = {};
		this.args.forEach((arg, idx) => {
			argsObj[(idx + 1).toString()] = arg;
		});

		// Merge flags into args with normalized keys
		// Store flags under multiple key formats for flexibility:
		// - Original key (e.g., specsFile from Commander)
		// - Kebab-case (e.g., specs-file from CLI)
		// - Snake_case (e.g., specs_file for $ARG_ references)
		Object.entries(this.flags).forEach(([key, value]) => {
			// Store original key
			argsObj[key] = value;

			// Convert camelCase to kebab-case (specsFile -> specs-file)
			// This is needed because Commander converts --specs-file to specsFile,
			// but $ARG_specs-file references expect kebab-case
			const kebabCase = key.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
			if (kebabCase !== key) {
				argsObj[kebabCase] = value;
			}

			// Also store snake_case version for $ARG_ variable resolution
			// Convert kebab-case (specs-file) and camelCase (specsFile) to snake_case (specs_file)
			const snakeCase = key
				.replace(/-/g, '_') // kebab-case to snake_case
				.replace(/([a-z])([A-Z])/g, '$1_$2') // camelCase to snake_case
				.toLowerCase();

			if (snakeCase !== key) {
				argsObj[snakeCase] = value;
			}
		});

		return VariableResolutionService.createWithContext(
			argsObj,
			options.initialStageOutputs ?? {},
			options.sessionContext ?? {}
		);
	}
}
