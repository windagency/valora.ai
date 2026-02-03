/**
 * Dry Run Execution Strategy
 *
 * Handles command execution in dry-run mode with full tool simulation.
 *
 * Flow:
 * 1. --dry-run mode: Execute full pipeline with simulated tools
 * 2. Display comprehensive summary with diffs, commands, and cost estimates
 * 3. Cache analysis for subsequent runs
 *
 * Unlike the previous approach that skipped tool execution,
 * this strategy runs the LLM with tools and simulates state-changing operations.
 * Read-only tools execute normally.
 */

import type { CommandDefinition, CommandResult, PipelineStage, StageOutput } from 'types/command.types';

import { existsSync } from 'fs';
import { getLogger } from 'output/logger';
import { readFile } from 'utils/file-utils';

import type { ExecutionContext } from './execution-context';
import type { CommandExecutionStrategy } from './execution-strategy';

import { AgentLoader } from './agent-loader';
import {
	type DryRunCacheEntry,
	type DryRunCacheLookupOptions,
	getDryRunCache,
	type PreloadedAgent,
	type PreloadedPrompt,
	type PreresolvedInputs
} from './dry-run-cache';
import { getDryRunPreviewService } from './dry-run-preview.service';
import { PipelineValidator } from './pipeline-validator';
import { PromptLoader } from './prompt-loader';
import { getToolExecutionService } from './tool-execution.service';

/**
 * Dry Run Execution Strategy
 *
 * When --dry-run is enabled:
 * - Analyses the command pipeline
 * - Displays what would be executed
 * - Caches the analysis for subsequent runs
 *
 * When running without --dry-run after a dry-run:
 * - Uses cached analysis to speed up execution
 * - Skips redundant planning/analysis stages
 */
export class DryRunExecutionStrategy implements CommandExecutionStrategy {
	/**
	 * Check if this strategy can handle the given command and context
	 */
	canExecute(_command: CommandDefinition, context: ExecutionContext): boolean {
		// Handle dry-run mode
		const isDryRun = context.flags['dryRun'] === true || context.flags['dry-run'] === true;
		if (isDryRun) {
			return true;
		}

		// Check if we have a cache hit for non-dry-run execution
		// This allows us to use cached results even when not in dry-run mode
		return false; // Let other strategies handle when not in dry-run mode
	}

	/**
	 * Check if we have a valid cache entry for the given context
	 */
	hasCachedResult(command: CommandDefinition, context: ExecutionContext): boolean {
		const cache = getDryRunCache();
		const lookupOptions = this.createLookupOptions(command, context);
		const result = cache.get(lookupOptions);
		return result.hit;
	}

	/**
	 * Get cached result if available
	 */
	getCachedResult(command: CommandDefinition, context: ExecutionContext): DryRunCacheEntry | undefined {
		const cache = getDryRunCache();
		const lookupOptions = this.createLookupOptions(command, context);
		const result = cache.get(lookupOptions);
		return result.entry;
	}

	/**
	 * Execute in dry-run mode
	 *
	 * Runs the full pipeline with tool simulation enabled.
	 * The LLM receives tools and makes tool calls, but state-changing
	 * operations are simulated instead of executed.
	 */
	async execute(command: CommandDefinition, context: ExecutionContext): Promise<CommandResult> {
		const logger = getLogger();
		const startTime = Date.now();

		logger.info('Executing in dry-run mode with tool simulation', {
			commandName: command.name,
			stageCount: command.prompts?.pipeline?.length ?? 0
		});

		// Get tool service and ensure dry-run mode is set
		const toolService = getToolExecutionService();
		toolService.setDryRunMode(true);
		toolService.clearSimulatedOperations();

		try {
			// Execute the full pipeline with simulated tools
			const result = await this.executePipelineWithSimulation(command, context);

			// Get simulated operations from tool service
			const simulatedOperations = toolService.getSimulatedOperations();

			// Display the dry-run preview
			const previewService = getDryRunPreviewService();
			previewService.display(simulatedOperations, {
				model: context.model,
				showDiffs: true,
				showTokenEstimates: true
			});

			// Build and cache the execution plan for subsequent runs
			const executionPlan = this.buildExecutionPlan(command, context);
			const precomputedData = await this.precomputeResources(command, context);
			this.cacheExecutionPlan(command, context, executionPlan, precomputedData);

			const duration = Date.now() - startTime;

			// Count operations by type using reduce
			const operationCounts = simulatedOperations.reduce(
				(counts, op) => {
					if (op.type === 'command') counts.commands++;
					else if (op.type === 'external') counts.external++;
					else if (op.type === 'write' || op.type === 'delete') counts.files++;
					return counts;
				},
				{ commands: 0, external: 0, files: 0 }
			);

			return {
				duration_ms: duration,
				outputs: {
					cachedForReuse: true,
					dryRun: true,
					executionPlan,
					message: `Dry-run complete. Run without --dry-run to execute.`,
					simulatedOperations: {
						...operationCounts,
						total: simulatedOperations.length
					}
				},
				stages: result.stages,
				success: result.success
			};
		} finally {
			// Reset dry-run mode
			toolService.setDryRunMode(false);
			toolService.clearSimulatedOperations();
		}
	}

	/**
	 * Execute the pipeline with tool simulation
	 */
	private async executePipelineWithSimulation(
		command: CommandDefinition,
		context: ExecutionContext
	): Promise<{ stages: StageOutput[]; success: boolean }> {
		// Import here to avoid circular dependencies
		const pipelineModule = await import('./pipeline');
		const promptLoaderModule = await import('./prompt-loader');
		const agentLoaderModule = await import('./agent-loader');

		const promptLoader = new promptLoaderModule.PromptLoader();
		const agentLoader = new agentLoaderModule.AgentLoader();
		const pipelineExecutor = new pipelineModule.PipelineExecutor(promptLoader, agentLoader);

		return pipelineExecutor.execute(command.prompts.pipeline, { executionContext: context });
	}

	/**
	 * Execute using cached dry-run results
	 *
	 * This is called by other strategies when they detect a cache hit
	 */
	async executeWithCache(
		command: CommandDefinition,
		context: ExecutionContext,
		cachedEntry: DryRunCacheEntry,
		pipelineExecutor: { execute: (stages: unknown[], ctx: unknown) => Promise<CommandResult> }
	): Promise<CommandResult> {
		const logger = getLogger();

		logger.info('Using cached dry-run analysis for faster execution', {
			cacheAge: Date.now() - cachedEntry.createdAt,
			commandName: command.name
		});

		// Inject cached analysis outputs into the execution context
		const variableResolver = context.getVariableResolver();

		// Add cached outputs as stage outputs so they're available for variable resolution
		if (cachedEntry.analysisOutputs) {
			variableResolver.addStageOutputs('dry_run_cache', cachedEntry.analysisOutputs);
		}

		// If we have pre-computed outputs, record them as completed stages
		cachedEntry.precomputedOutputs?.forEach((output) => context.recordStageCompletion(output));

		// Filter stages based on what was cached
		const stagesToExecute = command.prompts.pipeline.filter((stage) => {
			// Skip stages that were pre-computed in the dry-run
			if (cachedEntry.precomputedOutputs?.some((o) => o.stage === stage.stage)) {
				return false;
			}
			return true;
		});

		logger.debug('Cached execution: filtered stages', {
			original: command.prompts.pipeline.length,
			skipped: command.prompts.pipeline.length - stagesToExecute.length,
			toExecute: stagesToExecute.length
		});

		// Execute remaining stages through the pipeline
		return pipelineExecutor.execute(stagesToExecute, { executionContext: context });
	}

	/**
	 * Build an execution plan without executing
	 */
	private buildExecutionPlan(command: CommandDefinition, context: ExecutionContext): ExecutionPlan {
		const stages = command.prompts?.pipeline ?? [];

		const plannedStages: PlannedStage[] = stages.map((stage, index) => ({
			hasCondition: !!stage.conditional,
			index,
			inputs: stage.inputs ? Object.keys(stage.inputs) : [],
			outputs: stage.outputs ?? [],
			parallel: stage.parallel ?? false,
			prompt: stage.prompt,
			required: stage.required ?? false,
			stage: stage.stage
		}));

		return {
			agentRole: context.agentRole,
			commandName: command.name,
			description: command.description,
			estimatedComplexity: this.estimateComplexity(stages),
			model: context.model,
			stageCount: stages.length,
			stages: plannedStages,
			variablesRequired: this.extractRequiredVariables(stages)
		};
	}

	/**
	 * Pre-compute expensive resources during dry-run for faster subsequent execution
	 *
	 * This method loads and caches:
	 * - All prompt templates required by the pipeline
	 * - The agent definition
	 * - Pre-resolved static inputs (variables that don't depend on LLM output)
	 * - File contents for file-based inputs
	 * - Pipeline validation results
	 */
	private async precomputeResources(command: CommandDefinition, context: ExecutionContext): Promise<PrecomputedData> {
		const logger = getLogger();
		const stages = command.prompts?.pipeline ?? [];

		// Initialize loaders
		const promptLoader = new PromptLoader();
		const agentLoader = new AgentLoader();
		const pipelineValidator = new PipelineValidator();

		// 1. Pre-load all prompts
		const preloadedPrompts = await this.preloadPrompts(stages, promptLoader, logger);

		// 2. Pre-load agent
		const preloadedAgent = await this.preloadAgent(context.agentRole, agentLoader, logger);

		// 3. Validate pipeline
		const validationErrors = pipelineValidator.validatePipeline(stages);
		const pipelineValidated = validationErrors.length === 0;
		if (!pipelineValidated) {
			logger.warn('Pipeline validation failed during dry-run', { errors: validationErrors });
		}

		// 4. Build resolved args map
		const resolvedArgs = this.buildResolvedArgs(context);

		// 5. Pre-resolve static inputs for each stage
		const preresolvedInputs = await this.preresolveStageInputs(stages, context, resolvedArgs, logger);

		logger.info('Pre-computation complete', {
			agentLoaded: !!preloadedAgent,
			pipelineValid: pipelineValidated,
			preresolvedStages: preresolvedInputs.length,
			promptsLoaded: preloadedPrompts.length
		});

		return {
			pipelineValidated,
			preloadedAgent,
			preloadedPrompts,
			preresolvedInputs,
			resolvedArgs
		};
	}

	/**
	 * Pre-load all prompts for the pipeline stages
	 */
	private async preloadPrompts(
		stages: PipelineStage[],
		promptLoader: PromptLoader,
		logger: ReturnType<typeof getLogger>
	): Promise<PreloadedPrompt[]> {
		// Extract unique prompt IDs using Set
		const uniquePromptIds = [...new Set(stages.map((stage) => stage.prompt))];

		// Load prompts sequentially (required for async operations)
		const preloadedPrompts: PreloadedPrompt[] = [];
		for (const promptId of uniquePromptIds) {
			try {
				const prompt = await promptLoader.loadPrompt(promptId);
				preloadedPrompts.push({
					content: prompt.content,
					id: promptId,
					metadata: {
						category: prompt.category,
						description: prompt.description,
						name: prompt.name,
						version: prompt.version
					}
				});
				logger.debug(`Pre-loaded prompt: ${promptId}`);
			} catch (error) {
				logger.warn(`Failed to pre-load prompt: ${promptId}`, {
					error: (error as Error).message
				});
			}
		}

		return preloadedPrompts;
	}

	/**
	 * Pre-load the agent definition
	 */
	private async preloadAgent(
		agentRole: string,
		agentLoader: AgentLoader,
		logger: ReturnType<typeof getLogger>
	): Promise<PreloadedAgent | undefined> {
		try {
			const agent = await agentLoader.loadAgent(agentRole);
			logger.debug(`Pre-loaded agent: ${agentRole}`);
			return {
				content: agent.content,
				decisionMaking: agent.decision_making
					? { escalationCriteria: agent.decision_making.escalation_criteria }
					: undefined,
				role: agentRole
			};
		} catch (error) {
			logger.warn(`Failed to pre-load agent: ${agentRole}`, {
				error: (error as Error).message
			});
			return undefined;
		}
	}

	/**
	 * Build resolved args map from execution context using reduce
	 */
	private buildResolvedArgs(context: ExecutionContext): Record<string, unknown> {
		// Add positional args (1-indexed)
		const positionalArgs = context.args.reduce(
			(acc, arg, idx) => ({ ...acc, [(idx + 1).toString()]: arg }),
			{} as Record<string, unknown>
		);

		// Add flags with normalized keys (including snake_case variants)
		const flagArgs = Object.entries(context.flags).reduce(
			(acc, [key, value]) => {
				const snakeCase = key
					.replace(/-/g, '_')
					.replace(/([a-z])([A-Z])/g, '$1_$2')
					.toLowerCase();

				return {
					...acc,
					[key]: value,
					...(snakeCase !== key ? { [snakeCase]: value } : {})
				};
			},
			{} as Record<string, unknown>
		);

		return { ...positionalArgs, ...flagArgs };
	}

	/**
	 * Pre-resolve static inputs for each stage
	 * Only resolves inputs that don't depend on LLM output ($STAGE_* variables are skipped)
	 */
	private async preresolveStageInputs(
		stages: PipelineStage[],
		_context: ExecutionContext,
		resolvedArgs: Record<string, unknown>,
		logger: ReturnType<typeof getLogger>
	): Promise<PreresolvedInputs[]> {
		const preresolvedInputs: PreresolvedInputs[] = [];

		for (const stage of stages) {
			if (!stage.inputs) {
				continue;
			}

			const result = await this.processStageInputs(stage, resolvedArgs, logger);
			if (result) {
				preresolvedInputs.push(result);
			}
		}

		return preresolvedInputs;
	}

	/**
	 * Process inputs for a single stage
	 */
	private async processStageInputs(
		stage: PipelineStage,
		resolvedArgs: Record<string, unknown>,
		logger: ReturnType<typeof getLogger>
	): Promise<null | PreresolvedInputs> {
		const stageName = `${stage.stage}.${stage.prompt}`;
		const resolvedInputs: Record<string, unknown> = {};
		const enrichedInputs: Record<string, unknown> = {};
		let hasUnresolvedDependencies = false;

		for (const [key, value] of Object.entries(stage.inputs ?? {})) {
			const result = await this.resolveInputValue(key, value, resolvedArgs, logger);
			if (result.hasUnresolved) {
				hasUnresolvedDependencies = true;
			}
			if (result.resolved !== undefined) {
				resolvedInputs[key] = result.resolved;
				enrichedInputs[key] = result.resolved;
			}
			if (result.enriched) {
				Object.assign(enrichedInputs, result.enriched);
			}
		}

		if (Object.keys(resolvedInputs).length === 0) {
			return null;
		}

		logger.debug(`Pre-resolved inputs for ${stageName}`, {
			hasUnresolvedDependencies,
			resolvedCount: Object.keys(resolvedInputs).length
		});

		return { enrichedInputs, resolvedInputs, stageName };
	}

	/**
	 * Resolve a single input value
	 */
	private async resolveInputValue(
		key: string,
		value: unknown,
		resolvedArgs: Record<string, unknown>,
		logger: ReturnType<typeof getLogger>
	): Promise<{ enriched?: Record<string, unknown>; hasUnresolved: boolean; resolved?: unknown }> {
		if (typeof value !== 'string') {
			return { hasUnresolved: false, resolved: value };
		}

		// Check if this depends on stage outputs (can't be pre-resolved)
		if (value.includes('$STAGE_')) {
			return { hasUnresolved: true };
		}

		// Resolve $ARG_* variables
		if (value.startsWith('$ARG_')) {
			return this.resolveArgVariable(key, value, resolvedArgs, logger);
		}

		// Resolve $ENV_* variables
		if (value.startsWith('$ENV_')) {
			return this.resolveEnvVariable(value);
		}

		// Static value (doesn't start with $)
		if (!value.startsWith('$')) {
			return { hasUnresolved: false, resolved: value };
		}

		return { hasUnresolved: false };
	}

	/**
	 * Resolve $ARG_* variable
	 */
	private async resolveArgVariable(
		key: string,
		value: string,
		resolvedArgs: Record<string, unknown>,
		logger: ReturnType<typeof getLogger>
	): Promise<{ enriched?: Record<string, unknown>; hasUnresolved: boolean; resolved?: unknown }> {
		const argName = value.substring(5); // Remove '$ARG_' prefix
		const resolvedValue = resolvedArgs[argName];

		if (resolvedValue === undefined) {
			return { hasUnresolved: false };
		}

		const enriched = await this.enrichWithFileContent(key, resolvedValue, logger);
		return { enriched, hasUnresolved: false, resolved: resolvedValue };
	}

	/**
	 * Resolve $ENV_* variable
	 */
	private resolveEnvVariable(value: string): { hasUnresolved: boolean; resolved?: unknown } {
		const envName = value.substring(5);
		const envValue = process.env[envName];
		return envValue !== undefined ? { hasUnresolved: false, resolved: envValue } : { hasUnresolved: false };
	}

	/**
	 * Enrich with file content if applicable
	 */
	private async enrichWithFileContent(
		key: string,
		resolvedValue: unknown,
		logger: ReturnType<typeof getLogger>
	): Promise<Record<string, unknown> | undefined> {
		const isFileArg = key.endsWith('_file') || key.endsWith('_file_arg') || key.endsWith('_path');
		if (!isFileArg || typeof resolvedValue !== 'string' || !resolvedValue.trim()) {
			return undefined;
		}

		const filePath = resolvedValue.trim();
		if (!existsSync(filePath)) {
			return undefined;
		}

		try {
			const content = await readFile(filePath);
			logger.debug(`Pre-read file for ${key}: ${filePath} (${content.length} chars)`);
			return { [`${key}_content`]: content };
		} catch (error) {
			logger.warn(`Failed to pre-read file ${filePath}`, { error: (error as Error).message });
			return undefined;
		}
	}

	/**
	 * Cache the execution plan for subsequent runs
	 */
	private cacheExecutionPlan(
		command: CommandDefinition,
		context: ExecutionContext,
		plan: ExecutionPlan,
		precomputedData: PrecomputedData
	): void {
		const cache = getDryRunCache();
		const lookupOptions = this.createLookupOptions(command, context);

		cache.set(lookupOptions, {
			agentRole: context.agentRole,
			analysisOutputs: {
				agentRole: context.agentRole,
				args: context.args,
				flags: context.flags,
				model: context.model,
				plan
			},
			commandName: command.name,
			model: context.model,
			plannedStages: command.prompts?.pipeline ?? [],
			// Include precomputed resources for faster execution
			pipelineValidated: precomputedData.pipelineValidated,
			preloadedAgent: precomputedData.preloadedAgent,
			preloadedPrompts: precomputedData.preloadedPrompts,
			preresolvedInputs: precomputedData.preresolvedInputs,
			resolvedArgs: precomputedData.resolvedArgs
		});
	}

	/**
	 * Create lookup options from command and context
	 */
	private createLookupOptions(command: CommandDefinition, context: ExecutionContext): DryRunCacheLookupOptions {
		return {
			args: context.args,
			command,
			commandName: command.name,
			flags: context.flags
		};
	}

	/**
	 * Estimate execution complexity based on pipeline structure
	 */
	private estimateComplexity(stages: Array<{ parallel?: boolean; required?: boolean }>): string {
		const stageCount = stages.length;
		const parallelCount = stages.filter((s) => s.parallel).length;
		const requiredCount = stages.filter((s) => s.required).length;

		if (stageCount <= 2) return 'low';
		if (stageCount <= 5 && parallelCount > 0) return 'medium';
		if (stageCount > 5 || requiredCount > 3) return 'high';
		return 'medium';
	}

	/**
	 * Extract required variables from pipeline stages using flatMap
	 */
	private extractRequiredVariables(stages: Array<{ inputs?: Record<string, unknown> }>): string[] {
		const variables = stages
			.filter((stage) => stage.inputs)
			.flatMap((stage) => Object.values(stage.inputs!))
			.filter((value): value is string => typeof value === 'string' && value.startsWith('$'));

		// Use Set for deduplication, then sort
		return [...new Set(variables)].sort();
	}
}

/**
 * Pre-computed data structure for caching
 */
interface PrecomputedData {
	pipelineValidated: boolean;
	preloadedAgent: PreloadedAgent | undefined;
	preloadedPrompts: PreloadedPrompt[];
	preresolvedInputs: PreresolvedInputs[];
	resolvedArgs: Record<string, unknown>;
}

/**
 * Execution plan structure
 */
interface ExecutionPlan {
	agentRole: string;
	commandName: string;
	description: string;
	estimatedComplexity: string;
	model?: string;
	stageCount: number;
	stages: PlannedStage[];
	variablesRequired: string[];
}

/**
 * Planned stage in the execution plan
 */
interface PlannedStage {
	hasCondition: boolean;
	index: number;
	inputs: string[];
	outputs: string[];
	parallel: boolean;
	prompt: string;
	required: boolean;
	stage: string;
}

/**
 * Get a new DryRunExecutionStrategy instance
 */
export function createDryRunStrategy(): DryRunExecutionStrategy {
	return new DryRunExecutionStrategy();
}
