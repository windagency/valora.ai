/**
 * Stage Executor - Handles execution of individual pipeline stages
 *
 * MAINT-002: Large Files Need Splitting - Extracted from pipeline.ts
 */

import { isEligible } from 'batch/batch-eligibility';
import { getBatchOrchestrator } from 'batch/batch-orchestrator';
import { isBatchableProvider } from 'batch/batch-provider.interface';
import { createHash } from 'crypto';
import { existsSync } from 'fs';

import type { AgentDefinition } from 'types/agent.types';
import type { PipelineStage, StageOutput } from 'types/command.types';
import type { EscalationContext, EscalationSignal } from 'types/escalation.types';
import type {
	LLMCompletionOptions,
	LLMCompletionResult,
	LLMMessage,
	LLMToolCall,
	LLMToolDefinition,
	LLMToolResult
} from 'types/llm.types';
import type { PromptDefinition } from 'types/prompt.types';

import { DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE } from 'config/constants';
import { ProviderName } from 'config/providers.config';
import { MCPApprovalCacheService } from 'mcp/mcp-approval-cache.service';
import { MCPApprovalWorkflow } from 'mcp/mcp-approval-workflow';
import { MCPAuditLoggerService } from 'mcp/mcp-audit-logger.service';
import { MCPAvailabilityService } from 'mcp/mcp-availability.service';
import { MCPClientManagerService } from 'mcp/mcp-client-manager.service';
import { getMCPToolHandler, type MCPToolHandler } from 'mcp/mcp-tool-handler';
import { getLogger } from 'output/logger';
import { ResolutionPath } from 'types/provider.types';
import { formatErrorMessage } from 'utils/error-utils';
import { readFile } from 'utils/file-utils';
import { getMetricsCollector } from 'utils/metrics-collector';

import type { AgentLoader } from './agent-loader';
import type { ExecutionContext } from './execution-context';
import type { PromptLoader } from './prompt-loader';

import { type EscalationDetectionService, getEscalationDetectionService } from './escalation-detection.service';
import { type EscalationHandlerService, getEscalationHandlerService } from './escalation-handler.service';
import { getMessageBuilderService, type MessageBuilderService } from './message-builder.service';
import { getOutputParsingService, type OutputParsingService } from './output-parsing.service';
import { getPipelineEmitter, type PipelineEventEmitter } from './pipeline-events';
import { loadAvailableAgents, loadProjectGuidance, loadProjectKnowledge } from './project-guidance-loader';
import { getStageOutputCache, type StageOutputCache } from './stage-output-cache';
import { getStageValidationService, type StageValidationService } from './stage-validation.service';
import { getToolExecutionService, type ToolExecutionService } from './tool-execution.service';

/**
 * If this many tool calls fail within a single stage, the stage is hard-stopped
 * (success: false) rather than allowing the LLM to produce degraded output.
 * Prevents silently broken results from propagating downstream.
 *
 * A "failure" is any tool result whose content starts with "Error:" (see
 * processToolResult). Guidance responses — file-not-found hints, too-large
 * redirects, no-matches-found from rg/grep — do NOT start with "Error:" and
 * are therefore not counted. Only genuine system faults increment this counter.
 *
 * Override per stage via PipelineStage.max_tool_failures.
 */
const MAX_TOOL_FAILURES_BEFORE_HARD_STOP = 5;

export interface PipelineExecutionContext {
	executionContext: ExecutionContext;
}

export interface StageExecutionOptions {
	isParallel?: boolean;
	/** Pre-resolved inputs for this stage (optimization) */
	preResolvedInputs?: Record<string, unknown>;
	worktreeInfo?: WorktreeInfoContext;
}

export interface WorktreeInfoContext {
	branch: string;
	commit: string;
	path: string;
}

/**
 * Context for completion handler methods
 * Consolidates parameters to avoid long parameter lists
 */
interface CompletionHandlerContext {
	completion: LLMCompletionResult;
	duration: number;
	/** Quality summary derived from the tool loop conversation history */
	executionSummary?: ExecutionSummary;
	logger: ReturnType<typeof getLogger>;
	resolvedInputs: Record<string, unknown>;
	stage: PipelineStage;
}

/**
 * Execution quality summary derived from scanning the tool loop conversation history.
 * Used to ground the forced final output prompt in verified facts and to annotate
 * stage output metadata so downstream consumers can detect degraded results.
 */
interface ExecutionSummary {
	/** Number of tool result messages that contained an error */
	toolFailureCount: number;
	/** Files that were successfully written, modified, or deleted by tool calls */
	verifiedModifiedFiles: string[];
	/** Whether the stage hit the iteration ceiling and required a forced output */
	wasLoopExhausted: boolean;
}

export class StageExecutor {
	private escalationDetectionService: EscalationDetectionService;
	private escalationHandlerService: EscalationHandlerService;
	private eventEmitter: PipelineEventEmitter;
	private mcpClientManager: MCPClientManagerService;
	private mcpToolHandler: MCPToolHandler;
	private messageBuilderService: MessageBuilderService;
	private outputParsingService: OutputParsingService;
	private stageOutputCache: StageOutputCache;
	private toolExecutionService: ToolExecutionService;
	private validationService: StageValidationService;

	constructor(
		private promptLoader: PromptLoader,
		private agentLoader: AgentLoader,
		eventEmitter?: PipelineEventEmitter
	) {
		this.eventEmitter = eventEmitter ?? getPipelineEmitter();
		this.validationService = getStageValidationService();
		this.escalationDetectionService = getEscalationDetectionService();
		this.escalationHandlerService = getEscalationHandlerService();
		this.toolExecutionService = getToolExecutionService();
		this.outputParsingService = getOutputParsingService();
		this.messageBuilderService = getMessageBuilderService();
		this.stageOutputCache = getStageOutputCache();

		// Initialize MCP services for external tool calls
		const approvalCache = new MCPApprovalCacheService();
		const auditLogger = new MCPAuditLoggerService();
		this.mcpClientManager = new MCPClientManagerService(approvalCache, auditLogger);
		const availabilityService = new MCPAvailabilityService(this.mcpClientManager);
		const approvalWorkflow = new MCPApprovalWorkflow();
		this.mcpToolHandler = getMCPToolHandler(
			this.mcpClientManager,
			availabilityService,
			approvalCache,
			auditLogger,
			approvalWorkflow
		);

		// Wire up MCP services to tool execution service
		this.toolExecutionService.setMCPClientManager(this.mcpClientManager);
		this.toolExecutionService.setMCPToolHandler(this.mcpToolHandler);
	}

	/**
	 * Reset tool execution state for a new command
	 * Should be called at the start of each command execution
	 */
	resetForNewCommand(): void {
		this.toolExecutionService.resetForNewCommand();
	}

	/**
	 * Flush any pending file writes with user confirmation
	 * Should be called at the end of pipeline execution
	 */
	async flushPendingWrites(): Promise<{ skipped: number; written: number }> {
		return this.toolExecutionService.flushPendingWrites();
	}

	/**
	 * Check if there are pending writes awaiting confirmation
	 */
	hasPendingWrites(): boolean {
		return this.toolExecutionService.hasPendingWrites();
	}

	/**
	 * Execute a single pipeline stage
	 */
	async executeStage(
		stage: PipelineStage,
		context: PipelineExecutionContext,
		stageIndex: number,
		options?: StageExecutionOptions
	): Promise<StageOutput> {
		const logger = getLogger();
		const { executionContext } = context;
		const startTime = Date.now();

		this.logStageStart(logger, stage, stageIndex, options);
		this.emitStageStartEvent(stage, stageIndex, options);

		try {
			// Check cache if caching is enabled for this stage
			if (stage.cache?.enabled) {
				const cachedResult = this.checkStageCache(stage, executionContext, options, logger);
				if (cachedResult) {
					return cachedResult;
				}
			}

			// Batch path — submit to provider batch API if eligible
			const batchResult = await this.tryBatchPath(stage, executionContext, startTime, options);
			if (batchResult) {
				return batchResult;
			}

			const stageResult = await this.performStageExecution(stage, executionContext, startTime, options);

			// Store successful result in cache if caching is enabled
			if (stage.cache?.enabled && stageResult.success) {
				this.storeInCache(stage, executionContext, stageResult, options, logger);
			}

			// Validate stage outputs for early termination conditions
			const validatedResult = this.validateStageResult(stage, stageResult, logger);
			return validatedResult;
		} catch (error) {
			return this.handleStageError(stage, error, startTime, stageIndex);
		}
	}

	/**
	 * Check stage output cache for a cached result
	 */
	private checkStageCache(
		stage: PipelineStage,
		executionContext: ExecutionContext,
		_options: StageExecutionOptions | undefined,
		logger: ReturnType<typeof getLogger>
	): null | StageOutput {
		const stageId = `${stage.stage}.${stage.prompt}`;

		// Resolve inputs for cache key generation
		const variableResolver = executionContext.getVariableResolver();
		const resolvedInputs = stage.inputs ? variableResolver.resolve(stage.inputs) : {};

		// Convert stage cache config to service format
		const cacheConfig = stage.cache
			? {
					cache_key_inputs: stage.cache.cache_key_inputs,
					enabled: stage.cache.enabled,
					file_dependencies: stage.cache.file_dependencies,
					ttl_ms: stage.cache.ttl_ms
				}
			: undefined;

		const cacheResult = this.stageOutputCache.get(stageId, resolvedInputs, cacheConfig);

		if (cacheResult.hit && cacheResult.entry) {
			logger.info(`Stage cache hit: ${stageId}`, {
				cacheAge_ms: Date.now() - cacheResult.entry.createdAt,
				savedTime_ms: cacheResult.savedTime_ms
			});

			// Emit stage complete event with cache info
			this.eventEmitter.emitStageComplete({
				duration: 0,
				stage: stageId,
				success: true
			});

			return {
				duration_ms: 0,
				metadata: {
					cached: true,
					originalDuration_ms: cacheResult.entry.originalDuration_ms,
					savedTime_ms: cacheResult.savedTime_ms,
					stageContext: {
						inputs: resolvedInputs,
						prompt: stage.prompt,
						stage: stage.stage
					}
				},
				outputs: cacheResult.entry.outputs,
				prompt: stage.prompt,
				stage: stage.stage,
				success: true
			};
		}

		if (!cacheResult.hit) {
			logger.debug(`Stage cache miss: ${stageId}`, { reason: cacheResult.reason });
		}

		return null;
	}

	/**
	 * Store stage result in cache
	 */
	private storeInCache(
		stage: PipelineStage,
		executionContext: ExecutionContext,
		result: StageOutput,
		_options: StageExecutionOptions | undefined,
		logger: ReturnType<typeof getLogger>
	): void {
		const stageId = `${stage.stage}.${stage.prompt}`;

		// Resolve inputs for cache key generation
		const variableResolver = executionContext.getVariableResolver();
		const resolvedInputs = stage.inputs ? variableResolver.resolve(stage.inputs) : {};

		// Convert stage cache config to service format
		const cacheConfig = stage.cache
			? {
					cache_key_inputs: stage.cache.cache_key_inputs,
					enabled: stage.cache.enabled,
					file_dependencies: stage.cache.file_dependencies,
					ttl_ms: stage.cache.ttl_ms
				}
			: undefined;

		try {
			this.stageOutputCache.set(stageId, resolvedInputs, result.outputs, result.duration_ms, cacheConfig);
			logger.debug(`Stage output cached: ${stageId}`, { duration_ms: result.duration_ms });
		} catch (error) {
			logger.warn(`Failed to cache stage output: ${stageId}`, { error: (error as Error).message });
		}
	}

	/**
	 * Validate stage result and potentially mark for early termination
	 */
	private validateStageResult(
		stage: PipelineStage,
		result: StageOutput,
		logger: ReturnType<typeof getLogger>
	): StageOutput {
		const stageName = `${stage.stage}.${stage.prompt}`;

		// Only validate specific stages that require validation
		if (!this.validationService.requiresValidation(stageName)) {
			return result;
		}

		// Skip validation if stage already failed
		if (!result.success) {
			return result;
		}

		// Validate the outputs
		const validation = this.validationService.validate(stageName, result.outputs);

		if (!validation.isValid) {
			logger.warn(`Stage validation failed: ${stageName}`, {
				reasons: validation.reasons
			});

			// Display the validation failure summary
			this.validationService.displayValidationFailure(validation);

			// Return modified result with failure and stop signal
			return {
				...result,
				error: validation.reasons.join('; '),
				metadata: {
					...result.metadata,
					stopPipeline: validation.shouldStopPipeline,
					validationFailure: true,
					validationReasons: validation.reasons
				},
				success: false
			};
		}

		return result;
	}

	/**
	 * Log stage start information
	 */
	private logStageStart(
		logger: ReturnType<typeof getLogger>,
		stage: PipelineStage,
		stageIndex: number,
		options?: StageExecutionOptions
	): void {
		const executionMode = options?.isParallel ? 'parallel' : 'sequential';
		const worktreeLabel = options?.worktreeInfo ? ` [worktree: ${options.worktreeInfo.branch}]` : '';
		logger.debug(`Executing stage: ${stage.stage}.${stage.prompt} (${executionMode})${worktreeLabel}`, {
			executionMode,
			index: stageIndex + 1,
			isParallel: options?.isParallel ?? false,
			totalStages: stageIndex + 1,
			worktree: options?.worktreeInfo?.path
		});
	}

	/**
	 * Emit stage start event
	 */
	private emitStageStartEvent(stage: PipelineStage, stageIndex: number, options?: StageExecutionOptions): void {
		this.eventEmitter.emitStageStart({
			index: stageIndex,
			isParallel: options?.isParallel,
			stage: `${stage.stage}.${stage.prompt}`,
			totalStages: stageIndex + 1,
			worktreeInfo: options?.worktreeInfo
		});
	}

	/**
	 * Perform the actual stage execution
	 */
	private async performStageExecution(
		stage: PipelineStage,
		executionContext: ExecutionContext,
		startTime: number,
		options?: StageExecutionOptions
	): Promise<StageOutput> {
		const logger = getLogger();

		// Load resources and resolve inputs
		const resources = await this.loadStageResources(stage, executionContext);
		const enrichedInputs = await this.resolveStageInputs(stage, executionContext, options, logger);

		// Build messages
		const { systemMessage, userMessage } = this.buildStageMessages(stage, resources, enrichedInputs);

		// Get execution configuration
		const config = this.getExecutionConfig(executionContext);

		// Log tool configuration
		this.logToolConfiguration(stage, config, logger);

		// Set dry-run mode on tool service (tools will be simulated, not executed)
		if (config.isDryRun) {
			this.toolExecutionService.setDryRunMode(true);
			logger.info('Dry-run mode enabled - tools will be simulated');
		}

		// Emit LLM request event
		this.eventEmitter.emitLLMRequest({
			model: config.modelOverride ?? executionContext.model,
			stage: `${stage.stage}.${stage.prompt}`
		});

		// Call LLM with tool loop
		// In dry-run mode, tools are passed to LLM but simulated during execution
		const { completion, summary } = await this.callLLMWithToolLoop(
			executionContext,
			systemMessage,
			userMessage,
			config.modelOverride,
			config.modeOverride,
			config.tools,
			stage,
			logger
		);
		const duration = Date.now() - startTime;

		// Emit LLM response event
		const model = config.modelOverride ?? executionContext.model ?? 'default';
		this.emitLLMResponseEvent(stage, model, duration, completion);

		// Handle completion
		return this.handleStageCompletion(
			completion,
			summary,
			stage,
			executionContext,
			resources.escalationCriteria,
			enrichedInputs,
			duration,
			logger
		);
	}

	/**
	 * Check batch eligibility and delegate to executeBatchStage if eligible.
	 * Returns the batch StageOutput on success, or null to fall through to real-time.
	 */
	private async tryBatchPath(
		stage: PipelineStage,
		executionContext: ExecutionContext,
		startTime: number,
		options?: StageExecutionOptions
	): Promise<null | StageOutput> {
		const logger = getLogger();
		const eligibility = isEligible(stage, executionContext, executionContext.provider);
		if (eligibility.eligible && isBatchableProvider(executionContext.provider)) {
			return this.executeBatchStage(stage, executionContext, startTime, options);
		}
		if (executionContext.flags['batch'] && !eligibility.eligible) {
			logger.warn(`Stage "${stage.stage}" is not batch-eligible: ${eligibility.reason}. Falling back to real-time.`);
		}
		return null;
	}

	/**
	 * Execute a stage via the provider's batch API.
	 * Builds messages exactly as real-time execution does, then submits a single
	 * BatchRequest. Returns immediately with batchPending outputs.
	 */
	private async executeBatchStage(
		stage: PipelineStage,
		executionContext: ExecutionContext,
		startTime: number,
		options?: StageExecutionOptions
	): Promise<StageOutput> {
		const logger = getLogger();

		// Build messages using the same path as real-time execution
		const resources = await this.loadStageResources(stage, executionContext);
		const enrichedInputs = await this.resolveStageInputs(stage, executionContext, options, logger);
		const { systemMessage, userMessage } = this.buildStageMessages(stage, resources, enrichedInputs);
		const config = this.getExecutionConfig(executionContext);

		const messages: LLMMessage[] = [
			{ content: systemMessage, role: 'system' },
			{ content: userMessage, role: 'user' }
		];

		const completionOptions: LLMCompletionOptions = {
			max_tokens: DEFAULT_MAX_TOKENS,
			messages,
			mode: config.modeOverride ?? executionContext.mode,
			model: config.modelOverride ?? executionContext.model
		};

		// Generate content hash for idempotent request ID
		const requestId = createHash('sha256')
			.update(JSON.stringify({ model: completionOptions.model, stage: stage.stage, userMessage }))
			.digest('hex')
			.substring(0, 32);

		const batchRequest = {
			id: requestId,
			metadata: {
				command: executionContext.commandName,
				prompt: stage.prompt,
				stage: stage.stage
			},
			options: completionOptions
		};

		const provider = executionContext.provider;
		if (!isBatchableProvider(provider)) {
			throw new Error(`Provider "${provider.name}" does not support batch (unexpected)`);
		}

		const orchestrator = getBatchOrchestrator();
		const submission = await orchestrator.submit([batchRequest], provider);
		const duration = Date.now() - startTime;

		logger.info(`Batch submitted for stage "${stage.stage}"`, {
			batchId: submission.batchId,
			localId: submission.localId
		});

		return {
			duration_ms: duration,
			metadata: {
				batchId: submission.batchId,
				batchPending: true,
				localId: submission.localId,
				provider: provider.name
			},
			outputs: {
				batchId: submission.batchId,
				batchPending: true,
				localId: submission.localId
			},
			prompt: stage.prompt,
			stage: stage.stage,
			success: true
		};
	}

	/**
	 * Load all resources needed for stage execution
	 */
	private async loadStageResources(
		stage: PipelineStage,
		executionContext: ExecutionContext
	): Promise<{
		agent: AgentDefinition;
		availableAgents: null | string;
		escalationCriteria?: string[];
		projectGuidance: null | string;
		projectKnowledge: null | string;
		prompt: PromptDefinition;
	}> {
		const prompt = await this.promptLoader.loadPrompt(stage.prompt);
		const agent = await this.agentLoader.loadAgent(executionContext.agentRole);
		const projectGuidance = await loadProjectGuidance();
		const projectKnowledge = await loadProjectKnowledge(executionContext.knowledgeFiles ?? []);

		// Filter agents to only load the one matching the current execution context
		// This avoids loading unnecessary agents (e.g., backend agent for a frontend task)
		const promptAgents = prompt.agents ?? [];
		const filteredAgents = promptAgents.includes(executionContext.agentRole)
			? [executionContext.agentRole]
			: promptAgents;
		const availableAgents = await loadAvailableAgents(filteredAgents);

		return {
			agent,
			availableAgents,
			escalationCriteria: agent.decision_making?.escalation_criteria,
			projectGuidance,
			projectKnowledge,
			prompt
		};
	}

	/**
	 * Resolve stage inputs (use pre-resolved if available)
	 */
	private async resolveStageInputs(
		stage: PipelineStage,
		executionContext: ExecutionContext,
		options: StageExecutionOptions | undefined,
		logger: ReturnType<typeof getLogger>
	): Promise<Record<string, unknown>> {
		if (options?.preResolvedInputs) {
			logger.debug(`Using pre-resolved inputs for stage: ${stage.stage}.${stage.prompt}`);
			return options.preResolvedInputs;
		}

		const variableResolutionService = executionContext.getVariableResolver();
		const resolvedInputs = stage.inputs ? variableResolutionService.resolve(stage.inputs) : {};
		return this.enrichInputsWithFileContents(resolvedInputs, logger);
	}

	/**
	 * Build system and user messages for the stage
	 */
	private buildStageMessages(
		stage: PipelineStage,
		resources: {
			agent: AgentDefinition;
			availableAgents: null | string;
			escalationCriteria?: string[];
			projectGuidance: null | string;
			projectKnowledge: null | string;
			prompt: PromptDefinition;
		},
		enrichedInputs: Record<string, unknown>
	): { systemMessage: string; userMessage: string } {
		const systemMessage = this.messageBuilderService.buildSystemMessage({
			agentProfile: resources.agent.content,
			availableAgents: resources.availableAgents,
			escalationCriteria: resources.escalationCriteria,
			expectedOutputs: stage.outputs,
			projectGuidance: resources.projectGuidance,
			projectKnowledge: resources.projectKnowledge,
			promptContent: resources.prompt.content
		});
		const userMessage = this.messageBuilderService.buildUserMessage(enrichedInputs);
		return { systemMessage, userMessage };
	}

	/**
	 * Get execution configuration (model, mode, tools, dry-run)
	 */
	private getExecutionConfig(executionContext: ExecutionContext): {
		isDryRun: boolean;
		modelOverride: string | undefined;
		modeOverride: string | undefined;
		tools: LLMToolDefinition[] | undefined;
	} {
		const modelOverride = executionContext.flags['model'] as string | undefined;
		const modeOverride = executionContext.flags['mode'] as string | undefined;
		const allowedTools = executionContext.allowedTools;
		const tools =
			allowedTools && allowedTools.length > 0 ? this.toolExecutionService.getToolDefinitions(allowedTools) : undefined;
		const isDryRun = executionContext.flags['dryRun'] === true || executionContext.flags['dry-run'] === true;

		return { isDryRun, modelOverride, modeOverride, tools };
	}

	/**
	 * Log tool configuration for diagnostics
	 */
	private logToolConfiguration(
		stage: PipelineStage,
		config: { isDryRun: boolean; tools: LLMToolDefinition[] | undefined },
		logger: ReturnType<typeof getLogger>
	): void {
		logger.info('Stage execution tool configuration', {
			allowedToolsCount: config.tools?.length ?? 0,
			isDryRun: config.isDryRun,
			stage: `${stage.stage}.${stage.prompt}`,
			toolDefinitionsCount: config.tools?.length ?? 0,
			toolNames: config.tools?.map((t) => t.name)
		});
	}

	/**
	 * Handle stage completion (guided, escalation, or normal)
	 */
	private async handleStageCompletion(
		completion: LLMCompletionResult,
		executionSummary: ExecutionSummary,
		stage: PipelineStage,
		executionContext: ExecutionContext,
		escalationCriteria: string[] | undefined,
		enrichedInputs: Record<string, unknown>,
		duration: number,
		logger: ReturnType<typeof getLogger>
	): Promise<StageOutput> {
		const handlerCtx: CompletionHandlerContext = {
			completion,
			duration,
			executionSummary,
			logger,
			resolvedInputs: enrichedInputs,
			stage
		};

		if (completion.guidedCompletion) {
			return this.handleGuidedCompletion(handlerCtx);
		}

		if (escalationCriteria && escalationCriteria.length > 0) {
			const escalationResult = await this.processEscalation(
				completion.content,
				stage,
				executionContext.agentRole,
				escalationCriteria,
				duration,
				enrichedInputs,
				logger
			);
			if (escalationResult) {
				return escalationResult;
			}
		}

		return this.handleNormalCompletion(handlerCtx);
	}

	/**
	 * Call the LLM provider with tool loop
	 *
	 * If tools are provided, this method will:
	 * 1. Send the request to the LLM with tools
	 * 2. Check if the response contains tool_calls
	 * 3. Execute the requested tools
	 * 4. Send tool results back to the LLM
	 * 5. Repeat until the LLM completes without tool calls
	 */
	private async callLLMWithToolLoop(
		executionContext: ExecutionContext,
		systemMessage: string,
		userMessage: string,
		modelOverride: string | undefined,
		modeOverride: string | undefined,
		tools: LLMToolDefinition[] | undefined,
		stage: PipelineStage,
		logger: ReturnType<typeof getLogger>
	): Promise<{ completion: LLMCompletionResult; summary: ExecutionSummary }> {
		const maxToolIterations = stage.max_tool_iterations ?? 20;
		const messages: LLMMessage[] = [
			{ content: systemMessage, role: 'system' },
			{ content: userMessage, role: 'user' }
		];

		for (let iterations = 1; iterations <= maxToolIterations; iterations++) {
			const completion = await this.executeLLMIteration(
				executionContext,
				messages,
				tools,
				modelOverride,
				modeOverride,
				iterations,
				logger
			);

			// No tool calls means we're done
			if (!completion.tool_calls || completion.tool_calls.length === 0) {
				logger.debug('LLM completed without tool calls', { iterations, stage: `${stage.stage}.${stage.prompt}` });
				return {
					completion,
					summary: { toolFailureCount: 0, verifiedModifiedFiles: [], wasLoopExhausted: false }
				};
			}

			// Process tool calls and add to conversation
			await this.processToolCallsInLoop(completion, messages, stage, iterations, logger);
		}

		// Exceeded max iterations
		return this.handleMaxIterationsExceeded(executionContext, messages, stage, modelOverride, modeOverride, logger);
	}

	/**
	 * Execute a single LLM iteration
	 * If the prompt is too long, compresses older tool results and retries once
	 */
	private async executeLLMIteration(
		executionContext: ExecutionContext,
		messages: LLMMessage[],
		tools: LLMToolDefinition[] | undefined,
		modelOverride: string | undefined,
		modeOverride: string | undefined,
		iteration: number,
		logger: ReturnType<typeof getLogger>
	): Promise<LLMCompletionResult> {
		this.logLLMRequest(logger, iteration, tools);

		const completionOptions = this.buildCompletionOptions(
			executionContext,
			messages,
			tools,
			modelOverride,
			modeOverride
		);

		try {
			const completion = await executionContext.provider.complete(completionOptions);
			this.logLLMResponse(logger, completion);
			return completion;
		} catch (error) {
			if (this.isPromptTooLongError(error)) {
				logger.warn('Prompt too long — compressing tool results in message history and retrying', {
					iteration,
					messageCount: messages.length
				});
				const compressedMessages = this.compressToolResults(messages);
				completionOptions.messages = compressedMessages;
				const completion = await executionContext.provider.complete(completionOptions);
				this.logLLMResponse(logger, completion);
				return completion;
			}
			throw error;
		}
	}

	/**
	 * Check whether an error is an LLM "prompt too long" / context-length error
	 */
	private isPromptTooLongError(error: unknown): boolean {
		const message = (error as Error | undefined)?.message ?? '';
		return (
			message.includes('prompt is too long') ||
			message.includes('maximum context length') ||
			message.includes('context_length_exceeded') ||
			message.includes('tokens > ')
		);
	}

	/**
	 * Compress message history by replacing old tool results with a placeholder.
	 * Keeps the system message, first user message, and the most recent 4 messages intact.
	 */
	private compressToolResults(messages: LLMMessage[]): LLMMessage[] {
		const KEEP_RECENT = 4;
		const cutoff = messages.length - KEEP_RECENT;

		return messages.map((msg, i) => {
			if (msg.role === 'tool' && i < cutoff) {
				return { ...msg, content: '[Tool result omitted to reduce context length]' };
			}
			return msg;
		});
	}

	/**
	 * Log LLM request information
	 */
	private logLLMRequest(
		logger: ReturnType<typeof getLogger>,
		iteration: number,
		tools: LLMToolDefinition[] | undefined
	): void {
		logger.info('Calling LLM with tool loop', {
			hasTools: !!tools,
			iteration,
			toolCount: tools?.length ?? 0,
			toolNames: tools?.map((t) => t.name)
		});
	}

	/**
	 * Build LLM completion options
	 */
	private buildCompletionOptions(
		executionContext: ExecutionContext,
		messages: LLMMessage[],
		tools: LLMToolDefinition[] | undefined,
		modelOverride: string | undefined,
		modeOverride: string | undefined
	): LLMCompletionOptions {
		const maxTokensFlag = executionContext.flags['maxTokens'];
		const maxTokens = typeof maxTokensFlag === 'number' ? maxTokensFlag : DEFAULT_MAX_TOKENS;

		return {
			max_tokens: maxTokens,
			messages,
			mode: modeOverride ?? executionContext.mode,
			model: modelOverride ?? executionContext.model,
			temperature: DEFAULT_TEMPERATURE,
			tools
		};
	}

	/**
	 * Log LLM response information
	 */
	private logLLMResponse(logger: ReturnType<typeof getLogger>, completion: LLMCompletionResult): void {
		logger.info('LLM response received', {
			contentLength: completion.content?.length ?? 0,
			finishReason: completion.finish_reason,
			hasToolCalls: !!completion.tool_calls,
			toolCallCount: completion.tool_calls?.length ?? 0
		});
	}

	/**
	 * Process tool calls and add results to conversation
	 */
	private async processToolCallsInLoop(
		completion: LLMCompletionResult,
		messages: LLMMessage[],
		stage: PipelineStage,
		iterations: number,
		logger: ReturnType<typeof getLogger>
	): Promise<void> {
		const toolCalls = completion.tool_calls!;

		logger.info('Processing tool calls from LLM', {
			iterations,
			stage: `${stage.stage}.${stage.prompt}`,
			toolCount: toolCalls.length,
			tools: toolCalls.map((tc) => tc.name)
		});

		// Add assistant message with tool calls
		messages.push({
			content: completion.content || '',
			role: 'assistant',
			tool_calls: toolCalls
		});

		// Execute tools and add results
		const toolResults = await this.toolExecutionService.executeTools(toolCalls);
		toolResults.forEach((result) =>
			messages.push({
				content: this.formatToolResult(result),
				name: result.tool_call_id,
				role: 'tool'
			})
		);

		logger.debug('Tool results added to conversation', { iterations, resultCount: toolResults.length });
	}

	/**
	 * Extract the names of the most recently invoked tools from message history.
	 * Useful for diagnosing what the agent was doing when it hit the iteration limit.
	 */
	private extractLastToolsInvoked(messages: LLMMessage[], limit = 10): string[] {
		const toolNames: string[] = [];
		for (let i = messages.length - 1; i >= 0 && toolNames.length < limit; i--) {
			const msg = messages[i] as LLMMessage | undefined;
			if (msg?.role === 'assistant' && msg.tool_calls) {
				for (const tc of msg.tool_calls) {
					toolNames.push(tc.name);
				}
			}
		}
		return toolNames.reverse();
	}

	/**
	 * Scan the full tool loop conversation history to build an execution summary.
	 *
	 * - Counts tool results that started with "Error:" (these are caught failures
	 *   returned as strings rather than thrown exceptions).
	 * - Collects file paths from successful mutating tool calls (write, search_replace,
	 *   delete_file) so they can be injected into the forced final prompt, grounding
	 *   the LLM's summary in verified state rather than memory.
	 */
	private extractExecutionSummary(messages: LLMMessage[]): Omit<ExecutionSummary, 'wasLoopExhausted'> {
		const mutatingTools = new Set(['delete_file', 'search_replace', 'write']);
		const pendingFiles = new Map<string, string>(); // tool_call_id → path
		let toolFailureCount = 0;
		const verifiedModifiedFiles: string[] = [];

		for (const msg of messages) {
			if (msg.role === 'assistant' && msg.tool_calls) {
				this.registerMutatingToolCalls(msg.tool_calls, mutatingTools, pendingFiles);
			} else if (msg.role === 'tool') {
				toolFailureCount += this.processToolResult(msg, pendingFiles, verifiedModifiedFiles);
			}
		}

		return { toolFailureCount, verifiedModifiedFiles };
	}

	/**
	 * Register file paths for mutating tool calls so results can be verified later.
	 */
	private registerMutatingToolCalls(
		toolCalls: LLMToolCall[],
		mutatingTools: Set<string>,
		pendingFiles: Map<string, string>
	): void {
		for (const tc of toolCalls) {
			if (mutatingTools.has(tc.name)) {
				const path = typeof tc.arguments['path'] === 'string' ? tc.arguments['path'] : undefined;
				if (path) pendingFiles.set(tc.id, path);
			}
		}
	}

	/**
	 * Process a tool result message: count failures and track verified file writes.
	 * Returns 1 if this result is a failure, 0 otherwise.
	 *
	 * A failure is defined as a tool result whose content starts with "Error:".
	 * Plain-string guidance responses (file-not-found hints, too-large redirects,
	 * no-matches, missing-argument messages, etc.) do not start with "Error:" and
	 * are not counted as failures. See ToolExecutionService for the full policy.
	 */
	private processToolResult(
		msg: LLMMessage,
		pendingFiles: Map<string, string>,
		verifiedModifiedFiles: string[]
	): number {
		if (msg.content.startsWith('Error:')) {
			if (msg.name) pendingFiles.delete(msg.name);
			return 1;
		}
		if (msg.name) {
			const path = pendingFiles.get(msg.name);
			if (path && !verifiedModifiedFiles.includes(path)) {
				verifiedModifiedFiles.push(path);
			}
			pendingFiles.delete(msg.name);
		}
		return 0;
	}

	/**
	 * Handle case when tool loop exceeds max iterations.
	 * Records a metrics counter, emits a TOOL_LOOP_EXHAUSTED pipeline event,
	 * and falls back to a forced final output that is grounded in verified
	 * execution state (actual file changes + failure count) rather than LLM memory.
	 */
	private async handleMaxIterationsExceeded(
		executionContext: ExecutionContext,
		messages: LLMMessage[],
		stage: PipelineStage,
		modelOverride: string | undefined,
		modeOverride: string | undefined,
		logger: ReturnType<typeof getLogger>
	): Promise<{ completion: LLMCompletionResult; summary: ExecutionSummary }> {
		const stageId = `${stage.stage}.${stage.prompt}`;
		const { toolFailureCount, verifiedModifiedFiles } = this.extractExecutionSummary(messages);
		const lastToolsInvoked = this.extractLastToolsInvoked(messages);
		const messageDepth = messages.length;

		const maxIterations = stage.max_tool_iterations ?? 20;

		logger.warn('Tool loop exceeded maximum iterations', {
			lastToolsInvoked,
			maxIterations,
			messageDepth,
			stage: stageId,
			toolFailureCount,
			verifiedModifiedFiles
		});

		// Record metric — visible in dashboard Performance tab and MetricsSummary
		getMetricsCollector().incrementCounter('tool_loop_exhausted', 1, { stage: stageId });

		// Emit typed event for real-time observers
		getPipelineEmitter().emitToolLoopExhausted({
			iterationsUsed: maxIterations,
			lastToolsInvoked,
			messageDepth,
			stage: stageId
		});

		const summary: ExecutionSummary = { toolFailureCount, verifiedModifiedFiles, wasLoopExhausted: true };
		const completion = await this.requestFinalOutput(
			executionContext,
			messages,
			stage,
			modelOverride,
			modeOverride,
			summary,
			logger
		);
		return { completion, summary };
	}

	/**
	 * Request final structured output when tool loop is exhausted.
	 * Injects verified execution facts (files actually written, failure count)
	 * so the LLM summarises real state rather than relying on memory.
	 */
	private async requestFinalOutput(
		executionContext: ExecutionContext,
		messages: LLMMessage[],
		stage: PipelineStage,
		modelOverride: string | undefined,
		modeOverride: string | undefined,
		summary: ExecutionSummary,
		logger: ReturnType<typeof getLogger>
	): Promise<LLMCompletionResult> {
		logger.warn('Requesting final structured output (tool loop exhausted)', {
			stage: `${stage.stage}.${stage.prompt}`
		});

		// Inject verified execution facts so the LLM does not have to rely on memory
		const verifiedFilesSection =
			summary.verifiedModifiedFiles.length > 0
				? `\n\n**VERIFIED files your tools actually wrote/modified (confirmed from tool results):**\n${summary.verifiedModifiedFiles.map((f) => `- ${f}`).join('\n')}\nUse this list for "files_modified" — do NOT invent additional files.`
				: '\n\n**No file writes were confirmed successful.** Set "files_modified" to [].';

		const failureSection =
			summary.toolFailureCount > 0
				? `\n\n**WARNING: ${summary.toolFailureCount} tool call(s) failed during execution.** You MUST include a note about these failures in "implementation_notes.decisions".`
				: '';

		// Add a user message prompting for final output
		const finalPromptMessage: LLMMessage = {
			content: `STOP. Tool execution limit reached. You MUST now output your final response.${verifiedFilesSection}${failureSection}

**CRITICAL INSTRUCTION**: Your response must be ONLY a JSON code block. No other text before or after.

Required format (exactly this structure):
\`\`\`json
{
  "code_changes": {
    "files_created": [...],
    "files_modified": [...],
    "files_deleted": []
  },
  "files_modified": ["list", "of", "file", "paths"],
  "implementation_notes": {
    "approach": "description of what was done",
    "decisions": ["key decisions made"]
  },
  "breaking_changes": []
}
\`\`\`

Summarize ALL changes you made during tool execution. Output ONLY the JSON code block above. DO NOT include any explanatory text, greetings, or commentary. Start your response with \`\`\`json`,
			role: 'user'
		};

		const finalMessages = [...messages, finalPromptMessage];

		// Call LLM WITHOUT tools to force text response
		const completion = await executionContext.provider.complete({
			max_tokens:
				typeof executionContext.flags['maxTokens'] === 'number'
					? executionContext.flags['maxTokens']
					: DEFAULT_MAX_TOKENS,
			messages: finalMessages,
			mode: modeOverride ?? executionContext.mode,
			model: modelOverride ?? executionContext.model,
			temperature: DEFAULT_TEMPERATURE
			// No tools - force text completion
		});

		logger.warn('Received final output after tool loop exhaustion', {
			contentLength: completion.content?.length ?? 0,
			hasToolCalls: !!completion.tool_calls,
			stage: `${stage.stage}.${stage.prompt}`
		});

		return completion;
	}

	/**
	 * Format a tool result for the conversation
	 * Truncates large results to prevent exceeding LLM context limits
	 */
	private formatToolResult(result: LLMToolResult): string {
		const output = result.output;
		const MAX_TOOL_RESULT_CHARS = 20_000;
		const HEAD_CHARS = 15_000;
		const TAIL_CHARS = 5_000;

		if (output.length > MAX_TOOL_RESULT_CHARS) {
			const logger = getLogger();
			logger.warn('Tool result truncated due to length', {
				originalLength: output.length,
				toolCallId: result.tool_call_id,
				truncatedLength: MAX_TOOL_RESULT_CHARS
			});
			const omitted = output.length - HEAD_CHARS - TAIL_CHARS;
			return (
				output.substring(0, HEAD_CHARS) +
				`\n\n[... ${omitted} characters omitted ...]\n\n` +
				output.substring(output.length - TAIL_CHARS)
			);
		}

		return output;
	}

	/**
	 * Emit LLM response event
	 */
	private emitLLMResponseEvent(
		stage: PipelineStage,
		model: string,
		duration: number,
		completion: { usage?: { completion_tokens?: number; prompt_tokens?: number } }
	): void {
		this.eventEmitter.emitLLMResponse({
			duration,
			model,
			outputTokens: completion.usage?.completion_tokens,
			promptTokens: completion.usage?.prompt_tokens,
			stage: `${stage.stage}.${stage.prompt}`,
			tokenCount: completion.usage?.completion_tokens
		});
	}

	/**
	 * Handle guided completion result
	 */
	private handleGuidedCompletion(ctx: CompletionHandlerContext): StageOutput {
		const { completion, duration, logger, resolvedInputs, stage } = ctx;
		logger.always(`Guided completion mode activated for stage: ${stage.stage}.${stage.prompt}`, {
			mode: ResolutionPath.GUIDED,
			useCursorSubscription: true
		});

		return {
			duration_ms: duration,
			metadata: {
				guidedMode: true,
				provider: ProviderName.CURSOR,
				resolutionPath: ResolutionPath.GUIDED,
				stageContext: {
					inputs: resolvedInputs,
					prompt: stage.prompt,
					stage: stage.stage
				},
				stopPipeline: true
			},
			outputs: {
				guidedCompletion: completion.guidedCompletion,
				result: completion.content,
				success: true
			},
			prompt: stage.prompt,
			stage: stage.stage,
			success: true
		};
	}

	/**
	 * Handle normal completion result
	 */
	private handleNormalCompletion(ctx: CompletionHandlerContext): StageOutput {
		const { completion, duration, executionSummary, logger, resolvedInputs, stage } = ctx;
		const isDegraded =
			executionSummary !== undefined && (executionSummary.wasLoopExhausted || executionSummary.toolFailureCount > 0);

		// Hard-stop: too many tool failures means the output cannot be trusted
		const maxToolFailures = stage.max_tool_failures ?? MAX_TOOL_FAILURES_BEFORE_HARD_STOP;
		if (executionSummary !== undefined && executionSummary.toolFailureCount >= maxToolFailures) {
			const errorMsg =
				`Stage hard-stopped: ${executionSummary.toolFailureCount} tool failures exceeded ` +
				`the threshold of ${maxToolFailures} (stage: ${stage.stage}.${stage.prompt})`;
			logger.error(errorMsg, new Error(errorMsg));
			this.eventEmitter.emitStageError(`${stage.stage}.${stage.prompt}`, errorMsg);
			return {
				duration_ms: duration,
				error: errorMsg,
				metadata: {
					executionQuality: {
						degraded: true,
						hardStopped: true,
						toolFailureCount: executionSummary.toolFailureCount,
						verifiedModifiedFiles: executionSummary.verifiedModifiedFiles,
						wasLoopExhausted: executionSummary.wasLoopExhausted
					},
					stageContext: { inputs: resolvedInputs, prompt: stage.prompt, stage: stage.stage }
				},
				outputs: {},
				prompt: stage.prompt,
				stage: stage.stage,
				success: false
			};
		}

		if (isDegraded) {
			logger.warn(`Stage completed in degraded state: ${stage.stage}.${stage.prompt}`, {
				toolFailureCount: executionSummary!.toolFailureCount,
				verifiedModifiedFiles: executionSummary!.verifiedModifiedFiles,
				wasLoopExhausted: executionSummary!.wasLoopExhausted
			});
		} else {
			logger.debug(`Stage completed: ${stage.stage}.${stage.prompt}`, {
				duration_ms: duration,
				outputTokens: completion.usage?.completion_tokens
			});
		}

		const outputDefs = stage.outputs ?? [];
		const parsedOutputs = this.outputParsingService.parseStageOutputs(completion.content, outputDefs);

		// Provide default values for missing expected outputs to prevent pipeline failures
		const outputsWithDefaults = this.outputParsingService.applyDefaultValues(parsedOutputs, outputDefs);

		this.eventEmitter.emitStageComplete({
			duration,
			stage: `${stage.stage}.${stage.prompt}`,
			success: true
		});

		return {
			duration_ms: duration,
			metadata: {
				...(executionSummary !== undefined && {
					executionQuality: {
						degraded: isDegraded,
						toolFailureCount: executionSummary.toolFailureCount,
						verifiedModifiedFiles: executionSummary.verifiedModifiedFiles,
						wasLoopExhausted: executionSummary.wasLoopExhausted
					}
				}),
				stageContext: {
					inputs: resolvedInputs,
					prompt: stage.prompt,
					stage: stage.stage
				}
			},
			outputs: {
				...outputsWithDefaults,
				result: completion.content,
				usage: completion.usage
			},
			prompt: stage.prompt,
			stage: stage.stage,
			success: true
		};
	}

	/**
	 * Handle stage execution error
	 */
	private handleStageError(stage: PipelineStage, error: unknown, startTime: number, stageIndex: number): StageOutput {
		const logger = getLogger();
		const duration = Date.now() - startTime;

		logger.error(`Stage failed: ${stage.stage}.${stage.prompt}`, error as Error, {
			duration_ms: duration,
			stageIndex
		});

		this.eventEmitter.emitStageError(`${stage.stage}.${stage.prompt}`, (error as Error).message);

		return {
			duration_ms: duration,
			error: formatErrorMessage(error),
			metadata: {
				stageContext: {
					prompt: stage.prompt,
					stage: stage.stage
				}
			},
			outputs: {},
			prompt: stage.prompt,
			stage: stage.stage,
			success: false
		};
	}

	/**
	 * Enrich inputs by reading file contents for file path arguments
	 * This allows the LLM to receive actual file contents instead of just paths
	 */
	private async enrichInputsWithFileContents(
		inputs: Record<string, unknown>,
		logger: ReturnType<typeof getLogger>
	): Promise<Record<string, unknown>> {
		const enriched: Record<string, unknown> = {};

		for (const [key, value] of Object.entries(inputs)) {
			// Check if this is a file path argument (ends with _file, _file_arg, or _path)
			const isFileArg = key.endsWith('_file') || key.endsWith('_file_arg') || key.endsWith('_path');

			if (isFileArg && typeof value === 'string' && value.trim()) {
				const filePath = value.trim();

				// Check if file exists
				if (existsSync(filePath)) {
					try {
						const content = await readFile(filePath);
						logger.debug(`Read file content for ${key}: ${filePath} (${content.length} chars)`);

						// Include both the path and the content
						enriched[key] = filePath;
						enriched[`${key}_content`] = content;
					} catch (error) {
						logger.warn(`Failed to read file for ${key}: ${filePath}`, { error: (error as Error).message });
						enriched[key] = value;
					}
				} else {
					logger.warn(`File not found for ${key}: ${filePath}`);
					enriched[key] = value;
				}
			} else {
				enriched[key] = value;
			}
		}

		return enriched;
	}
	// Output parsing methods extracted to OutputParsingService (see output-parsing.service.ts)
	/**
	 * Process escalation for a stage response
	 * Returns StageOutput if escalation results in abort or needs to stop pipeline
	 * Returns null if escalation is handled and execution should continue normally
	 */
	private async processEscalation(
		responseContent: string,
		stage: PipelineStage,
		agentRole: string,
		escalationCriteria: string[],
		duration: number,
		resolvedInputs: Record<string, unknown>,
		logger: ReturnType<typeof getLogger>
	): Promise<null | StageOutput> {
		const stageName = `${stage.stage}.${stage.prompt}`;

		// Parse response for escalation signal
		const parseResult = this.escalationDetectionService.parseResponse(responseContent);
		const { signal } = parseResult;

		// Check if escalation should be triggered
		if (!this.escalationDetectionService.shouldTriggerEscalation(signal)) {
			logger.debug('No escalation triggered for stage', { stageName });
			return null;
		}

		// Emit escalation triggered event
		this.emitEscalationTriggeredEvent(agentRole, stageName, signal);

		// Build escalation context and handle escalation
		const context: EscalationContext = {
			agentRole,
			escalationCriteria,
			llmResponse: responseContent,
			signal: signal!,
			stageName
		};

		const result = await this.escalationHandlerService.handleEscalation(context);
		this.escalationHandlerService.displayEscalationSummary(context, result);

		// Process escalation result
		return this.handleEscalationResultActions(result, stage, stageName, duration, resolvedInputs, signal!, logger);
	}

	/**
	 * Emit escalation triggered event with signal info
	 */
	private emitEscalationTriggeredEvent(
		agentRole: string,
		stageName: string,
		signal: EscalationSignal | null | undefined
	): void {
		this.eventEmitter.emitEscalationTriggered({
			agentRole,
			confidence: signal?.confidence ?? 0,
			riskLevel: signal?.risk_level ?? 'medium',
			stage: stageName,
			triggeredCriteria: signal?.triggered_criteria ?? []
		});
	}

	/**
	 * Handle escalation result actions (abort, proceed, modify)
	 */
	private handleEscalationResultActions(
		result: Awaited<ReturnType<EscalationHandlerService['handleEscalation']>>,
		stage: PipelineStage,
		stageName: string,
		duration: number,
		resolvedInputs: Record<string, unknown>,
		signal: EscalationSignal,
		logger: ReturnType<typeof getLogger>
	): null | StageOutput {
		if (result.shouldAbort) {
			this.eventEmitter.emitEscalationAborted({
				reason: 'User aborted after escalation review',
				stage: stageName
			});
			return this.handleEscalationAbort(stage, duration, resolvedInputs, signal);
		}

		this.eventEmitter.emitEscalationResolved({
			decision: result.decision.decision,
			guidance: result.modifiedGuidance,
			stage: stageName
		});

		if (result.shouldProceed) {
			logger.debug('Escalation handled: proceeding with execution', { stageName });
			return null;
		}

		if (result.modifiedGuidance) {
			logger.info('Escalation handled: modification requested', {
				guidance: result.modifiedGuidance,
				stageName
			});
		}

		return null;
	}

	/**
	 * Handle escalation abort by returning a failed StageOutput
	 */
	private handleEscalationAbort(
		stage: PipelineStage,
		duration: number,
		resolvedInputs: Record<string, unknown>,
		signal: EscalationSignal
	): StageOutput {
		return {
			duration_ms: duration,
			error: `Escalation aborted by user: ${signal.reasoning}`,
			metadata: {
				escalation: {
					aborted: true,
					confidence: signal.confidence,
					riskLevel: signal.risk_level,
					triggeredCriteria: signal.triggered_criteria
				},
				stageContext: {
					inputs: resolvedInputs,
					prompt: stage.prompt,
					stage: stage.stage
				},
				stopPipeline: true
			},
			outputs: {},
			prompt: stage.prompt,
			stage: stage.stage,
			success: false
		};
	}
}
