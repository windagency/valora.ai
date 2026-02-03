/**
 * Execution Coordinator - Orchestrates the main command execution flow
 */

import type { AgentSelectionAnalyticsService, DynamicAgentResolverService } from 'services/index';
import type { TaskContext } from 'types/agent.types';
import type { AgentRole, CommandResult, PromptsPipeline } from 'types/command.types';

import { getConfigLoader } from 'config/loader';
import { AgentLoader } from 'executor/agent-loader';
import { ExecutionContext, type SessionInfo } from 'executor/execution-context';
import { CommandExecutionStrategyFactory } from 'executor/execution-strategy';
import { existsSync } from 'fs';
import { getLogger } from 'output/logger';
import { getProcessingFeedback } from 'output/processing-feedback';
import { resolve } from 'path';
import { SessionContextManager } from 'session/context';
import { getPromptAdapter } from 'ui/prompt-adapter.interface';
import { ValidationError } from 'utils/error-handler';

import type { CommandExecutionOptions } from './command-executor';
import type { ResolvedCommand } from './command-resolver';

export interface ExecutionResult {
	result: CommandResult;
	sessionManager: SessionContextManager;
	startTime: number;
}

/**
 * Type guard to check if object has description property
 */
function hasDescription(obj: unknown): obj is { description: string } {
	return typeof obj === 'object' && obj !== null && 'description' in obj && typeof obj.description === 'string';
}

/**
 * Type guard to check if object has targetFiles property
 */
function hasTargetFiles(obj: unknown): obj is { targetFiles: string[] } {
	return typeof obj === 'object' && obj !== null && 'targetFiles' in obj && Array.isArray(obj.targetFiles);
}

/**
 * Type guard to check if object has dependencies property
 */
function hasDependencies(obj: unknown): obj is { dependencies: string[] } {
	return typeof obj === 'object' && obj !== null && 'dependencies' in obj && Array.isArray(obj.dependencies);
}

/**
 * Type guard to check if value is a string array
 */
function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * Feature flags for agent selection
 */
interface AgentSelectionFeatureFlags {
	analyticsEnabled: boolean;
	dynamicAgentSelectionEnabled: boolean;
	implementOnlyEnabled: boolean;
}

/**
 * Agent selection context
 */
interface AgentSelectionContext {
	commandName: string;
	featureFlags: AgentSelectionFeatureFlags;
	manualOverride: boolean;
	previousAgent?: AgentRole;
}

export class ExecutionCoordinator {
	private readonly agentLoader: AgentLoader;
	private analyticsService?: AgentSelectionAnalyticsService;
	private dynamicAgentResolver?: DynamicAgentResolverService;
	private readonly LOW_CONFIDENCE_THRESHOLD = 0.5;
	private strategyFactory: CommandExecutionStrategyFactory;

	constructor(dynamicAgentResolver?: DynamicAgentResolverService, analyticsService?: AgentSelectionAnalyticsService) {
		this.strategyFactory = new CommandExecutionStrategyFactory();
		this.dynamicAgentResolver = dynamicAgentResolver;
		this.analyticsService = analyticsService;
		this.agentLoader = new AgentLoader();
	}

	/**
	 * Get feature flags for agent selection
	 */
	private getAgentSelectionFeatureFlags(): AgentSelectionFeatureFlags {
		const configLoader = getConfigLoader();
		const config = configLoader.get();

		return {
			analyticsEnabled: config.features?.agent_selection_analytics ?? false,
			dynamicAgentSelectionEnabled: config.features?.dynamic_agent_selection ?? false,
			implementOnlyEnabled: config.features?.dynamic_agent_selection_implement_only ?? true
		};
	}

	/**
	 * Check if dynamic agent selection should be used
	 */
	private shouldUseDynamicSelection(commandName: string, featureFlags: AgentSelectionFeatureFlags): boolean {
		return (
			featureFlags.dynamicAgentSelectionEnabled || (featureFlags.implementOnlyEnabled && commandName === 'implement')
		);
	}

	/**
	 * Resolve agent using dynamic selection
	 */
	private async resolveDynamicAgent(
		commandName: string,
		options: CommandExecutionOptions,
		sessionManager: SessionContextManager,
		context: AgentSelectionContext
	): Promise<AgentRole> {
		const logger = getLogger();
		const taskContext = this.createTaskContext(commandName, options, sessionManager);
		const agentSelection = await this.dynamicAgentResolver!.resolveAgent(taskContext);
		let effectiveAgent = agentSelection.selectedAgent as AgentRole;

		logger.info(`Dynamic agent selected: ${effectiveAgent}`, {
			command: commandName,
			confidence: agentSelection.confidence,
			featureFlags: context.featureFlags,
			manualOverride: context.manualOverride,
			reasons: agentSelection.reasons.slice(0, 2)
		});

		// Check if confidence is low and prompt user for confirmation
		if (agentSelection.confidence < this.LOW_CONFIDENCE_THRESHOLD && options.interactive !== false) {
			const confirmedAgent = await this.promptForAgentConfirmation(
				effectiveAgent,
				agentSelection.confidence,
				agentSelection.alternatives
			);
			if (confirmedAgent) {
				effectiveAgent = confirmedAgent;
				logger.info(`User selected agent: ${effectiveAgent}`, {
					originalSelection: agentSelection.selectedAgent,
					userOverride: confirmedAgent !== agentSelection.selectedAgent
				});
			}
		}

		// Record analytics if enabled
		if (context.featureFlags.analyticsEnabled && this.analyticsService) {
			this.analyticsService.recordAgentSelection(
				sessionManager.getSession().session_id,
				commandName,
				taskContext,
				agentSelection,
				context.featureFlags,
				context.manualOverride,
				context.previousAgent
			);
		}

		// Store agent selection in session context
		sessionManager.updateContext('dynamicAgentSelection', agentSelection);

		return effectiveAgent;
	}

	/**
	 * Prompt user to confirm or choose a different agent when confidence is low
	 */
	private async promptForAgentConfirmation(
		suggestedAgent: AgentRole,
		confidence: number,
		alternatives: Array<{ agent: string; reasons: string[]; score: number }>
	): Promise<AgentRole | null> {
		const prompt = getPromptAdapter();
		const confidencePercent = Math.round(confidence * 100);

		// Build choices list
		const choices: Array<{ name: string; value: string }> = [];

		// Add suggested agent first
		choices.push({
			name: `${suggestedAgent} (suggested, ${confidencePercent}% confidence)`,
			value: suggestedAgent
		});

		// Add alternatives if available
		for (const alt of alternatives.slice(0, 3)) {
			const altPercent = Math.round(alt.score * 100);
			choices.push({
				name: `${alt.agent} (${altPercent}% confidence)`,
				value: alt.agent
			});
		}

		// Add option to see all agents
		choices.push({
			name: '── Show all available agents ──',
			value: '__show_all__'
		});

		const answers = await prompt.prompt<{ selectedAgent: string }>([
			{
				choices,
				message: `Low confidence (${confidencePercent}%) in agent selection. Confirm or choose another:`,
				name: 'selectedAgent',
				type: 'list'
			}
		]);

		// If user wants to see all agents, show expanded list
		if (answers.selectedAgent === '__show_all__') {
			const allAgents = await this.agentLoader.listAgents();
			const allChoices = allAgents.map((agent) => ({
				name: agent,
				value: agent
			}));

			const expandedAnswers = await prompt.prompt<{ selectedAgent: string }>([
				{
					choices: allChoices,
					message: 'Select an agent:',
					name: 'selectedAgent',
					pageSize: 15,
					type: 'list'
				}
			]);

			return expandedAnswers.selectedAgent as AgentRole;
		}

		return answers.selectedAgent as AgentRole;
	}

	/**
	 * Handle dynamic agent resolution with fallback
	 */
	private async handleDynamicAgentResolution(
		commandName: string,
		resolvedCommand: ResolvedCommand,
		options: CommandExecutionOptions,
		sessionManager: SessionContextManager,
		context: AgentSelectionContext
	): Promise<AgentRole> {
		const logger = getLogger();

		try {
			return await this.resolveDynamicAgent(commandName, options, sessionManager, context);
		} catch (error) {
			logger.warn(
				`Dynamic agent resolution failed, using fallback: ${resolvedCommand.command.fallback_agent ?? 'unknown'}`,
				{
					command: commandName,
					error: (error as Error).message,
					featureFlags: context.featureFlags
				}
			);

			const fallbackAgent = resolvedCommand.command.fallback_agent!;

			// Record fallback analytics if enabled
			if (context.featureFlags.analyticsEnabled && this.analyticsService) {
				const taskContext = this.createTaskContext(commandName, options, sessionManager);
				const fallbackSelection = {
					alternatives: [],
					confidence: 0,
					reasons: ['fallback_due_to_error'],
					selectedAgent: fallbackAgent
				};
				this.analyticsService.recordAgentSelection(
					sessionManager.getSession().session_id,
					commandName,
					taskContext,
					fallbackSelection,
					context.featureFlags,
					context.manualOverride,
					context.previousAgent
				);
			}

			return fallbackAgent;
		}
	}

	/**
	 * Handle static agent assignment with analytics
	 */
	private handleStaticAgentAssignment(
		commandName: string,
		resolvedCommand: ResolvedCommand,
		options: CommandExecutionOptions,
		sessionManager: SessionContextManager,
		context: AgentSelectionContext
	): AgentRole {
		const logger = getLogger();
		const effectiveAgent = context.manualOverride ? context.previousAgent! : resolvedCommand.command.agent!;

		// Log when dynamic selection was available but not used
		if (resolvedCommand.command.dynamic_agent_selection && this.dynamicAgentResolver) {
			const shouldUseDynamic = this.shouldUseDynamicSelection(commandName, context.featureFlags);
			if (!shouldUseDynamic) {
				logger.info(`Dynamic agent selection available but disabled by feature flags`, {
					command: commandName,
					featureFlags: context.featureFlags,
					manualOverride: context.manualOverride
				});
			}
		}

		// Record manual override analytics if enabled
		if (context.featureFlags.analyticsEnabled && this.analyticsService && context.manualOverride) {
			const taskContext = this.createTaskContext(commandName, options, sessionManager);
			const manualSelection = {
				alternatives: [],
				confidence: 1.0,
				reasons: ['manual_override'],
				selectedAgent: effectiveAgent
			};
			this.analyticsService.recordAgentSelection(
				sessionManager.getSession().session_id,
				commandName,
				taskContext,
				manualSelection,
				context.featureFlags,
				true,
				resolvedCommand.command.agent
			);
		}

		return effectiveAgent;
	}

	/**
	 * Execute command with full orchestration
	 * @param commandName - The name of the command to execute
	 * @param resolvedCommand - The resolved command configuration
	 * @param options - Command execution options
	 * @param sessionManager - The session context manager
	 * @param sessionInfo - Optional session info indicating if this is a resumed session
	 */
	async executeCommand(
		commandName: string,
		resolvedCommand: ResolvedCommand,
		options: CommandExecutionOptions,
		sessionManager: SessionContextManager,
		sessionInfo?: SessionInfo
	): Promise<ExecutionResult> {
		const logger = getLogger();
		const startTime = Date.now();

		logger.info(`Executing command: ${commandName}`, {
			sessionId: sessionManager.getSession().session_id
		});

		// Validate file path arguments for commands that require them
		this.validateFilePathArguments(commandName, options);

		// Get feature flags and prepare selection context
		const featureFlags = this.getAgentSelectionFeatureFlags();
		const manualOverride = options.flags['agent'] !== undefined;
		const previousAgent = manualOverride ? (options.flags['agent'] as AgentRole) : undefined;

		const selectionContext: AgentSelectionContext = {
			commandName,
			featureFlags,
			manualOverride,
			previousAgent
		};

		// Determine if we should use dynamic agent selection
		const useDynamicSelection =
			resolvedCommand.command.dynamic_agent_selection &&
			this.dynamicAgentResolver &&
			this.shouldUseDynamicSelection(commandName, featureFlags);

		// Resolve agent (dynamic or static)
		const effectiveAgent = useDynamicSelection
			? await this.handleDynamicAgentResolution(commandName, resolvedCommand, options, sessionManager, selectionContext)
			: this.handleStaticAgentAssignment(commandName, resolvedCommand, options, sessionManager, selectionContext);

		// Store feature flags in session context
		const configLoader = getConfigLoader();
		sessionManager.updateContext('featureFlags', configLoader.get().features);

		// Create execution context and execute
		const executionContext = this.createExecutionContext(
			commandName,
			resolvedCommand,
			options,
			sessionManager,
			effectiveAgent,
			sessionInfo
		);

		const strategy = this.strategyFactory.getStrategy(resolvedCommand.command, executionContext);
		const strategyName = strategy.constructor.name.replace('ExecutionStrategy', '').toLowerCase();

		logger.info(`Executing command: ${commandName}`, {
			mode: options.isolation ? 'isolated' : 'pipeline',
			stages: options.isolation?.stages?.length ?? 'all',
			strategy: strategyName
		});

		// Start processing feedback to show user what's happening
		const processingFeedback = getProcessingFeedback();
		processingFeedback.start();

		let result: CommandResult;
		try {
			result = await strategy.execute(resolvedCommand.command, executionContext);
		} finally {
			// Always stop feedback, even on error
			processingFeedback.stop();
		}

		return {
			result,
			sessionManager,
			startTime
		};
	}

	/**
	 * Create task context for dynamic agent resolution
	 */
	private createTaskContext(
		commandName: string,
		options: CommandExecutionOptions,
		sessionManager: SessionContextManager
	): TaskContext {
		// Extract task description from arguments or context
		const description = this.extractTaskDescription(commandName, options, sessionManager);

		// Extract affected files from context or arguments
		const affectedFiles = this.extractAffectedFiles(options, sessionManager);

		// Extract dependencies from context
		const dependencies = this.extractDependencies(sessionManager);

		return {
			affectedFiles,
			complexity: 'medium',
			dependencies,
			description, // Default, could be enhanced with analysis
			metadata: {
				args: options.args,
				commandName,
				flags: options.flags,
				sessionId: sessionManager.getSession().session_id
			}
		};
	}

	/**
	 * Extract task description from command arguments and context
	 */
	private extractTaskDescription(
		commandName: string,
		options: CommandExecutionOptions,
		sessionManager: SessionContextManager
	): string {
		// For implement command, the first argument is typically the implementation plan
		if (commandName === 'implement' && options.args.length > 0) {
			const firstArg = options.args[0];
			if (firstArg !== undefined) {
				return firstArg;
			}
		}

		// Check session context for plan or task information
		const planSummary = sessionManager.getContext('planSummary');
		if (hasDescription(planSummary)) {
			return planSummary.description;
		}

		const task = sessionManager.getContext('task');
		if (hasDescription(task)) {
			return task.description;
		}

		// Fallback to command name and arguments
		return `${commandName} ${options.args.join(' ')}`.trim();
	}

	/**
	 * Extract affected files from options and session context
	 */
	private extractAffectedFiles(options: CommandExecutionOptions, sessionManager: SessionContextManager): string[] {
		// Check for target files in context
		const targetFiles = sessionManager.getContext('targetFiles');
		if (isStringArray(targetFiles)) {
			return targetFiles;
		}

		const implementationScope = sessionManager.getContext('implementationScope');
		if (hasTargetFiles(implementationScope)) {
			return implementationScope.targetFiles;
		}

		// Extract from arguments if they look like file paths
		const fileArgs = options.args.filter(
			(arg) =>
				arg.includes('.ts') ||
				arg.includes('.js') ||
				arg.includes('.md') ||
				arg.includes('.tf') ||
				arg.includes('.yaml') ||
				arg.includes('.json')
		);

		return fileArgs;
	}

	/**
	 * Extract dependencies from session context
	 */
	private extractDependencies(sessionManager: SessionContextManager): string[] {
		const dependencies = sessionManager.getContext('dependencies');
		if (isStringArray(dependencies)) {
			return dependencies;
		}

		const planSummary = sessionManager.getContext('planSummary');
		if (hasDependencies(planSummary)) {
			return planSummary.dependencies;
		}

		return [];
	}

	/**
	 * Create execution context with all dependencies
	 * Filters session context to only include keys referenced by the pipeline
	 * Initializes with stage outputs from previous commands in the session
	 */
	private createExecutionContext(
		commandName: string,
		resolvedCommand: ResolvedCommand,
		options: CommandExecutionOptions,
		sessionManager: SessionContextManager,
		effectiveAgent: AgentRole,
		sessionInfo?: SessionInfo
	): ExecutionContext {
		const logger = getLogger();

		// Get full context for extracting internal data
		const fullContext = sessionManager.getAllContext();

		// Extract initial stage outputs from session (from previous commands)
		const initialStageOutputs = this.getInitialStageOutputsFromSession(fullContext);
		if (Object.keys(initialStageOutputs).length > 0) {
			logger.debug('Loaded initial stage outputs from session', {
				stageCount: Object.keys(initialStageOutputs).length,
				stageNames: Object.keys(initialStageOutputs)
			});
		}

		// Extract context references from the command pipeline for filtering
		const referencedContextKeys = this.extractPipelineContextReferences(resolvedCommand.command.prompts);

		// Get filtered or full context based on references found
		let sessionContext: Record<string, unknown>;
		if (referencedContextKeys.size > 0) {
			sessionContext = sessionManager.getFilteredContext(Array.from(referencedContextKeys));
			logger.debug('Filtered session context for execution', {
				allContextKeys: sessionManager.getContextKeys().length,
				filteredKeys: Object.keys(sessionContext).length,
				referencedKeys: Array.from(referencedContextKeys)
			});
		} else {
			// If no specific references found, pass full context (safe default)
			sessionContext = fullContext;
		}

		return new ExecutionContext({
			agentRole: effectiveAgent,
			allowedTools: resolvedCommand.command['allowed-tools'],
			args: options.args,
			commandName,
			flags: options.flags,
			initialStageOutputs,
			interactive: options.interactive,
			isolation: options.isolation,
			knowledgeFiles: resolvedCommand.command.knowledge_files,
			mode: resolvedCommand.mode,
			model: resolvedCommand.model,
			provider: resolvedCommand.provider,
			sessionContext,
			sessionInfo
		});
	}

	/**
	 * Get initial stage outputs from session for variable resolution
	 * Allows new commands to reference outputs from previous commands in the session
	 */
	private getInitialStageOutputsFromSession(
		sessionContext: Record<string, unknown>
	): Record<string, Record<string, unknown>> {
		const stageOutputs = sessionContext['_stageOutputs'] as Record<string, Record<string, unknown>> | undefined;
		return stageOutputs ?? {};
	}

	/**
	 * Extract $CONTEXT_* variable references from all pipeline stages
	 * Used to filter session context to only what's actually needed
	 */
	private extractPipelineContextReferences(prompts: PromptsPipeline): Set<string> {
		const references = new Set<string>();

		// Get pipeline stages from the prompts configuration
		const stages = prompts.pipeline ?? [];

		// Extract context references from each stage's inputs and conditional
		for (const stage of stages) {
			if (stage.inputs) {
				const stageRefs = SessionContextManager.extractContextReferences(stage.inputs);
				stageRefs.forEach((ref) => references.add(ref));
			}
			if (stage.conditional) {
				const condRefs = SessionContextManager.extractContextReferences(stage.conditional);
				condRefs.forEach((ref) => references.add(ref));
			}
		}

		return references;
	}

	/**
	 * Validate file path arguments for commands that require them
	 * Throws ValidationError if required files don't exist
	 */
	private validateFilePathArguments(commandName: string, options: CommandExecutionOptions): void {
		// Commands that require a file path as the first argument
		const filePathRequiredCommands: Record<string, { argName: string; description: string }> = {
			implement: { argName: 'implementation plan', description: 'Implementation plan file' },
			'review-plan': { argName: 'plan file', description: 'Plan file to review' }
		};

		const requirement = filePathRequiredCommands[commandName];
		if (!requirement) {
			return;
		}

		const firstArg = options.args[0];
		if (!firstArg) {
			// No argument provided - let the command handle this with its own error
			return;
		}

		// Check if argument looks like a file path (contains .md, .yaml, .json, or /)
		const looksLikeFilePath =
			firstArg.endsWith('.md') ||
			firstArg.endsWith('.yaml') ||
			firstArg.endsWith('.yml') ||
			firstArg.endsWith('.json') ||
			firstArg.includes('/');

		if (!looksLikeFilePath) {
			// Not a file path, let the command handle it
			return;
		}

		// Resolve the file path
		const resolvedPath = resolve(process.cwd(), firstArg);

		if (!existsSync(resolvedPath)) {
			throw new ValidationError(`${requirement.description} not found: ${firstArg}`, {
				command: commandName,
				filePath: firstArg,
				resolvedPath,
				suggestion: `Verify the file path exists. Use 'valora plan <task>' to create a new plan, or check the knowledge-base directory for existing plans.`
			});
		}
	}
}
