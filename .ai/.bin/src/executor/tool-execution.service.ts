/**
 * Tool Execution Service
 *
 * Defines and executes file manipulation tools for LLM-driven code generation.
 * These tools allow the LLM to actually create, modify, and delete files.
 *
 * Tools supported:
 * - write: Create or overwrite files
 * - read_file: Read file contents
 * - search_replace: Make targeted edits to files
 * - delete_file: Remove files
 * - run_terminal_cmd: Execute shell commands
 * - list_dir: List directory contents
 * - glob_file_search: Find files by pattern
 * - grep: Search file contents
 * - codebase_search: Semantic code search
 * - query_session: Query previous session data for context reuse
 */

import type { MCPClientManagerService } from 'services/mcp-client-manager.service';
import type { LLMToolCall, LLMToolDefinition, LLMToolResult } from 'types/llm.types';

import { exec } from 'child_process';
import { DEFAULT_TIMEOUT_MS } from 'config/constants';
import { existsSync, readdirSync, rmSync, statSync } from 'fs';
import { getColorAdapter } from 'output/color-adapter.interface';
import { getConsoleOutput } from 'output/console-output';
import { getLogger } from 'output/logger';
import { getIdempotencyStore, type IdempotencyStoreService } from 'services/idempotency-store.service';
import { type AllowedTool, type BuiltInTool, isMCPTool, type MCPTool } from 'types/command.types';
import { type IdempotencyOptions, isIdempotentTool } from 'types/idempotency.types';
import { getServerIdFromTool } from 'types/mcp-registry.types';
import { SemanticAttributes, SpanKind, type TraceContext } from 'types/tracing.types';
import { getPromptAdapter } from 'ui/prompt-adapter.interface';
import { promisify } from 'util';
import { formatErrorMessage } from 'utils/error-utils';
import { readFile, writeFile } from 'utils/file-utils';
import { validateNotForbiddenPath } from 'utils/input-validator';
import { getTracer, type Span } from 'utils/tracing';

import { type MCPToolHandler } from './mcp-tool-handler';
import {
	type DryRunToolSimulator,
	getDryRunSimulator,
	type SimulatedOperation
} from './tools/dry-run-simulator.service';
import { type PendingWrite, PendingWriteApproverService } from './tools/pending-write-approver.service';
import { getSearchToolsService, type SearchToolsService } from './tools/search-tools.service';
import { getSessionToolsService, type SessionToolsService } from './tools/session-tools.service';

const execAsync = promisify(exec);

/**
 * Tool definitions for the LLM (built-in tools only)
 * These are passed to the LLM so it knows what tools are available.
 * MCP tool definitions are generated dynamically based on connected MCP servers.
 */
const BUILT_IN_TOOL_DEFINITIONS: Record<BuiltInTool, LLMToolDefinition> = {
	codebase_search: {
		description: 'Semantic search across the codebase to find relevant code snippets',
		name: 'codebase_search',
		parameters: {
			properties: {
				query: {
					description: 'Natural language search query',
					type: 'string'
				}
			},
			required: ['query'],
			type: 'object'
		}
	},
	delete_file: {
		description: 'Delete a file from the filesystem',
		name: 'delete_file',
		parameters: {
			properties: {
				path: {
					description: 'Path to the file to delete',
					type: 'string'
				}
			},
			required: ['path'],
			type: 'object'
		}
	},
	glob_file_search: {
		description: 'Find files matching a glob pattern',
		name: 'glob_file_search',
		parameters: {
			properties: {
				pattern: {
					description: 'Glob pattern (e.g., "**/*.ts", "src/**/*.tsx")',
					type: 'string'
				}
			},
			required: ['pattern'],
			type: 'object'
		}
	},
	grep: {
		description: 'Search file contents using regex pattern',
		name: 'grep',
		parameters: {
			properties: {
				path: {
					description: 'Directory or file to search in',
					type: 'string'
				},
				pattern: {
					description: 'Regex pattern to search for',
					type: 'string'
				}
			},
			required: ['pattern'],
			type: 'object'
		}
	},
	list_dir: {
		description: 'List contents of a directory',
		name: 'list_dir',
		parameters: {
			properties: {
				path: {
					description: 'Path to the directory to list',
					type: 'string'
				}
			},
			required: ['path'],
			type: 'object'
		}
	},
	query_session: {
		description:
			'Query previous session data to find relevant context, decisions, or outputs. ' +
			'Use this to avoid re-running analysis or to understand prior work. ' +
			'Can list sessions, search across sessions, or get specific session details.',
		name: 'query_session',
		parameters: {
			properties: {
				action: {
					description:
						'Action to perform: "list" (show recent sessions), "search" (find content across sessions), "get" (get session details)',
					type: 'string'
				},
				query: {
					description: 'Search query for "search" action - finds matching content in session outputs',
					type: 'string'
				},
				session_id: {
					description: 'Session ID for "get" action - retrieves specific session details',
					type: 'string'
				}
			},
			required: ['action'],
			type: 'object'
		}
	},
	read_file: {
		description: 'Read the contents of a file',
		name: 'read_file',
		parameters: {
			properties: {
				path: {
					description: 'Path to the file to read',
					type: 'string'
				}
			},
			required: ['path'],
			type: 'object'
		}
	},
	run_terminal_cmd: {
		description: 'Execute a shell command and return the output',
		name: 'run_terminal_cmd',
		parameters: {
			properties: {
				command: {
					description: 'The shell command to execute',
					type: 'string'
				},
				timeout_ms: {
					description: 'Timeout in milliseconds (default: 30000)',
					type: 'number'
				}
			},
			required: ['command'],
			type: 'object'
		}
	},
	search_replace: {
		description: 'Make targeted edits to a file by replacing specific text',
		name: 'search_replace',
		parameters: {
			properties: {
				new_str: {
					description: 'The text to replace it with',
					type: 'string'
				},
				old_str: {
					description: 'The exact text to search for and replace',
					type: 'string'
				},
				path: {
					description: 'Path to the file to edit',
					type: 'string'
				}
			},
			required: ['path', 'old_str', 'new_str'],
			type: 'object'
		}
	},
	web_search: {
		description: 'Search the web for information',
		name: 'web_search',
		parameters: {
			properties: {
				query: {
					description: 'Search query',
					type: 'string'
				}
			},
			required: ['query'],
			type: 'object'
		}
	},
	write: {
		description: 'Create a new file or overwrite an existing file with the specified content',
		name: 'write',
		parameters: {
			properties: {
				content: {
					description: 'The content to write to the file',
					type: 'string'
				},
				path: {
					description: 'Path where the file should be created',
					type: 'string'
				}
			},
			required: ['path', 'content'],
			type: 'object'
		}
	}
};

export class ToolExecutionService {
	private readonly idempotencyStore: IdempotencyStoreService;
	private readonly logger = getLogger();
	private mcpClientManager: MCPClientManagerService | null = null;
	private mcpToolHandler: MCPToolHandler | null = null;
	private readonly searchToolsService: SearchToolsService;
	private readonly sessionToolsService: SessionToolsService;
	private readonly tracer = getTracer();
	private readonly workingDir: string;

	/**
	 * Session ID for scoping idempotency keys
	 * When set, idempotency is scoped to the current session
	 */
	private sessionId?: string;

	/**
	 * Trace context for distributed tracing
	 * When set, tool execution spans are linked to the parent trace
	 */
	private traceContext?: TraceContext;

	/**
	 * Idempotency options for tool execution
	 */
	private idempotencyOptions: IdempotencyOptions = {};

	/**
	 * Tracks files that have been read in this session.
	 * Used to allow writes to protected files only if they were read first,
	 * preventing blind overwrites while still allowing intentional updates.
	 */
	private readonly readFiles: Set<string> = new Set();

	/**
	 * Dry-run mode flag
	 * When enabled, state-changing tools are simulated instead of executed
	 */
	private dryRunMode: boolean = false;

	/**
	 * Dry-run simulator instance (lazy-initialized)
	 */
	private dryRunSimulator: DryRunToolSimulator | null = null;

	constructor(workingDir: string = process.cwd()) {
		this.workingDir = workingDir;
		this.idempotencyStore = getIdempotencyStore();
		this.searchToolsService = getSearchToolsService(workingDir);
		this.sessionToolsService = getSessionToolsService(workingDir);
	}

	/**
	 * Set the trace context for distributed tracing
	 * Tool execution spans will be children of this context
	 */
	setTraceContext(context: TraceContext): void {
		this.traceContext = context;
	}

	/**
	 * Get the current trace context
	 */
	getTraceContext(): TraceContext | undefined {
		return this.traceContext;
	}

	/**
	 * Set the session ID for idempotency scoping
	 * This should be called at the start of a command execution
	 */
	setSessionId(sessionId: string): void {
		this.sessionId = sessionId;
		this.idempotencyOptions.session_id = sessionId;
	}

	/**
	 * Configure idempotency options
	 */
	setIdempotencyOptions(options: IdempotencyOptions): void {
		this.idempotencyOptions = { ...this.idempotencyOptions, ...options };
	}

	/**
	 * Set the MCP tool handler for executing MCP tools
	 */
	setMCPToolHandler(handler: MCPToolHandler): void {
		this.mcpToolHandler = handler;
	}

	/**
	 * Set the MCP client manager for generating MCP tool definitions
	 */
	setMCPClientManager(clientManager: MCPClientManagerService): void {
		this.mcpClientManager = clientManager;
	}

	/**
	 * Disable idempotency for the current execution
	 * Useful when you want to force re-execution of all tools
	 */
	disableIdempotency(): void {
		this.idempotencyOptions.force_execute = true;
	}

	/**
	 * Enable idempotency for the current execution
	 */
	enableIdempotency(): void {
		this.idempotencyOptions.force_execute = false;
	}

	/**
	 * Enable or disable dry-run mode
	 * In dry-run mode, state-changing tools are simulated instead of executed
	 */
	setDryRunMode(enabled: boolean): void {
		this.dryRunMode = enabled;
		if (enabled && !this.dryRunSimulator) {
			this.dryRunSimulator = getDryRunSimulator(this.workingDir);
		}
		this.logger.debug(`Dry-run mode ${enabled ? 'enabled' : 'disabled'}`);
	}

	/**
	 * Check if dry-run mode is enabled
	 */
	isDryRunMode(): boolean {
		return this.dryRunMode;
	}

	/**
	 * Get simulated operations from dry-run mode
	 */
	getSimulatedOperations(): SimulatedOperation[] {
		if (!this.dryRunSimulator) {
			return [];
		}
		return this.dryRunSimulator.getSimulatedOperations();
	}

	/**
	 * Clear simulated operations
	 */
	clearSimulatedOperations(): void {
		if (this.dryRunSimulator) {
			this.dryRunSimulator.clear();
		}
	}

	/**
	 * Get tool definitions for the specified allowed tools
	 * Built-in tools are returned from static definitions.
	 * MCP tools are generated as gateway tools that route to external MCP servers.
	 */
	getToolDefinitions(allowedTools: AllowedTool[]): LLMToolDefinition[] {
		const definitions: LLMToolDefinition[] = [];

		for (const tool of allowedTools) {
			if (isMCPTool(tool)) {
				// Generate MCP gateway tool definition
				const mcpDefinition = this.generateMCPToolDefinition(tool);
				if (mcpDefinition) {
					definitions.push(mcpDefinition);
				}
				continue;
			}

			const definition = BUILT_IN_TOOL_DEFINITIONS[tool as BuiltInTool];
			if (definition) {
				definitions.push(definition);
			}
		}

		return definitions;
	}

	/**
	 * Build the description for an MCP tool definition
	 */
	private buildMCPToolDescription(
		serverId: string,
		serverDescription: string,
		availableToolNames: string[],
		capabilities?: string[]
	): string {
		let description = `Call tools on the ${serverId} MCP server. ${serverDescription}`;

		if (availableToolNames.length > 0) {
			description += `\n\nAvailable tools: ${availableToolNames.join(', ')}`;
		} else {
			description += '\n\nThe server will be connected on first use, and available tools will be discovered.';
		}

		if (capabilities) {
			description += `\n\nCapabilities: ${capabilities.join(', ')}`;
		}

		return description;
	}

	/**
	 * Get the tool_name parameter description based on available tools
	 */
	private getToolNameDescription(availableToolNames: string[]): string {
		return availableToolNames.length > 0
			? `The name of the tool to call. Available: ${availableToolNames.join(', ')}`
			: 'The name of the tool to call on this MCP server';
	}

	/**
	 * Generate a gateway tool definition for an MCP tool
	 * This creates a tool that accepts tool_name and arguments parameters,
	 * allowing the LLM to call any tool on the connected MCP server.
	 */
	private generateMCPToolDefinition(mcpTool: MCPTool): LLMToolDefinition | null {
		const serverId = getServerIdFromTool(mcpTool);
		if (!serverId) {
			this.logger.warn(`Invalid MCP tool name: ${mcpTool}`);
			return null;
		}

		// Get server info if connected
		const connectedServer = this.mcpClientManager?.getConnectedServer(serverId);
		const serverDescription = connectedServer?.config.description ?? `External MCP server: ${serverId}`;
		const availableToolNames = connectedServer?.availableTools.map((t) => t.name) ?? [];
		const capabilities = connectedServer?.config.security.capabilities;

		const description = this.buildMCPToolDescription(serverId, serverDescription, availableToolNames, capabilities);

		return {
			description,
			name: mcpTool,
			parameters: {
				additionalProperties: false,
				properties: {
					arguments: {
						additionalProperties: true,
						description: 'Arguments to pass to the tool (varies by tool)',
						type: 'object'
					},
					tool_name: {
						description: this.getToolNameDescription(availableToolNames),
						type: 'string'
					}
				},
				required: ['tool_name'],
				type: 'object'
			}
		};
	}

	/**
	 * Reset state for a new command execution
	 * Clears pending writes and resets confirmation state
	 * Should be called at the start of each command execution
	 */
	resetForNewCommand(): void {
		this.pendingWrites = [];
		this.readFiles.clear();
		// Reset idempotency options but keep session_id
		this.idempotencyOptions = { session_id: this.sessionId };
		// Reset dry-run state
		this.dryRunMode = false;
		this.clearSimulatedOperations();
	}

	/**
	 * Invalidate all idempotency records for the current session
	 * Call this when session state changes significantly
	 */
	async invalidateSessionIdempotency(): Promise<number> {
		if (this.sessionId) {
			return this.idempotencyStore.invalidateSession(this.sessionId);
		}
		return 0;
	}

	/**
	 * Invalidate idempotency records for a specific tool
	 * Useful when external changes affect tool results
	 */
	invalidateToolIdempotency(toolName: string): number {
		return this.idempotencyStore.invalidateTool(toolName);
	}

	/**
	 * Get idempotency store statistics
	 */
	getIdempotencyStats(): { max_records: number; record_count: number; store_dir: string } {
		return this.idempotencyStore.getStats();
	}

	/**
	 * Execute a tool call and return the result
	 *
	 * For idempotent tools (write, search_replace, delete_file, run_terminal_cmd),
	 * checks the idempotency store first and returns cached result if available.
	 * This prevents duplicate operations when the same tool call is retried.
	 *
	 * In dry-run mode, state-changing tools are simulated instead of executed.
	 * Read-only tools execute normally even in dry-run mode.
	 */
	async executeTool(toolCall: LLMToolCall): Promise<LLMToolResult> {
		const { name } = toolCall;

		// Handle dry-run mode for non-read-only tools
		if (this.dryRunMode && this.dryRunSimulator && !this.dryRunSimulator.isReadOnlyTool(name)) {
			this.logger.debug(`Simulating tool in dry-run mode: ${name}`);
			const simulated = await this.dryRunSimulator.simulateTool(toolCall);
			return simulated.result;
		}

		// Start a span for this tool execution
		const span = this.tracer.startSpan(`tool.${name}`, {
			attributes: {
				[SemanticAttributes.SESSION_ID]: this.sessionId,
				[SemanticAttributes.TOOL_NAME]: name
			},
			kind: SpanKind.INTERNAL,
			parent: this.traceContext
		});

		try {
			return await this.executeToolWithSpan(toolCall, span);
		} finally {
			span.end();
		}
	}

	/**
	 * Internal method to execute a tool with span tracking
	 */
	private async executeToolWithSpan(toolCall: LLMToolCall, span: Span): Promise<LLMToolResult> {
		const { arguments: args, id, name } = toolCall;
		const argSummary = this.getToolArgSummary(name, args);
		const color = getColorAdapter();

		// Check idempotency for state-changing tools
		if (isIdempotentTool(name)) {
			const checkResult = await this.idempotencyStore.check(toolCall, this.idempotencyOptions);

			if (checkResult.found && checkResult.record) {
				span.setAttribute(SemanticAttributes.TOOL_CACHE_HIT, true);
				span.setAttribute(SemanticAttributes.TOOL_IDEMPOTENCY_KEY, checkResult.key);
				span.addEvent('idempotency_cache_hit');
				span.setOk();

				this.logger.info(`Idempotency cache hit: ${name}${argSummary ? ` ${color.dim(`(${argSummary})`)}` : ''}`, {
					idempotency_key: checkResult.key
				});

				return {
					output: checkResult.record.result.output,
					tool_call_id: id
				};
			}
		}

		span.setAttribute(SemanticAttributes.TOOL_CACHE_HIT, false);
		span.addEvent('tool_execution_start');

		this.logger.info(`Executing tool: ${name}${argSummary ? ` ${color.dim(`(${argSummary})`)}` : ''}`, { args });

		try {
			const output = await this.executeToolByName(name as AllowedTool, args);

			span.setAttribute(SemanticAttributes.TOOL_RESULT_SIZE, output.length);
			span.setAttribute(SemanticAttributes.TOOL_SUCCESS, true);
			span.addEvent('tool_execution_complete');
			span.setOk();

			this.logger.debug(`Tool ${name} completed successfully`, {
				outputLength: output.length
			});

			// Store result for idempotent tools
			if (isIdempotentTool(name)) {
				await this.idempotencyStore.store(toolCall, { output, success: true }, this.idempotencyOptions);
			}

			return {
				output,
				tool_call_id: id
			};
		} catch (error) {
			const errorMessage = formatErrorMessage(error);

			span.setAttribute(SemanticAttributes.TOOL_SUCCESS, false);
			span.recordException(error as Error);

			this.logger.error(`Tool ${name} failed`, error as Error);

			// Store failed result for idempotent tools (prevents retrying failed operations)
			if (isIdempotentTool(name)) {
				await this.idempotencyStore.store(
					toolCall,
					{ error: errorMessage, output: `Error: ${errorMessage}`, success: false },
					this.idempotencyOptions
				);
			}

			return {
				output: `Error: ${errorMessage}`,
				tool_call_id: id
			};
		}
	}

	/**
	 * Execute multiple tool calls in parallel
	 */
	async executeTools(toolCalls: LLMToolCall[]): Promise<LLMToolResult[]> {
		if (toolCalls.length === 0) {
			return [];
		}

		// Create a parent span for batch execution
		const span = this.tracer.startSpan('tool.batch_execute', {
			attributes: {
				[SemanticAttributes.SESSION_ID]: this.sessionId,
				'tool.batch_size': toolCalls.length,
				'tool.names': toolCalls.map((c) => c.name).join(',')
			},
			kind: SpanKind.INTERNAL,
			parent: this.traceContext
		});

		try {
			const results = await Promise.all(toolCalls.map((call) => this.executeTool(call)));
			span.setAttribute('tool.success_count', results.filter((r) => !r.output.startsWith('Error:')).length);
			span.setOk();
			return results;
		} catch (error) {
			span.recordException(error as Error);
			throw error;
		} finally {
			span.end();
		}
	}

	/**
	 * Route tool execution to the appropriate handler
	 */
	private async executeToolByName(name: AllowedTool, args: Record<string, unknown>): Promise<string> {
		// Check if this is an MCP tool (handled separately in Phase 2)
		if (isMCPTool(name)) {
			return this.executeMcpTool(name, args);
		}

		// Built-in tool handlers
		const toolHandlers: Record<BuiltInTool, (args: Record<string, unknown>) => Promise<string>> = {
			['codebase_search']: (a) => this.searchToolsService.executeCodebaseSearch(a),
			['delete_file']: (a) => this.executeDeleteFile(a),
			['glob_file_search']: (a) => this.searchToolsService.executeGlobSearch(a),
			['grep']: (a) => this.searchToolsService.executeGrep(a),
			['list_dir']: (a) => this.executeListDir(a),
			['query_session']: (a) => this.sessionToolsService.executeQuerySession(a),
			['read_file']: (a) => this.executeReadFile(a),
			['run_terminal_cmd']: (a) => this.executeTerminalCmd(a),
			['search_replace']: (a) => this.executeSearchReplace(a),
			['web_search']: (a) => this.executeWebSearch(a),
			['write']: (a) => this.executeWrite(a)
		};

		const handler = toolHandlers[name as BuiltInTool];
		if (!handler) {
			throw new Error(`Unknown tool: ${name}`);
		}

		return handler(args);
	}

	/**
	 * Execute an MCP tool call
	 * Routes the call to MCPToolHandler for connection management and execution
	 */
	private async executeMcpTool(mcpToolName: string, args: Record<string, unknown>): Promise<string> {
		// Check if MCP handler is available
		if (!this.mcpToolHandler) {
			this.logger.warn('MCP tool handler not configured', { mcpToolName });
			return JSON.stringify({
				error: 'MCP tool handler not configured. MCP tools are not available.',
				status: 'not_configured'
			});
		}

		// Extract the actual tool name from args (e.g., playwright_navigate)
		// The mcpToolName is the MCP identifier (e.g., mcp_playwright)
		// The actual tool to call should be in args.tool_name or we use the full name
		const actualToolName = (args['tool_name'] as string) ?? mcpToolName;
		const toolArgs = (args['arguments'] as Record<string, unknown>) ?? args;

		try {
			const result = await this.mcpToolHandler.executeTool(mcpToolName as MCPTool, actualToolName, toolArgs);

			if (result.success) {
				return JSON.stringify({
					duration_ms: result.durationMs,
					output: result.output,
					server: result.serverId,
					status: 'success',
					tool: result.toolName
				});
			} else {
				return JSON.stringify({
					duration_ms: result.durationMs,
					error: result.error,
					server: result.serverId,
					status: 'error',
					tool: result.toolName
				});
			}
		} catch (error) {
			const errorMessage = (error as Error).message;
			this.logger.error(`MCP tool execution failed: ${mcpToolName}`, error as Error);
			return JSON.stringify({
				error: errorMessage,
				status: 'error',
				tool: mcpToolName
			});
		}
	}

	/**
	 * Paths that require confirmation before writing
	 * These are typically documentation/knowledge-base paths where user review is important
	 */
	private static readonly CONFIRM_WRITE_PATHS = ['knowledge-base/', 'docs/'];

	/**
	 * Pending writes that require confirmation
	 * These are queued during pipeline execution and processed at the end
	 */
	private pendingWrites: PendingWrite[] = [];

	/**
	 * Write content to a file
	 */
	private async executeWrite(args: Record<string, unknown>): Promise<string> {
		const path = args['path'] as string;
		const content = args['content'] as string;

		if (!path || content === undefined) {
			throw new Error('write requires path and content arguments');
		}

		// Validate path is not in forbidden paths (.ai/ folder)
		validateNotForbiddenPath(path, 'write to');

		const fullPath = this.resolvePath(path);

		// Also validate the resolved full path
		validateNotForbiddenPath(fullPath, 'write to');

		// Check if this is a protected file that already exists
		const fileName = path.split('/').pop() ?? path;
		const isProtectedFile = ToolExecutionService.PROTECTED_FILES.some(
			(protectedFile) => fileName === protectedFile || path.endsWith(`/${protectedFile}`)
		);

		// Allow writes to protected files only if they were read first
		// This prevents blind overwrites while allowing intentional updates
		if (isProtectedFile && existsSync(fullPath) && !this.readFiles.has(fullPath)) {
			throw new Error(
				`Cannot overwrite existing protected file: ${path}. ` +
					`This file already exists and is protected from accidental overwrite. ` +
					`Use 'read_file' to see its current contents first, then you can overwrite it.`
			);
		}

		// Check if this path requires confirmation
		const requiresConfirmation = ToolExecutionService.CONFIRM_WRITE_PATHS.some(
			(confirmPath) => path.includes(confirmPath) || fullPath.includes(confirmPath)
		);

		if (requiresConfirmation) {
			// Queue the write for confirmation at the end of pipeline
			this.pendingWrites.push({ content, fullPath, path });
			this.logger.info(`Queued file for confirmation: ${path}`, {
				contentLength: content.length,
				pendingCount: this.pendingWrites.length
			});
			return `File queued for writing: ${path} (will confirm at end of pipeline)`;
		}

		await writeFile(fullPath, content);

		this.logger.info(`Created/updated file: ${fullPath}`, {
			contentLength: content.length
		});

		return `Successfully wrote ${content.length} characters to ${path}`;
	}

	/**
	 * Check if there are pending writes that need confirmation
	 */
	hasPendingWrites(): boolean {
		return this.pendingWrites.length > 0;
	}

	/**
	 * Get the count of pending writes
	 */
	getPendingWritesCount(): number {
		return this.pendingWrites.length;
	}

	/**
	 * Process all pending writes with user confirmation
	 * Called at the end of pipeline execution
	 * Returns the number of files successfully written
	 */
	async flushPendingWrites(): Promise<{ skipped: number; written: number }> {
		if (this.pendingWrites.length === 0) {
			return { skipped: 0, written: 0 };
		}

		const approver = new PendingWriteApproverService(
			getConsoleOutput(),
			getColorAdapter(),
			getPromptAdapter(),
			this.logger
		);

		const result = await approver.flush(this.pendingWrites);

		// Clear the pending writes
		this.pendingWrites = [];

		return result;
	}

	/**
	 * Maximum file size to read (1MB) - prevents reading extremely large files
	 * that could cause context overflow
	 */
	private static readonly MAX_READ_FILE_SIZE = 1 * 1024 * 1024;

	/**
	 * Paths that should not be read (contain sensitive or very large data)
	 */
	private static readonly BLOCKED_READ_PATHS = ['.ai/sessions', 'node_modules', '.git/objects'];

	/**
	 * Protected files that should not be overwritten if they already exist.
	 * The write tool will reject attempts to overwrite these files and suggest
	 * using search_replace instead.
	 */
	private static readonly PROTECTED_FILES = [
		'.gitignore',
		'.gitattributes',
		'.env',
		'.env.local',
		'.env.production',
		'.env.development',
		'.npmrc',
		'.nvmrc',
		'.editorconfig',
		'package.json',
		'package-lock.json',
		'pnpm-lock.yaml',
		'yarn.lock',
		'bun.lockb',
		'tsconfig.json'
	];

	/**
	 * Read file contents
	 */
	private async executeReadFile(args: Record<string, unknown>): Promise<string> {
		const path = args['path'] as string;

		if (!path) {
			throw new Error('read_file requires path argument');
		}

		// Check if path is in a blocked directory using find for lookup
		const blockedPath = ToolExecutionService.BLOCKED_READ_PATHS.find((blocked) => path.includes(blocked));
		if (blockedPath) {
			throw new Error(`Cannot read files in ${blockedPath} - these files may be very large or contain session data`);
		}

		const fullPath = this.resolvePath(path);

		if (!existsSync(fullPath)) {
			throw new Error(`File not found: ${path}`);
		}

		// Check file size before reading
		const stat = statSync(fullPath);
		if (stat.size > ToolExecutionService.MAX_READ_FILE_SIZE) {
			throw new Error(
				`File too large to read: ${path} (${Math.round(stat.size / 1024)}KB > ${Math.round(ToolExecutionService.MAX_READ_FILE_SIZE / 1024)}KB limit)`
			);
		}

		const content = await readFile(fullPath);

		// Track that this file was read (enables writes to protected files)
		this.readFiles.add(fullPath);

		return content;
	}

	/**
	 * Search and replace in a file
	 */
	private async executeSearchReplace(args: Record<string, unknown>): Promise<string> {
		const path = args['path'] as string;
		const oldStr = args['old_str'] as string;
		const newStr = args['new_str'] as string;

		if (!path || oldStr === undefined || newStr === undefined) {
			throw new Error('search_replace requires path, old_str, and new_str arguments');
		}

		// Validate path is not in forbidden paths (.ai/ folder)
		validateNotForbiddenPath(path, 'modify');

		const fullPath = this.resolvePath(path);

		// Also validate the resolved full path
		validateNotForbiddenPath(fullPath, 'modify');

		if (!existsSync(fullPath)) {
			throw new Error(`File not found: ${path}`);
		}

		const content = await readFile(fullPath);

		if (!content.includes(oldStr)) {
			throw new Error(`Text not found in file: "${oldStr.substring(0, 50)}..."`);
		}

		const newContent = content.replace(oldStr, newStr);
		await writeFile(fullPath, newContent);

		this.logger.info(`Updated file: ${fullPath}`, {
			newStrLength: newStr.length,
			oldStrLength: oldStr.length
		});

		return `Successfully replaced text in ${path}`;
	}

	/**
	 * Delete a file
	 */
	private executeDeleteFile(args: Record<string, unknown>): Promise<string> {
		const path = args['path'] as string;

		if (!path) {
			return Promise.reject(new Error('delete_file requires path argument'));
		}

		// Validate path is not in forbidden paths (.ai/ folder)
		try {
			validateNotForbiddenPath(path, 'delete');
		} catch (error) {
			return Promise.reject(error);
		}

		const fullPath = this.resolvePath(path);

		// Also validate the resolved full path
		try {
			validateNotForbiddenPath(fullPath, 'delete');
		} catch (error) {
			return Promise.reject(error);
		}

		if (!existsSync(fullPath)) {
			return Promise.reject(new Error(`File not found: ${path}`));
		}

		rmSync(fullPath);

		this.logger.info(`Deleted file: ${fullPath}`);

		return Promise.resolve(`Successfully deleted ${path}`);
	}

	/**
	 * Execute a terminal command
	 */
	private async executeTerminalCmd(args: Record<string, unknown>): Promise<string> {
		const command = args['command'] as string;
		const timeoutMs = (args['timeout_ms'] as number) ?? DEFAULT_TIMEOUT_MS;

		if (!command) {
			throw new Error('run_terminal_cmd requires command argument');
		}

		this.logger.info(`Executing command: ${command}`);

		try {
			const { stderr, stdout } = await execAsync(command, {
				cwd: this.workingDir,
				timeout: timeoutMs
			});

			const output = stdout + (stderr ? `\nStderr: ${stderr}` : '');

			return output || 'Command completed successfully (no output)';
		} catch (error) {
			const execError = error as { stderr?: string; stdout?: string };
			const output = (execError.stdout ?? '') + (execError.stderr ?? '');
			throw new Error(`Command failed: ${output || (error as Error).message}`);
		}
	}

	/**
	 * List directory contents
	 */
	private executeListDir(args: Record<string, unknown>): Promise<string> {
		const path = (args['path'] as string) ?? '.';
		const fullPath = this.resolvePath(path);

		if (!existsSync(fullPath)) {
			return Promise.reject(new Error(`Directory not found: ${path}`));
		}

		const stat = statSync(fullPath);
		if (!stat.isDirectory()) {
			return Promise.reject(new Error(`Not a directory: ${path}`));
		}

		const entries = readdirSync(fullPath, { withFileTypes: true });
		const formatted = entries.map((entry) => {
			const prefix = entry.isDirectory() ? '[DIR]' : '[FILE]';
			return `${prefix} ${entry.name}`;
		});

		return Promise.resolve(formatted.join('\n'));
	}

	/**
	 * Web search (placeholder - would integrate with actual web search)
	 */
	private executeWebSearch(args: Record<string, unknown>): Promise<string> {
		const query = args['query'] as string;

		if (!query) {
			throw new Error('web_search requires query argument');
		}

		return Promise.resolve(`Web search not implemented. Query: ${query}`);
	}

	/**
	 * Resolve a path relative to the working directory
	 */
	private resolvePath(path: string): string {
		if (path.startsWith('/')) {
			return path;
		}
		return `${this.workingDir}/${path}`;
	}

	/**
	 * Get a summary of tool arguments for logging
	 * Returns the primary argument value that identifies what the tool is operating on
	 */
	private getToolArgSummary(toolName: string, args: Record<string, unknown>): string {
		// Map of tool names to their primary argument keys
		const primaryArgKeys: Record<string, string[]> = {
			codebase_search: ['query'],
			delete_file: ['path'],
			glob_file_search: ['pattern'],
			grep: ['pattern', 'path'],
			list_dir: ['path'],
			mcp_tool_call: ['tool_name'],
			query_session: ['action', 'query', 'session_id'],
			read_file: ['path'],
			run_terminal_cmd: ['command'],
			search_replace: ['path'],
			web_search: ['query'],
			write: ['path']
		};

		const keys = primaryArgKeys[toolName];
		if (!keys) {
			return '';
		}

		const values = keys
			.map((key) => {
				const value = args[key];
				if (value === undefined || value === null) {
					return null;
				}
				const strValue = String(value);
				// Truncate long values
				return strValue.length > 50 ? `${strValue.slice(0, 47)}...` : strValue;
			})
			.filter(Boolean);

		return values.join(', ');
	}
}

/**
 * Singleton instance for the tool execution service
 */
let toolExecutionService: null | ToolExecutionService = null;

export function getToolExecutionService(workingDir?: string): ToolExecutionService {
	if (!toolExecutionService || workingDir) {
		toolExecutionService = new ToolExecutionService(workingDir);
	}
	return toolExecutionService;
}
