/**
 * Command Isolation Executor - Enables independent command and stage execution
 *
 * This executor provides:
 * - Isolated stage execution with mock inputs
 * - Independent command execution without session dependencies
 * - Pipeline validation bypass for testing/debugging
 * - Context isolation to prevent cross-command interference
 */

import type {
	CommandIsolationMode,
	CommandResult,
	IsolatedExecutionOptions,
	PipelineStage,
	StageOutput
} from 'types/command.types';

import { getLogger } from 'output/logger';
import { ExecutionError } from 'utils/error-handler';

import type { StageExecutor } from './stage-executor';

import { ExecutionContext } from './execution-context';
import { VariableResolutionService } from './variable-resolution.service';

export class CommandIsolationExecutor {
	constructor(private readonly stageExecutor: StageExecutor) {}

	/**
	 * Execute command with isolation support
	 */
	async executeIsolated(
		commandName: string,
		pipeline: PipelineStage[],
		options: IsolatedExecutionOptions,
		baseContext: ExecutionContext
	): Promise<CommandResult> {
		const logger = getLogger();
		const mode = this.determineExecutionMode(options);

		logger.info(`Executing ${commandName} in ${mode} mode`, {
			mockInputs: !!options.mockInputs,
			skipValidation: options.skipValidation,
			stages: options.stages?.length ?? 'all'
		});

		const modeHandlers: Record<string, () => Promise<CommandResult>> = {
			isolated: () => this.executeIsolatedStages(commandName, pipeline, options, baseContext),
			stages: () => this.executeSpecificStages(commandName, pipeline, options, baseContext)
		};

		const handler = modeHandlers[mode];
		if (!handler) {
			throw new ExecutionError(`Unsupported isolation mode: ${mode}`);
		}

		return handler();
	}

	/**
	 * Execute specific stages with isolation
	 */
	private async executeIsolatedStages(
		commandName: string,
		pipeline: PipelineStage[],
		options: IsolatedExecutionOptions,
		baseContext: ExecutionContext
	): Promise<CommandResult> {
		const targetStages = options.stages ?? [];
		const isolatedStages = pipeline.filter(
			(stage) => targetStages.includes(stage.stage) || targetStages.includes(`${stage.stage}.${stage.prompt}`)
		);

		if (isolatedStages.length === 0) {
			throw new ExecutionError(`No stages found matching: ${targetStages.join(', ')}`);
		}

		// Create isolated execution contexts for each stage
		const stageContexts = new Map(
			isolatedStages.map((stage) => [
				stage.stage,
				this.createIsolatedContext(commandName, stage, baseContext, options.mockInputs?.[stage.stage] ?? {})
			])
		);

		// Execute stages sequentially, stopping on first failure if not forced
		const results: StageOutput[] = [];

		for (const stage of isolatedStages) {
			const stageContext = stageContexts.get(stage.stage)!;

			const result = await this.stageExecutor.executeStage(
				{ ...stage, required: options.forceRequired ? false : stage.required },
				{ executionContext: stageContext },
				results.length
			);

			results.push(result);

			// Stop on first failure unless forced
			if (!result.success && !options.forceRequired) {
				break;
			}
		}

		return this.buildCommandResult(results, isolatedStages);
	}

	/**
	 * Execute specific stages maintaining pipeline dependencies
	 */
	private async executeSpecificStages(
		commandName: string,
		pipeline: PipelineStage[],
		options: IsolatedExecutionOptions,
		baseContext: ExecutionContext
	): Promise<CommandResult> {
		const targetStages = options.stages ?? [];
		const filteredPipeline = pipeline.filter(
			(stage) => targetStages.includes(stage.stage) || targetStages.includes(`${stage.stage}.${stage.prompt}`)
		);

		if (filteredPipeline.length === 0) {
			throw new ExecutionError(`No stages found matching: ${targetStages.join(', ')}`);
		}

		// Create shared context for stage dependencies
		const sharedContext = this.createSharedContext(commandName, baseContext, options.mockInputs ?? {});

		// Execute filtered pipeline sequentially, stopping on first failure if not forced
		const results: StageOutput[] = [];

		for (const [stageIndex, stage] of filteredPipeline.entries()) {
			const result = await this.stageExecutor.executeStage(
				{ ...stage, required: options.forceRequired ? false : stage.required },
				{ executionContext: sharedContext },
				stageIndex
			);

			results.push(result);
			sharedContext.recordStageCompletion(result);

			// Stop on first failure unless forced
			if (!result.success && !options.forceRequired) {
				break;
			}
		}

		return this.buildCommandResult(results, filteredPipeline);
	}

	/**
	 * Create isolated context for single stage execution
	 */
	private createIsolatedContext(
		commandName: string,
		stage: PipelineStage,
		baseContext: ExecutionContext,
		mockInputs: Record<string, unknown>
	): ExecutionContext {
		// Create variable resolution service with mock inputs
		const variableResolver = VariableResolutionService.createWithContext(
			this.buildArgsObject(baseContext.args, baseContext.flags),
			{ [stage.stage]: mockInputs },
			baseContext.getVariableResolver().getContext().context
		);

		// Create new execution context with isolated variable resolver
		const isolatedContext = new ExecutionContext(
			{
				agentRole: baseContext.agentRole,
				args: baseContext.args,
				commandName: `${commandName}:${stage.stage}`,
				flags: baseContext.flags,
				initialStageOutputs: { [stage.stage]: mockInputs },
				knowledgeFiles: baseContext.knowledgeFiles,
				provider: baseContext.provider,
				sessionContext: baseContext.getVariableResolver().getContext().context
			},
			variableResolver
		);

		return isolatedContext;
	}

	/**
	 * Create shared context for multi-stage execution
	 */
	private createSharedContext(
		commandName: string,
		baseContext: ExecutionContext,
		mockInputs: Record<string, Record<string, unknown>>
	): ExecutionContext {
		const initialOutputs = Object.entries(mockInputs).reduce(
			(acc, [stageName, inputs]) => {
				acc[stageName] = inputs;
				return acc;
			},
			{} as Record<string, Record<string, unknown>>
		);

		return new ExecutionContext({
			agentRole: baseContext.agentRole,
			args: baseContext.args,
			commandName,
			flags: baseContext.flags,
			initialStageOutputs: initialOutputs,
			knowledgeFiles: baseContext.knowledgeFiles,
			provider: baseContext.provider,
			sessionContext: baseContext.getVariableResolver().getContext().context
		});
	}

	/**
	 * Determine execution mode from options
	 */
	private determineExecutionMode(options: IsolatedExecutionOptions): keyof CommandIsolationMode {
		if (options.skipValidation && options.stages?.length === 1) {
			return 'isolated';
		}
		if (options.stages && options.stages.length > 0) {
			return 'stages';
		}
		return 'pipeline';
	}

	/**
	 * Build args object from execution context
	 */
	private buildArgsObject(
		args: string[],
		flags: Record<string, boolean | string | undefined>
	): Record<string, unknown> {
		const argsObj = args.reduce(
			(acc, arg, idx) => {
				acc[(idx + 1).toString()] = arg;
				return acc;
			},
			{} as Record<string, unknown>
		);

		return Object.entries(flags).reduce((acc, [key, value]) => {
			acc[key] = value;
			return acc;
		}, argsObj);
	}

	/**
	 * Build command result from stage outputs
	 */
	private buildCommandResult(stageOutputs: StageOutput[], stages: PipelineStage[]): CommandResult {
		const requiredSuccessful = stages
			.filter((s) => s.required)
			.every((requiredStage) => {
				const output = stageOutputs.find((o) => o.stage === requiredStage.stage && o.prompt === requiredStage.prompt);
				return output?.success ?? false;
			});

		return {
			duration_ms: stageOutputs.reduce((sum, s) => sum + s.duration_ms, 0),
			outputs: this.mergeOutputs(stageOutputs),
			stages: stageOutputs,
			success: requiredSuccessful
		};
	}

	/**
	 * Merge outputs from all stages
	 */
	private mergeOutputs(stageOutputs: StageOutput[]): Record<string, unknown> {
		return stageOutputs.reduce(
			(merged, output) => {
				if (output.success && output.outputs) {
					return { ...merged, ...output.outputs };
				}
				return merged;
			},
			{} as Record<string, unknown>
		);
	}
}
