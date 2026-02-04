/**
 * Stage Executor - Handles execution of individual pipeline stages
 *
 * MAINT-002: Large Files Need Splitting - Extracted from pipeline.ts
 */

import type { AgentDefinition } from 'types/agent.types';
import type { PipelineStage, StageOutput } from 'types/command.types';
import type { EscalationContext, EscalationSignal } from 'types/escalation.types';
import type {
	LLMCompletionOptions,
	LLMCompletionResult,
	LLMMessage,
	LLMToolDefinition,
	LLMToolResult
} from 'types/llm.types';
import type { PromptDefinition } from 'types/prompt.types';

import { DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE } from 'config/constants';
import { ProviderName } from 'config/providers.config';
import { existsSync } from 'fs';
import { getLogger } from 'output/logger';
import { ResolutionPath } from 'types/provider.types';
import { formatErrorMessage } from 'utils/error-utils';
import { readFile } from 'utils/file-utils';

import type { AgentLoader } from './agent-loader';
import type { ExecutionContext } from './execution-context';
import type { PromptLoader } from './prompt-loader';

import { MCPApprovalCacheService } from 'services/mcp-approval-cache.service';
import { MCPAuditLoggerService } from 'services/mcp-audit-logger.service';
import { MCPAvailabilityService } from 'services/mcp-availability.service';
import { MCPClientManagerService } from 'services/mcp-client-manager.service';

import { MCPApprovalWorkflow } from 'cli/mcp-approval-workflow';

import { type EscalationDetectionService, getEscalationDetectionService } from './escalation-detection.service';
import { type EscalationHandlerService, getEscalationHandlerService } from './escalation-handler.service';
import { getMCPToolHandler, type MCPToolHandler } from './mcp-tool-handler';
import { getMessageBuilderService, type MessageBuilderService } from './message-builder.service';
import { getOutputParsingService, type OutputParsingService } from './output-parsing.service';
import { getPipelineEmitter, type PipelineEventEmitter } from './pipeline-events';
import { loadProjectGuidance, loadProjectKnowledge } from './project-guidance-loader';
import { getStageOutputCache, type StageOutputCache } from './stage-output-cache';
import { getStageValidationService, type StageValidationService } from './stage-validation.service';
import { getToolExecutionService, type ToolExecutionService } from './tool-execution.service';

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
	logger: ReturnType<typeof getLogger>;
	resolvedInputs: Record<string, unknown>;
	stage: PipelineStage;
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
		const completion = await this.callLLMWithToolLoop(
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
			stage,
			executionContext,
			resources.escalationCriteria,
			enrichedInputs,
			duration,
			logger
		);
	}

	/**
	 * Load all resources needed for stage execution
	 */
	private async loadStageResources(
		stage: PipelineStage,
		executionContext: ExecutionContext
	): Promise<{
		agent: AgentDefinition;
		escalationCriteria?: string[];
		projectGuidance: null | string;
		projectKnowledge: null | string;
		prompt: PromptDefinition;
	}> {
		const prompt = await this.promptLoader.loadPrompt(stage.prompt);
		const agent = await this.agentLoader.loadAgent(executionContext.agentRole);
		const projectGuidance = await loadProjectGuidance();
		const projectKnowledge = await loadProjectKnowledge(executionContext.knowledgeFiles ?? []);

		return {
			agent,
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
			escalationCriteria?: string[];
			projectGuidance: null | string;
			projectKnowledge: null | string;
			prompt: PromptDefinition;
		},
		enrichedInputs: Record<string, unknown>
	): { systemMessage: string; userMessage: string } {
		const systemMessage = this.messageBuilderService.buildSystemMessage({
			agentProfile: resources.agent.content,
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
	): Promise<LLMCompletionResult> {
		const maxToolIterations = 20;
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
				return completion;
			}

			// Process tool calls and add to conversation
			await this.processToolCallsInLoop(completion, messages, stage, iterations, logger);
		}

		// Exceeded max iterations
		return this.handleMaxIterationsExceeded(executionContext, messages, stage, modelOverride, modeOverride, logger);
	}

	/**
	 * Execute a single LLM iteration
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
		const completion = await executionContext.provider.complete(completionOptions);

		this.logLLMResponse(logger, completion);
		return completion;
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
	 * Handle case when tool loop exceeds max iterations
	 */
	private async handleMaxIterationsExceeded(
		executionContext: ExecutionContext,
		messages: LLMMessage[],
		stage: PipelineStage,
		modelOverride: string | undefined,
		modeOverride: string | undefined,
		logger: ReturnType<typeof getLogger>
	): Promise<LLMCompletionResult> {
		logger.warn('Tool loop exceeded maximum iterations', {
			maxIterations: 20,
			stage: `${stage.stage}.${stage.prompt}`
		});

		return this.requestFinalOutput(executionContext, messages, stage, modelOverride, modeOverride, logger);
	}

	/**
	 * Request final structured output when tool loop is exhausted
	 * Makes a final LLM call without tools to get the required JSON output
	 */
	private async requestFinalOutput(
		executionContext: ExecutionContext,
		messages: LLMMessage[],
		stage: PipelineStage,
		modelOverride: string | undefined,
		modeOverride: string | undefined,
		logger: ReturnType<typeof getLogger>
	): Promise<LLMCompletionResult> {
		logger.warn('Requesting final structured output (tool loop exhausted)', {
			stage: `${stage.stage}.${stage.prompt}`
		});

		// Add a user message prompting for final output
		const finalPromptMessage: LLMMessage = {
			content: `STOP. Tool execution limit reached. You MUST now output your final response.

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
	 */
	private formatToolResult(result: LLMToolResult): string {
		return result.output;
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
		const { completion, duration, logger, resolvedInputs, stage } = ctx;
		logger.debug(`Stage completed: ${stage.stage}.${stage.prompt}`, {
			duration_ms: duration,
			outputTokens: completion.usage?.completion_tokens
		});

		const parsedOutputs = this.outputParsingService.parseStageOutputs(completion.content, stage.outputs ?? []);

		// Provide default values for missing expected outputs to prevent pipeline failures
		const outputsWithDefaults = this.outputParsingService.applyDefaultValues(parsedOutputs, stage.outputs ?? []);

		this.eventEmitter.emitStageComplete({
			duration,
			stage: `${stage.stage}.${stage.prompt}`,
			success: true
		});

		return {
			duration_ms: duration,
			metadata: {
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
