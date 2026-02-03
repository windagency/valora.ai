/**
 * Pipeline executor - executes prompt pipelines with sequential/parallel stages
 *
 * MAINT-002: Large Files Need Splitting - Refactored to use extracted classes:
 * - StageScheduler -> stage-scheduler.ts
 * - PipelineValidator -> pipeline-validator.ts
 * - StageExecutor -> stage-executor.ts
 */

import type { CommandResult, PipelineStage, StageOutput } from 'types/command.types';

import { execSync } from 'child_process';
import { getLogger } from 'output/logger';
import { getProcessingFeedback } from 'output/processing-feedback';
import { ExecutionError } from 'utils/error-handler';

import type { AgentLoader } from './agent-loader';
import type { PromptLoader } from './prompt-loader';

import { getInputPreResolver, type InputPreResolver, type PreResolvedInputs } from './input-pre-resolver';
import {
	getInteractiveQuestionHandler,
	type InteractiveQuestionHandlerService
} from './interactive-question-handler.service';
import { getPipelineEmitter, type PipelineEventEmitter } from './pipeline-events';
import { PipelineValidator } from './pipeline-validator';
import {
	type PipelineExecutionContext,
	type StageExecutionOptions,
	StageExecutor,
	type WorktreeInfoContext
} from './stage-executor';
import { StageScheduler } from './stage-scheduler';

/**
 * Detect if running in a git worktree and return its info
 */
export class PipelineExecutor {
	private eventEmitter: PipelineEventEmitter;
	private inputPreResolver: InputPreResolver;
	private interactiveQuestionHandler: InteractiveQuestionHandlerService;
	private pipelineValidator: PipelineValidator;
	private preResolvedInputs: null | PreResolvedInputs = null;
	private stageExecutor: StageExecutor;
	private stageScheduler: StageScheduler;

	constructor(promptLoader: PromptLoader, agentLoader: AgentLoader, eventEmitter?: PipelineEventEmitter) {
		this.stageScheduler = new StageScheduler();
		this.pipelineValidator = new PipelineValidator();
		this.eventEmitter = eventEmitter ?? getPipelineEmitter();
		this.stageExecutor = new StageExecutor(promptLoader, agentLoader, this.eventEmitter);
		this.interactiveQuestionHandler = getInteractiveQuestionHandler();
		this.inputPreResolver = getInputPreResolver();
	}

	/**
	 * Execute a pipeline of stages
	 */
	async execute(stages: PipelineStage[], context: PipelineExecutionContext): Promise<CommandResult> {
		const logger = getLogger();
		const startTime = Date.now();
		const { executionContext } = context;

		// Reset tool execution state for new command (e.g., write confirmation mode)
		this.stageExecutor.resetForNewCommand();

		// Detect worktree info once at pipeline start
		const worktreeInfo = detectWorktreeInfo();

		logger.info(`Executing pipeline: ${executionContext.commandName}`, {
			agent: executionContext.agentRole,
			hasArgs: !!executionContext.args?.length,
			stageCount: stages.length,
			worktree: worktreeInfo?.branch
		});

		// Emit pipeline start event with session info
		this.eventEmitter.emitPipelineStart({
			agent: executionContext.agentRole,
			commandName: executionContext.commandName,
			model: executionContext.model,
			sessionInfo: executionContext.sessionInfo
				? {
						isResumed: executionContext.sessionInfo.isResumed,
						sessionId: executionContext.sessionInfo.sessionId
					}
				: undefined,
			stageCount: stages.length
		});

		try {
			// Validate pipeline structure first
			const validationErrors = this.pipelineValidator.validatePipeline(stages);
			if (validationErrors.length > 0) {
				throw new ExecutionError(`Pipeline validation failed: ${validationErrors.join(', ')}`, { validationErrors });
			}

			// Pre-resolve static inputs for optimization
			// This caches file contents and resolves $ARG_*, $CONTEXT_*, $ENV_* variables upfront
			const variableResolver = executionContext.getVariableResolver();
			this.preResolvedInputs = await this.inputPreResolver.preResolveStaticInputs(stages, variableResolver);

			// Group stages by parallel execution
			const stageGroups = this.stageScheduler.groupStages(stages);

			// Process stage groups sequentially using reduce
			await stageGroups.reduce(async (previousPromise, group) => {
				await previousPromise;

				// Check if all required stages from previous groups have succeeded
				const stageOutputs = executionContext.getStageOutputs();
				const failedRequiredStages = stageOutputs.filter(
					(output) => !output.success && stages.find((s) => s.stage === output.stage)?.required
				);

				if (failedRequiredStages.length > 0) {
					const failedStageNames = failedRequiredStages.map((output) => output.stage).join(', ');
					throw new Error(`Cannot execute stage group: Required prerequisite stages failed: ${failedStageNames}`);
				}

				if (group.parallel) {
					// Execute stages in parallel (filtering out stages with false conditionals)
					const stageIndexStart = executionContext.getStageOutputs().length;
					const options: StageExecutionOptions = { isParallel: true, worktreeInfo };

					// Filter stages based on conditional evaluation
					const variableResolver = executionContext.getVariableResolver();
					const feedback = getProcessingFeedback();
					const eligibleStages = group.stages.filter((stage) => {
						if (!stage.conditional) {
							return true; // No conditional, always execute
						}
						const conditionalValue = variableResolver.resolve(stage.conditional);
						const shouldExecute = evaluateConditional(conditionalValue);
						if (!shouldExecute) {
							feedback.showInfo(
								`Skipping stage: ${stage.stage}.${stage.prompt} (conditional: ${stage.conditional} = ${conditionalValue})`
							);
						}
						return shouldExecute;
					});

					const results = await Promise.all(
						eligibleStages.map((stage, index) => {
							const stageOptions: StageExecutionOptions = {
								...options,
								preResolvedInputs: this.getPreResolvedInputsForStage(stage)
							};
							return this.stageExecutor.executeStage(stage, context, stageIndexStart + index, stageOptions);
						})
					);

					// Record completed stages in execution context
					results.forEach((result) => {
						executionContext.recordStageCompletion(result);
					});

					// Check if we should stop (guided completion)
					if (results.some((r) => r.metadata?.['stopPipeline'])) {
						logger.info('Pipeline execution stopped by stage signal');
						throw new Error('STOP_PIPELINE'); // Use exception for control flow
					}
				} else {
					// Execute stages sequentially
					const stageIndexStart = executionContext.getStageOutputs().length;
					const options: StageExecutionOptions = { isParallel: false, worktreeInfo };
					const variableResolver = executionContext.getVariableResolver();

					await group.stages.reduce(async (prevStagePromise, stage, index) => {
						await prevStagePromise;

						// Check conditional before executing
						if (stage.conditional) {
							const conditionalValue = variableResolver.resolve(stage.conditional);
							const shouldExecute = evaluateConditional(conditionalValue);
							if (!shouldExecute) {
								const feedback = getProcessingFeedback();
								feedback.showInfo(
									`Skipping stage: ${stage.stage}.${stage.prompt} (conditional: ${stage.conditional} = ${conditionalValue})`
								);
								return; // Skip this stage
							}
						}

						const stageOptions: StageExecutionOptions = {
							...options,
							preResolvedInputs: this.getPreResolvedInputsForStage(stage)
						};
						const result = await this.stageExecutor.executeStage(stage, context, stageIndexStart + index, stageOptions);

						// Record completed stage in execution context
						executionContext.recordStageCompletion(result);

						// Handle interactive questions if present and interactive mode is enabled
						// This prompts the user for answers before proceeding to the next stage
						await this.handleInteractiveQuestions(result, context, stage);

						if (result.metadata?.['stopPipeline']) {
							logger.info('Pipeline execution stopped by stage signal');
							throw new Error('STOP_PIPELINE'); // Use exception for control flow
						}

						if (!result.success && stage.required) {
							throw new ExecutionError(`Required stage failed: ${stage.stage}.${stage.prompt}`, {
								error: result.error,
								prompt: stage.prompt,
								stage: stage.stage
							});
						}
					}, Promise.resolve());
				}
			}, Promise.resolve());

			const duration = Date.now() - startTime;
			const stageOutputs = executionContext.getStageOutputs();
			const allSuccessful = stageOutputs.every((s) => s.success);
			// Pipeline succeeds if all required stages that were executed succeed
			// When pipeline stops early (e.g., guided completion), only check executed stages
			const requiredStagesSuccessful = stages
				.filter((s) => s.required)
				.filter((requiredStage) => {
					// Only check stages that were actually executed
					return stageOutputs.some((o) => o.stage === requiredStage.stage && o.prompt === requiredStage.prompt);
				})
				.every((requiredStage) => {
					const output = stageOutputs.find((o) => o.stage === requiredStage.stage && o.prompt === requiredStage.prompt);
					return output?.success ?? false;
				});

			logger.info(`Pipeline completed: ${executionContext.commandName}`, {
				allSuccessful,
				duration: `${duration}ms`,
				requiredSuccessful: requiredStagesSuccessful,
				stageCount: stageOutputs.length,
				success: requiredStagesSuccessful
			});

			// Emit pipeline complete event
			this.eventEmitter.emitPipelineComplete(executionContext.commandName, duration, requiredStagesSuccessful);

			// Flush any pending file writes with user confirmation
			if (this.stageExecutor.hasPendingWrites()) {
				await this.stageExecutor.flushPendingWrites();
			}

			return {
				duration_ms: duration,
				outputs: this.mergeOutputs(stageOutputs),
				stages: stageOutputs,
				success: requiredStagesSuccessful
			};
		} catch (error) {
			// Check if this is a controlled stop (STOP_PIPELINE)
			if ((error as Error).message === 'STOP_PIPELINE') {
				const duration = Date.now() - startTime;
				const stageOutputs = executionContext.getStageOutputs();
				const allSuccessful = stageOutputs.every((s) => s.success);
				const requiredStagesSuccessful = stages
					.filter((s) => s.required)
					.filter((requiredStage) => {
						return stageOutputs.some((o) => o.stage === requiredStage.stage && o.prompt === requiredStage.prompt);
					})
					.every((requiredStage) => {
						const output = stageOutputs.find(
							(o) => o.stage === requiredStage.stage && o.prompt === requiredStage.prompt
						);
						return output?.success ?? false;
					});

				logger.info(`Pipeline completed: ${executionContext.commandName}`, {
					allSuccessful,
					duration: `${duration}ms`,
					requiredSuccessful: requiredStagesSuccessful,
					stageCount: stageOutputs.length,
					success: requiredStagesSuccessful
				});

				this.eventEmitter.emitPipelineComplete(executionContext.commandName, duration, requiredStagesSuccessful);

				// Flush any pending file writes with user confirmation
				if (this.stageExecutor.hasPendingWrites()) {
					await this.stageExecutor.flushPendingWrites();
				}

				return {
					duration_ms: duration,
					outputs: this.mergeOutputs(stageOutputs),
					stages: stageOutputs,
					success: requiredStagesSuccessful
				};
			}

			const duration = Date.now() - startTime;
			const stageOutputs = executionContext.getStageOutputs();
			const validStageOutputs = stageOutputs.filter((s) => s != null && typeof s === 'object');
			logger.error('Pipeline execution failed', error as Error, {
				command: executionContext.commandName,
				completedStages: validStageOutputs.filter((s) => s.success).length,
				duration: `${duration}ms`,
				totalStages: stages.length
			});

			// Emit pipeline error event
			this.eventEmitter.emitPipelineError(executionContext.commandName, (error as Error).message);

			return {
				duration_ms: duration,
				error: (error as Error).message,
				outputs: this.mergeOutputs(validStageOutputs),
				stages: validStageOutputs,
				success: false
			};
		}
	}

	/**
	 * Validate pipeline stages
	 */
	validatePipeline(stages: PipelineStage[]): string[] {
		return this.pipelineValidator.validatePipeline(stages);
	}

	/**
	 * Merge outputs from all stages
	 */
	private mergeOutputs(stageOutputs: StageOutput[]): Record<string, unknown> {
		return stageOutputs
			.filter((output) => output && output.success && output.outputs)
			.reduce((merged, output) => ({ ...merged, ...output.outputs }), {} as Record<string, unknown>);
	}

	/**
	 * Get pre-resolved inputs for a stage if available
	 * Returns undefined if no pre-resolved inputs exist
	 */
	private getPreResolvedInputsForStage(stage: PipelineStage): Record<string, unknown> | undefined {
		if (!this.preResolvedInputs) {
			return undefined;
		}

		const stageKey = `${stage.stage}_${stage.prompt}`;
		return this.preResolvedInputs.stages.get(stageKey);
	}

	/**
	 * Handle interactive questions from a stage output
	 * If the stage produced clarifying questions and interactive mode is enabled,
	 * prompt the user for answers and store them for subsequent stages.
	 *
	 * @param result - The stage output to check for questions
	 * @param context - The pipeline execution context
	 * @param stage - The pipeline stage that was executed
	 * @returns true if questions were handled, false otherwise
	 */
	private async handleInteractiveQuestions(
		result: StageOutput,
		context: PipelineExecutionContext,
		stage: PipelineStage
	): Promise<boolean> {
		const logger = getLogger();
		const { executionContext } = context;

		// Only handle questions if:
		// 1. Interactive mode is enabled
		// 2. Stage succeeded
		// 3. Stage has outputs
		if (!executionContext.interactive || !result.success || !result.outputs) {
			return false;
		}

		// Check if this stage has clarifying questions
		const questions = this.interactiveQuestionHandler.extractQuestions(result.outputs);

		if (questions.length === 0) {
			return false;
		}

		logger.info(`Stage ${stage.stage}.${stage.prompt} produced ${questions.length} clarifying question(s)`);

		// Prompt user for answers
		const questionResult = await this.interactiveQuestionHandler.promptForAnswers(questions);

		if (questionResult.skipped) {
			return false;
		}

		// Store answers in the execution context for subsequent stages
		const formattedAnswers = this.interactiveQuestionHandler.formatAnswersForStage(questionResult.answers);

		// Add user answers as a pseudo-stage output so it can be referenced
		// by subsequent stages using $STAGE_user_answers.{questionId}
		executionContext.getVariableResolver().addStageOutputs('user_answers', {
			answers: formattedAnswers,
			count: questionResult.answeredCount,
			summary: questionResult.summary
		});

		// Also add to the current stage's outputs so it's available in the result
		result.outputs['user_answers'] = formattedAnswers;
		result.outputs['user_answers_summary'] = questionResult.summary;

		logger.info(`User answered ${questionResult.answeredCount} clarifying question(s)`);

		return true;
	}
}

/**
 * Evaluate a conditional value, handling string "true"/"false" from variable resolution
 * The variable resolver converts boolean values to strings, so we need to handle that case
 */
function detectWorktreeInfo(): undefined | WorktreeInfoContext {
	try {
		// Check if we're in a worktree (not the main working tree)
		const gitDir = execSync('git rev-parse --git-dir', { encoding: 'utf-8' }).trim();

		// If git-dir contains 'worktrees', we're in a linked worktree
		if (!gitDir.includes('worktrees')) {
			return undefined;
		}

		// Get worktree details
		const worktreePath = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
		const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
		const commit = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();

		return {
			branch,
			commit,
			path: worktreePath
		};
	} catch {
		return undefined;
	}
}

function evaluateConditional(value: unknown): boolean {
	if (typeof value === 'string') {
		// Handle string "true"/"false" from variable resolution
		return value.toLowerCase() === 'true';
	}
	return Boolean(value);
}
