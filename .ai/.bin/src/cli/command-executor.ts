/**
 * Command executor - orchestrates command execution
 * Refactored to use smaller, focused classes for better maintainability
 */

import type { Logger } from 'output/logger';
import type { CommandResult, IsolatedExecutionOptions } from 'types/command.types';
import type { DocumentOutputOptions } from 'types/document.types';
import type { MCPSamplingService } from 'types/mcp.types';
import type { OptimizationMetrics, QualityMetrics } from 'types/session.types';

import { getConfigLoader } from 'config/loader';
import { AgentLoader } from 'executor/agent-loader';
import { CommandIsolationExecutor } from 'executor/command-isolation.executor';
import { CommandLoader } from 'executor/command-loader';
import { PipelineExecutor } from 'executor/pipeline';
import { PromptLoader } from 'executor/prompt-loader';
import { StageExecutor } from 'executor/stage-executor';
import { getConsoleOutput } from 'output/console-output';
import { getRenderer } from 'output/markdown';
import { createGitStashProtection, type GitStashProtectionService } from 'services/git-stash-protection.service';
import {
	AgentSelectionAnalyticsService,
	DocumentDetectorService,
	DocumentPathResolverService,
	DocumentTemplateService,
	DocumentWriterService,
	type DynamicAgentResolverService
} from 'services/index';
import { SessionLifecycle } from 'session/lifecycle';
import { SessionStore } from 'session/store';
import { getPromptAdapter } from 'ui/prompt-adapter.interface';
import { formatErrorMessage } from 'utils/error-utils';
import { incrementCounter, timeAsync } from 'utils/metrics-collector';

import { CommandErrorHandler, type ErrorHandlingContext } from './command-error-handler';
import { CommandResolver } from './command-resolver';
import { CommandValidator } from './command-validator';
import { DocumentApprovalWorkflow } from './document-approval';
import { DocumentOutputProcessor } from './document-output-processor';
import { ExecutionCoordinator } from './execution-coordinator';
import { CLIProviderResolver } from './provider-resolver';
import { ResultPresenter } from './result-presenter';
import { CLISessionManager } from './session-manager';

export interface CommandExecutionOptions {
	args: string[];
	documentOutput?: DocumentOutputOptions;
	flags: Record<string, boolean | string | undefined>;
	interactive?: boolean;
	isolation?: IsolatedExecutionOptions;
	sessionId?: string;
}

/**
 * Token usage structure from LLM providers
 */
interface TokenUsage {
	completion_tokens?: number;
	prompt_tokens?: number;
	total_tokens?: number;
}

/**
 * Token breakdown structure for tracking
 */
interface TokenBreakdown {
	context: number;
	generation: number;
	total: number;
}

/**
 * Context for successful result handling
 */
interface SuccessHandlingContext {
	commandName: string;
	documentOptions: DocumentOutputOptions & { taskId?: string };
	duration: number;
	isDryRun: boolean;
	resolvedCommand: Awaited<ReturnType<CommandResolver['resolveCommand']>>;
	result: CommandResult;
	sessionManager: Awaited<ReturnType<CLISessionManager['getOrCreateSession']>>;
	tokenBreakdown: TokenBreakdown;
	totalSessionTokens: number;
}

/**
 * Type guard for token usage objects
 */
function isTokenUsage(value: unknown): value is TokenUsage {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const usage = value as Record<string, unknown>;
	return (
		(typeof usage['completion_tokens'] === 'number' || usage['completion_tokens'] === undefined) &&
		(typeof usage['prompt_tokens'] === 'number' || usage['prompt_tokens'] === undefined) &&
		(typeof usage['total_tokens'] === 'number' || usage['total_tokens'] === undefined)
	);
}

/**
 * Dependencies required by CommandExecutor
 */
export interface CommandExecutorDependencies {
	agentLoader: AgentLoader;
	analyticsService?: AgentSelectionAnalyticsService;
	commandLoader: CommandLoader;
	documentOutputProcessor?: DocumentOutputProcessor;
	dynamicAgentResolver?: DynamicAgentResolverService;
	isolationExecutor: CommandIsolationExecutor;
	logger: Logger;
	mcpSampling?: MCPSamplingService;
	pipelineExecutor: PipelineExecutor;
	promptLoader: PromptLoader;
	providerResolver: CLIProviderResolver;
	sessionLifecycle: SessionLifecycle;
	sessionManager: CLISessionManager;
}

export class CommandExecutor {
	// Core dependencies
	private agentLoader!: AgentLoader;
	private commandLoader!: CommandLoader;
	private promptLoader!: PromptLoader;
	// Planned for future use - keeping for compatibility
	private analyticsService?: AgentSelectionAnalyticsService;
	private dynamicAgentResolver?: DynamicAgentResolverService;
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore - Planned for future use
	private pipelineExecutor!: PipelineExecutor;
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore - Planned for future use
	private isolationExecutor!: CommandIsolationExecutor;
	private logger!: Logger;
	private mcpSampling?: MCPSamplingService;
	private providerResolver!: CLIProviderResolver;
	private sessionLifecycle!: SessionLifecycle;
	private sessionManager!: CLISessionManager;

	// Focused service classes
	private commandResolver!: CommandResolver;
	private commandValidator!: CommandValidator;
	private documentOutputProcessor!: DocumentOutputProcessor;
	private errorHandler!: CommandErrorHandler;
	private executionCoordinator!: ExecutionCoordinator;
	private resultPresenter!: ResultPresenter;

	/**
	 * Creates a CommandExecutor instance
	 *
	 * @param dependencies - Injected dependencies or optional MCP sampling service for backwards compatibility
	 */
	constructor(dependencies: CommandExecutorDependencies | MCPSamplingService) {
		// Handle backwards compatibility with old constructor signature
		if (dependencies && typeof dependencies === 'object' && 'handleToolCall' in dependencies) {
			// Old signature: constructor(mcpSampling?: MCPSamplingService)
			this.mcpSampling = dependencies as MCPSamplingService;
			this.initializeDependencies();
		} else if (dependencies && typeof dependencies === 'object') {
			// New signature: constructor(dependencies: CommandExecutorDependencies)
			const deps = dependencies as CommandExecutorDependencies;
			this.commandLoader = deps.commandLoader;
			this.promptLoader = deps.promptLoader;
			this.agentLoader = deps.agentLoader;
			this.pipelineExecutor = deps.pipelineExecutor;
			this.isolationExecutor = deps.isolationExecutor;
			this.sessionLifecycle = deps.sessionLifecycle;
			this.sessionManager = deps.sessionManager;
			this.providerResolver = deps.providerResolver;
			this.logger = deps.logger;
			this.mcpSampling = deps.mcpSampling;
			this.dynamicAgentResolver = deps.dynamicAgentResolver;
			this.analyticsService = deps.analyticsService;
			// Store document output processor if provided via DI
			if (deps.documentOutputProcessor) {
				this.documentOutputProcessor = deps.documentOutputProcessor;
			}
		} else {
			// No dependencies provided - initialize with defaults
			this.initializeDependencies();
		}

		// Initialize focused service classes
		this.initializeServices();
	}

	/**
	 * Initialize dependencies with default implementations (backwards compatibility)
	 */
	private initializeDependencies(): void {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { getLogger } = require('output/logger') as { getLogger: () => Logger };
		this.logger = getLogger();
		this.commandLoader = new CommandLoader();
		this.promptLoader = new PromptLoader();
		this.agentLoader = new AgentLoader();
		this.pipelineExecutor = new PipelineExecutor(this.promptLoader, this.agentLoader);
		const stageExecutor = new StageExecutor(this.promptLoader, this.agentLoader);
		this.isolationExecutor = new CommandIsolationExecutor(stageExecutor);
		this.sessionLifecycle = new SessionLifecycle(new SessionStore());
		this.sessionManager = new CLISessionManager(this.sessionLifecycle);
		this.providerResolver = new CLIProviderResolver();
	}

	/**
	 * Initialize focused service classes (synchronous, analytics deferred)
	 */
	private initializeServices(): void {
		this.commandValidator = new CommandValidator();
		this.commandResolver = new CommandResolver(this.commandLoader, this.providerResolver, this.mcpSampling);

		// Analytics initialization is deferred until first execution
		// This avoids blocking constructor with async config loading
		this.executionCoordinator = new ExecutionCoordinator(this.dynamicAgentResolver, this.analyticsService);
		this.resultPresenter = new ResultPresenter();

		// Only create DocumentOutputProcessor if not already provided via DI
		if (!this.documentOutputProcessor) {
			const pathResolver = new DocumentPathResolverService();
			this.documentOutputProcessor = new DocumentOutputProcessor({
				approval: new DocumentApprovalWorkflow(),
				consoleOutput: getConsoleOutput(),
				detector: new DocumentDetectorService(),
				renderer: getRenderer(),
				template: new DocumentTemplateService(),
				writer: new DocumentWriterService(pathResolver)
			});
		}

		this.errorHandler = new CommandErrorHandler();
	}

	/**
	 * Ensure analytics service is initialized (called on first execution)
	 */
	private async ensureAnalyticsInitialized(): Promise<void> {
		// Skip if already provided via DI or already initialized
		if (this.analyticsService || this.executionCoordinator?.['analyticsService']) {
			return;
		}

		try {
			const configLoader = getConfigLoader();
			const config = await configLoader.load();
			// Enable analytics by default for agent selection tracking, or use config flag
			const analyticsEnabled = config.features?.agent_selection_analytics ?? true;

			if (analyticsEnabled) {
				const analyticsService = new AgentSelectionAnalyticsService();
				this.analyticsService = analyticsService;
				// Update coordinator with analytics service
				if (this.executionCoordinator) {
					this.executionCoordinator['analyticsService'] = analyticsService;
				}
				this.logger.info('Agent selection analytics service initialized');
			}
		} catch (error) {
			this.logger.warn('Failed to initialize analytics service, continuing without analytics', {
				error: formatErrorMessage(error)
			});
		}
	}

	/**
	 * Check if MCP sampling is available
	 */
	public hasMCPSampling(): boolean {
		return !!this.mcpSampling;
	}

	/**
	 * Execute a command using focused service classes
	 */
	async execute(commandName: string, options: CommandExecutionOptions): Promise<CommandResult> {
		// Track command execution metrics
		incrementCounter('commands_total', 1, { command: commandName });

		return timeAsync(
			`command_${commandName}`,
			async () => {
				const startTime = Date.now();
				let stashProtection: GitStashProtectionService | undefined;

				try {
					// Step 0-1: Initialize analytics and validate prerequisites
					await this.ensureAnalyticsInitialized();
					this.validatePrerequisites(commandName, options);

					// Step 2: Get or create session with status tracking
					const sessionResult = await this.sessionManager.getOrCreateSessionWithStatus(options);
					const sessionManager = sessionResult.sessionManager;
					const sessionInfo = {
						isResumed: sessionResult.isResumed,
						sessionId: sessionManager.getSession().session_id
					};

					if (sessionResult.isResumed) {
						this.restoreLoaderCachesFromSession(sessionManager.getAllContext());
					}

					// Step 3: Load command and resolve provider
					const resolvedCommand = await this.commandResolver.resolveCommand(commandName, options);
					sessionManager.setCurrentCommand(commandName);
					await this.sessionLifecycle.persist(true);

					// Step 3.5: Apply stash protection if enabled for this command
					stashProtection = await this.setupStashProtection(resolvedCommand.command, options);

					// Step 4: Display command start and execute
					this.resultPresenter.displayCommandStart(commandName, resolvedCommand.command.description);
					const executionResult = await this.executionCoordinator.executeCommand(
						commandName,
						resolvedCommand,
						options,
						sessionManager,
						sessionInfo
					);

					const { result, sessionManager: finalSessionManager, startTime: execStartTime } = executionResult;
					const duration = Date.now() - execStartTime;

					// Step 5: Calculate tokens and update session
					const tokenBreakdown = this.calculateTokenUsage(result);
					const totalSessionTokens = this.sessionManager.addTokenUsage(tokenBreakdown.total);
					this.updateSessionState(commandName, options, result, duration, tokenBreakdown, finalSessionManager);

					// Step 5.5: Restore stashed changes if stash protection was used
					await this.restoreStashProtection(stashProtection);

					// Step 6: Handle result (success or failure)
					if (result.success) {
						const isDryRun = options.flags['dryRun'] === true || options.flags['dry-run'] === true;
						const taskIdFlag = options.flags['taskId'] ?? options.flags['task-id'];
						const taskId = typeof taskIdFlag === 'string' ? taskIdFlag : undefined;
						const documentOptions = { ...(options.documentOutput ?? { enabled: true }), taskId };

						return await this.handleSuccessfulResult({
							commandName,
							documentOptions,
							duration,
							isDryRun,
							resolvedCommand,
							result,
							sessionManager: finalSessionManager,
							tokenBreakdown,
							totalSessionTokens
						});
					}

					await this.handleFailedResult(
						commandName,
						result,
						duration,
						finalSessionManager.getSession().session_id,
						tokenBreakdown,
						totalSessionTokens
					);
					return result;
				} catch (error) {
					// Ensure stash is restored even on error
					await this.restoreStashOnError(stashProtection);

					const errorContext: ErrorHandlingContext = {
						commandName,
						duration: Date.now() - startTime,
						sessionId: undefined,
						sessionLifecycle: this.sessionLifecycle
					};

					await this.errorHandler.handleExecutionError(error as Error, errorContext);
					throw error;
				}
			},
			{ command: commandName }
		);
	}

	/**
	 * Setup stash protection if enabled for this command
	 */
	private async setupStashProtection(
		command: { stash_protection?: boolean },
		options: CommandExecutionOptions
	): Promise<GitStashProtectionService | undefined> {
		const noStash = options.flags['no-stash'] === true || options.flags['noStash'] === true;
		if (!command.stash_protection || noStash) {
			return undefined;
		}

		// Create confirm function using the prompt adapter (presentation layer responsibility)
		const confirmFn = async (message: string): Promise<boolean> => {
			const prompt = getPromptAdapter();
			const answers = await prompt.prompt<{ shouldStash: boolean }>([
				{
					default: true,
					message,
					name: 'shouldStash',
					type: 'confirm'
				}
			]);
			return answers.shouldStash;
		};

		const stashProtection = createGitStashProtection(confirmFn);
		const stashResult = await stashProtection.promptAndStash(options.interactive !== false);
		if (stashResult.stashCreated) {
			this.logger.info(`Git changes stashed: ${stashResult.stashName}`);
		}
		return stashProtection;
	}

	/**
	 * Restore stashed changes after successful execution
	 */
	private async restoreStashProtection(stashProtection: GitStashProtectionService | undefined): Promise<void> {
		if (!stashProtection?.hasActiveStash()) {
			return;
		}

		const unstashResult = await stashProtection.restoreStash();
		if (unstashResult.restored) {
			this.logger.info('Git changes restored from stash');
		} else if (unstashResult.error) {
			this.logger.warn(`Failed to restore stash: ${unstashResult.error}`);
		}
	}

	/**
	 * Restore stashed changes on error (with error handling)
	 */
	private async restoreStashOnError(stashProtection: GitStashProtectionService | undefined): Promise<void> {
		if (!stashProtection?.hasActiveStash()) {
			return;
		}

		try {
			const unstashResult = await stashProtection.restoreStash();
			if (unstashResult.restored) {
				this.logger.info('Git changes restored from stash after error');
			} else if (unstashResult.error) {
				this.logger.warn(`Failed to restore stash after error: ${unstashResult.error}`);
			}
		} catch (stashError) {
			this.logger.error('Critical: Failed to restore stash', stashError as Error);
		}
	}

	/**
	 * Calculate detailed token usage breakdown from command result
	 */
	private calculateTokenUsage(result: CommandResult): {
		context: number;
		generation: number;
		total: number;
	} {
		// Use reduce to accumulate token usage from all stages
		const tokenUsage = result.stages.reduce(
			(acc, stage) => {
				const usageValue = stage.outputs?.['usage'];
				if (usageValue && isTokenUsage(usageValue)) {
					return {
						context: acc.context + (usageValue.prompt_tokens ?? 0),
						generation: acc.generation + (usageValue.completion_tokens ?? 0),
						total: acc.total + (usageValue.total_tokens ?? 0)
					};
				}
				return acc;
			},
			{ context: 0, generation: 0, total: 0 }
		);

		return tokenUsage;
	}

	/**
	 * List available commands
	 */
	async listCommands(): Promise<string[]> {
		return this.commandLoader.listCommands();
	}

	/**
	 * Validate command prerequisites (command existence and file arguments)
	 */
	private validatePrerequisites(commandName: string, options: CommandExecutionOptions): void {
		const validation = this.commandValidator.validateCommand(commandName);
		if (!validation.isValid && validation.error) {
			throw validation.error;
		}

		const fileValidation = this.commandValidator.validateFileArguments(commandName, options.flags, options.args);
		if (!fileValidation.isValid && fileValidation.error) {
			throw fileValidation.error;
		}
	}

	/**
	 * Handle successful command result (display and document processing)
	 */
	private async handleSuccessfulResult(ctx: SuccessHandlingContext): Promise<CommandResult> {
		this.resultPresenter.displaySuccess(
			ctx.commandName,
			ctx.result.outputs,
			ctx.duration,
			ctx.sessionManager.getSession().session_id,
			ctx.resolvedCommand.command.agent,
			ctx.resolvedCommand.command.model,
			ctx.tokenBreakdown,
			ctx.totalSessionTokens
		);

		if (ctx.isDryRun) {
			await this.sessionLifecycle.complete();
			return ctx.result;
		}

		return this.processDocumentOutput(ctx);
	}

	/**
	 * Process document output and update session lifecycle
	 */
	private async processDocumentOutput(ctx: SuccessHandlingContext): Promise<CommandResult> {
		const documentResult = await this.documentOutputProcessor.process(
			ctx.commandName,
			ctx.result.outputs,
			ctx.documentOptions
		);

		if (!documentResult.documentCreated && !documentResult.skipped) {
			const failedResult = {
				...ctx.result,
				error: documentResult.reason ?? 'Document was not created',
				success: false
			};
			await this.sessionLifecycle.fail(failedResult.error);
			return failedResult;
		}

		await this.sessionLifecycle.complete();
		return ctx.result;
	}

	/**
	 * Handle failed command result (display and lifecycle)
	 */
	private async handleFailedResult(
		commandName: string,
		result: CommandResult,
		duration: number,
		sessionId: string,
		tokenBreakdown: TokenBreakdown,
		totalSessionTokens: number
	): Promise<void> {
		this.resultPresenter.displayFailure(
			commandName,
			result.error,
			duration,
			sessionId,
			tokenBreakdown,
			totalSessionTokens
		);
		await this.sessionLifecycle.fail(result.error);
	}

	/**
	 * Update session state after execution (history, context, caches)
	 */
	private updateSessionState(
		commandName: string,
		options: CommandExecutionOptions,
		result: CommandResult,
		duration: number,
		tokenBreakdown: TokenBreakdown,
		sessionManager: Awaited<ReturnType<CLISessionManager['getOrCreateSession']>>
	): void {
		// Extract optimization and quality metrics from outputs
		const optimizationMetrics = result.outputs['optimization_metrics'] as OptimizationMetrics | undefined;
		const qualityMetrics = result.outputs['quality_metrics'] as QualityMetrics | undefined;

		sessionManager.addCommand(
			commandName,
			options.args,
			options.flags,
			result.outputs,
			result.success,
			duration,
			result.error,
			tokenBreakdown.total,
			optimizationMetrics,
			qualityMetrics
		);

		sessionManager.mergeContext(result.outputs);
		this.saveLoaderCachesToSession(sessionManager);
		this.saveStageOutputsToSession(sessionManager, result);
		this.sessionLifecycle.persist();
	}

	/**
	 * Save loaded prompts and agents to session context for faster resume
	 * Called after successful command execution
	 */
	private saveLoaderCachesToSession(
		sessionManager: ReturnType<typeof this.sessionManager.getOrCreateSession> extends Promise<infer T> ? T : never
	): void {
		// Export agent cache for session storage
		const cachedAgents = this.agentLoader.exportCache();

		// Only store if there's data to cache
		if (Object.keys(cachedAgents).length > 0) {
			sessionManager.updateContext('_loaderCache', {
				agents: cachedAgents,
				savedAt: Date.now()
			});
			this.logger.debug('Saved loader caches to session', {
				agentCount: Object.keys(cachedAgents).length
			});
		}
	}

	/**
	 * Restore cached prompts and agents from session context
	 * Called when resuming a session with --session-id
	 */
	private restoreLoaderCachesFromSession(sessionContext: Record<string, unknown>): void {
		const loaderCache = sessionContext['_loaderCache'] as
			| undefined
			| {
					agents?: Record<string, { content: string; decision_making?: { escalation_criteria?: string[] } }>;
					prompts?: Record<string, { content: string; id: string }>;
					savedAt?: number;
			  };

		if (!loaderCache) {
			return;
		}

		// Check if cache is still fresh (within 5 minutes)
		const cacheAge = Date.now() - (loaderCache.savedAt ?? 0);
		const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

		if (cacheAge > CACHE_TTL_MS) {
			this.logger.debug('Session loader cache expired, skipping restore', { cacheAgeMs: cacheAge });
			return;
		}

		// Restore cached agents
		if (loaderCache.agents) {
			for (const [role, agentData] of Object.entries(loaderCache.agents)) {
				this.agentLoader.injectCachedAgent(role, agentData);
			}
			this.logger.debug('Restored cached agents from session', {
				count: Object.keys(loaderCache.agents).length
			});
		}

		// Note: PromptLoader injection requires full PromptDefinition, not implemented yet
		// This is a future enhancement opportunity
	}

	/**
	 * Save stage outputs to session context for reuse in subsequent commands
	 * Allows commands in the same session to reference previous stage outputs
	 */
	private saveStageOutputsToSession(
		sessionManager: ReturnType<typeof this.sessionManager.getOrCreateSession> extends Promise<infer T> ? T : never,
		result: CommandResult
	): void {
		// Extract stage outputs from the command result
		const stageOutputs: Record<string, Record<string, unknown>> = {};

		for (const stage of result.stages) {
			if (stage.success && stage.outputs) {
				// Use stage.prompt as the key since it's unique within a command
				const stageKey = `${stage.stage}_${stage.prompt}`;
				stageOutputs[stageKey] = stage.outputs;
			}
		}

		// Merge with existing stage outputs in session
		const existingOutputs = sessionManager.getContext('_stageOutputs') as
			| Record<string, Record<string, unknown>>
			| undefined;
		const mergedOutputs = {
			...existingOutputs,
			...stageOutputs
		};

		sessionManager.updateContext('_stageOutputs', mergedOutputs);
		this.logger.debug('Saved stage outputs to session', {
			newStageCount: Object.keys(stageOutputs).length,
			totalStageCount: Object.keys(mergedOutputs).length
		});
	}
}
