/**
 * Command Execution Strategy Pattern
 *
 * Implements different execution strategies for commands:
 * - Dry-run execution (preview and cache)
 * - Pipeline execution (default, with cache support)
 * - Isolated stage execution
 * - Interactive execution
 */

import type { CommandDefinition, CommandResult, PipelineStage } from 'types/command.types';
import type { PromptCategory } from 'types/prompt.types';

import { getLogger } from 'output/logger';

import type { ExecutionContext } from './execution-context';

import { type DryRunCacheEntry, getDryRunCache } from './dry-run-cache';
import { DryRunExecutionStrategy } from './dry-run-strategy';

export interface CommandExecutionStrategy {
	/**
	 * Check if this strategy can handle the given command and options
	 */
	canExecute(command: CommandDefinition, context: ExecutionContext): boolean;

	/**
	 * Execute the command using this strategy
	 */
	execute(command: CommandDefinition, context: ExecutionContext): Promise<CommandResult>;
}

/**
 * Pipeline Execution Strategy
 *
 * Executes commands through the full pipeline with all stages.
 * Supports using cached dry-run results for faster execution.
 */
export class PipelineExecutionStrategy implements CommandExecutionStrategy {
	constructor() {
		// No constructor initialization needed
	}

	canExecute(command: CommandDefinition, context: ExecutionContext): boolean {
		// Can execute any command that has pipeline prompts and no isolation specified
		return !context.isolation && !!command.prompts?.pipeline;
	}

	async execute(command: CommandDefinition, context: ExecutionContext): Promise<CommandResult> {
		const logger = getLogger();

		// Check for cached dry-run results
		const cache = getDryRunCache();
		const lookupOptions = {
			args: context.args,
			command,
			commandName: command.name,
			flags: context.flags
		};
		const cacheResult = cache.get(lookupOptions);

		if (cacheResult.hit && cacheResult.entry) {
			logger.info('Using cached dry-run analysis for faster execution', {
				cacheAge: Date.now() - cacheResult.entry.createdAt,
				commandName: command.name
			});

			// Invalidate cache after use (one-time use)
			cache.invalidate(lookupOptions);

			// Use cached analysis to speed up execution
			return this.executeWithCachedAnalysis(command, context, cacheResult.entry);
		}

		logger.debug('Executing command via pipeline strategy', {
			cacheStatus: cacheResult.reason ?? 'no_cache',
			commandName: command.name,
			stages: command.prompts.pipeline.length
		});

		// Standard pipeline execution
		return this.executePipeline(command, context);
	}

	/**
	 * Execute pipeline with cached dry-run analysis
	 */
	private async executeWithCachedAnalysis(
		command: CommandDefinition,
		context: ExecutionContext,
		cachedEntry: DryRunCacheEntry
	): Promise<CommandResult> {
		const logger = getLogger();

		// Inject cached analysis and record precomputed stages
		this.injectCachedAnalysisOutputs(context, cachedEntry);
		this.recordPrecomputedStages(context, cachedEntry);

		// Determine which stages to execute
		const stagesToExecute = this.getStagesForExecution(command, cachedEntry);

		// Log cached resources being used
		this.logCachedResourceUsage(logger, command, stagesToExecute, cachedEntry);

		// Execute remaining stages through the pipeline with cached data
		return this.executePipelineStagesWithCache(stagesToExecute, context, cachedEntry);
	}

	/**
	 * Inject cached analysis outputs into execution context
	 */
	private injectCachedAnalysisOutputs(context: ExecutionContext, cachedEntry: DryRunCacheEntry): void {
		if (cachedEntry.analysisOutputs) {
			const variableResolver = context.getVariableResolver();
			variableResolver.addStageOutputs('dry_run_cache', cachedEntry.analysisOutputs);
		}
	}

	/**
	 * Record precomputed outputs as completed stages
	 */
	private recordPrecomputedStages(context: ExecutionContext, cachedEntry: DryRunCacheEntry): void {
		if (!cachedEntry.precomputedOutputs) return;
		for (const output of cachedEntry.precomputedOutputs) {
			context.recordStageCompletion(output);
		}
	}

	/**
	 * Get stages that need execution (excluding cached ones)
	 */
	private getStagesForExecution(command: CommandDefinition, cachedEntry: DryRunCacheEntry): PipelineStage[] {
		const completedStageNames = new Set(cachedEntry.precomputedOutputs?.map((o) => `${o.stage}.${o.prompt}`) ?? []);
		return command.prompts.pipeline.filter((stage) => !completedStageNames.has(`${stage.stage}.${stage.prompt}`));
	}

	/**
	 * Log cached resource usage statistics
	 */
	private logCachedResourceUsage(
		logger: ReturnType<typeof getLogger>,
		command: CommandDefinition,
		stagesToExecute: PipelineStage[],
		cachedEntry: DryRunCacheEntry
	): void {
		logger.info('Using cached dry-run resources for faster execution', {
			originalStages: command.prompts.pipeline.length,
			pipelineValidated: cachedEntry.pipelineValidated ?? false,
			preloadedAgent: !!cachedEntry.preloadedAgent,
			preloadedPrompts: cachedEntry.preloadedPrompts?.length ?? 0,
			preresolvedInputs: cachedEntry.preresolvedInputs?.length ?? 0,
			stagesSkipped: command.prompts.pipeline.length - stagesToExecute.length,
			stagesToExecute: stagesToExecute.length
		});
	}

	/**
	 * Execute pipeline stages using cached precomputed data
	 */
	private async executePipelineStagesWithCache(
		stages: PipelineStage[],
		context: ExecutionContext,
		cachedEntry: DryRunCacheEntry
	): Promise<CommandResult> {
		// Import here to avoid circular dependencies
		const pipelineModule = await import('./pipeline');
		const promptLoaderModule = await import('./prompt-loader');
		const agentLoaderModule = await import('./agent-loader');

		// Create loaders with pre-populated caches from dry-run
		const promptLoader = new promptLoaderModule.PromptLoader();
		const agentLoader = new agentLoaderModule.AgentLoader();

		// Pre-populate prompt loader cache with cached prompts
		if (cachedEntry.preloadedPrompts && cachedEntry.preloadedPrompts.length > 0) {
			for (const preloadedPrompt of cachedEntry.preloadedPrompts) {
				promptLoader.injectCachedPrompt(preloadedPrompt.id, {
					category: preloadedPrompt.metadata['category'] as PromptCategory,
					content: preloadedPrompt.content,
					description: preloadedPrompt.metadata['description'] as string,
					id: preloadedPrompt.id,
					name: preloadedPrompt.metadata['name'] as string,
					version: preloadedPrompt.metadata['version'] as string
				});
			}
		}

		// Pre-populate agent loader cache with cached agent
		if (cachedEntry.preloadedAgent) {
			agentLoader.injectCachedAgent(cachedEntry.preloadedAgent.role, {
				content: cachedEntry.preloadedAgent.content,
				decision_making: cachedEntry.preloadedAgent.decisionMaking
					? { escalation_criteria: cachedEntry.preloadedAgent.decisionMaking.escalationCriteria }
					: undefined
			});
		}

		// Inject pre-resolved inputs into the variable resolver
		if (cachedEntry.preresolvedInputs && cachedEntry.preresolvedInputs.length > 0) {
			const variableResolver = context.getVariableResolver();
			for (const preresolvedInput of cachedEntry.preresolvedInputs) {
				// Add enriched inputs (includes file contents) as stage outputs
				variableResolver.addStageOutputs(`preresolved_${preresolvedInput.stageName}`, preresolvedInput.enrichedInputs);
			}
		}

		const pipelineExecutor = new pipelineModule.PipelineExecutor(promptLoader, agentLoader);
		return pipelineExecutor.execute(stages, { executionContext: context });
	}

	/**
	 * Execute standard pipeline
	 */
	private async executePipeline(command: CommandDefinition, context: ExecutionContext): Promise<CommandResult> {
		return this.executePipelineStages(command.prompts.pipeline, context);
	}

	/**
	 * Execute pipeline stages
	 */
	private async executePipelineStages(stages: PipelineStage[], context: ExecutionContext): Promise<CommandResult> {
		// Import here to avoid circular dependencies
		const pipelineModule = await import('./pipeline');
		const promptLoaderModule = await import('./prompt-loader');
		const agentLoaderModule = await import('./agent-loader');

		const promptLoader = new promptLoaderModule.PromptLoader();
		const agentLoader = new agentLoaderModule.AgentLoader();
		const pipelineExecutor = new pipelineModule.PipelineExecutor(promptLoader, agentLoader);
		return pipelineExecutor.execute(stages, { executionContext: context });
	}
}

/**
 * Isolated Stage Execution Strategy
 *
 * Executes only specific stages of a command in isolation
 */
export class IsolatedExecutionStrategy implements CommandExecutionStrategy {
	canExecute(command: CommandDefinition, context: ExecutionContext): boolean {
		// Can execute if isolation options are specified
		return !!context.isolation && !!command.prompts?.pipeline;
	}

	async execute(command: CommandDefinition, context: ExecutionContext): Promise<CommandResult> {
		const logger = getLogger();
		logger.debug('Executing command via isolated strategy', {
			commandName: command.name,
			isolatedStages: context.isolation?.stages?.length ?? 'all'
		});

		// Import here to avoid circular dependencies
		const isolationExecutorModule = await import('./command-isolation.executor');
		const stageExecutorModule = await import('./stage-executor');
		const promptLoaderModule = await import('./prompt-loader');
		const agentLoaderModule = await import('./agent-loader');

		const promptLoader = new promptLoaderModule.PromptLoader();
		const agentLoader = new agentLoaderModule.AgentLoader();
		const stageExecutor = new stageExecutorModule.StageExecutor(promptLoader, agentLoader);
		const isolationExecutor = new isolationExecutorModule.CommandIsolationExecutor(stageExecutor);
		return isolationExecutor.executeIsolated(command.name, command.prompts.pipeline, context.isolation ?? {}, context);
	}
}

/**
 * Interactive Execution Strategy
 *
 * Executes commands with interactive prompts and user input
 */
export class InteractiveExecutionStrategy implements CommandExecutionStrategy {
	canExecute(_command: CommandDefinition, context: ExecutionContext): boolean {
		// Can execute interactive commands when interactive mode is enabled
		return context.interactive === true;
	}

	async execute(_command: CommandDefinition, context: ExecutionContext): Promise<CommandResult> {
		const logger = getLogger();
		logger.debug('Executing command via interactive strategy', {
			commandName: _command.name
		});

		// For now, fall back to pipeline execution
		// TODO: Implement full interactive execution
		const pipelineStrategy = new PipelineExecutionStrategy();
		return pipelineStrategy.execute(_command, context);
	}
}

/**
 * Strategy Factory for Command Execution
 *
 * Determines the appropriate execution strategy based on command and context.
 * Strategy order matters - first matching strategy is used:
 * 1. DryRunExecutionStrategy - handles --dry-run mode
 * 2. IsolatedExecutionStrategy - handles --isolated mode
 * 3. InteractiveExecutionStrategy - handles --interactive mode
 * 4. PipelineExecutionStrategy - default (also checks for cached dry-run results)
 */
export class CommandExecutionStrategyFactory {
	private strategies: CommandExecutionStrategy[] = [
		new DryRunExecutionStrategy(), // Handle dry-run mode first
		new IsolatedExecutionStrategy(),
		new InteractiveExecutionStrategy(),
		new PipelineExecutionStrategy() // Default strategy - checked last (also uses cache)
	];

	/**
	 * Get the appropriate execution strategy for the given command and context
	 */
	getStrategy(command: CommandDefinition, context: ExecutionContext): CommandExecutionStrategy {
		const strategy = this.strategies.find((s) => s.canExecute(command, context));

		if (!strategy) {
			throw new Error(`No suitable execution strategy found for command: ${command.name}`);
		}

		return strategy;
	}

	/**
	 * Register a new execution strategy
	 */
	registerStrategy(strategy: CommandExecutionStrategy): void {
		// Insert before the default pipeline strategy
		this.strategies.splice(this.strategies.length - 1, 0, strategy);
	}
}
