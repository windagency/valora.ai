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
 *
 * ## Failure vs Guidance
 *
 * Tool results are classified by stage-executor as either a *failure* (content
 * starts with `"Error:"`) or a *success*. To avoid inflating the failure counter
 * with recoverable LLM mistakes, tools in this service follow a strict policy:
 *
 * **Throw / return `"Error:…"`** — only for genuine system faults: unknown tool
 * name, filesystem permission errors, unexpected exceptions propagated from the
 * OS, or commands that exit with code ≥ 2.
 *
 * **Return a plain string** — for all *guidance* situations where the LLM made a
 * correctable mistake and should retry with better arguments:
 *   - Missing or invalid arguments
 *   - File / directory not found
 *   - File too large → suggests selective extraction
 *   - Structured file read via read_file → suggests jq/yq
 *   - Protected-file overwrite attempt → suggests read-first
 *   - search_replace old_str not found → suggests reading the file first
 *   - rg/grep exit code 1 (no matches) → returns "No matches found"
 *   - Blocked path access
 *
 * This keeps the hard-stop threshold (MAX_TOOL_FAILURES_BEFORE_HARD_STOP in
 * stage-executor) meaningful: it only fires when tools are genuinely broken,
 * not when the LLM is working through normal search/navigation patterns.
 */

import { type ASTToolsService, getASTToolsService } from 'ast/ast-tools.service';
import { exec } from 'child_process';
import { existsSync, readdirSync, rmSync, statSync } from 'fs';
import { getLSPToolsService, type LSPToolsService } from 'lsp/lsp-tools.service';
import { dirname, resolve } from 'path';
import { getCommandGuard } from 'security/command-guard';
import { getCredentialGuard } from 'security/credential-guard';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

import type { MCPClientManagerService } from 'mcp/mcp-client-manager.service';
import type { LLMToolCall, LLMToolDefinition, LLMToolResult } from 'types/llm.types';

import { DEFAULT_TIMEOUT_MS, MAX_LIST_DIR_ENTRIES, MAX_MCP_OUTPUT_CHARS } from 'config/constants';
import { type MCPToolHandler } from 'mcp/mcp-tool-handler';
import { getColorAdapter } from 'output/color-adapter.interface';
import { getConsoleOutput } from 'output/console-output';
import { getLogger } from 'output/logger';
import { getPipelineEmitter } from 'output/pipeline-emitter';
import { getIdempotencyStore, type IdempotencyStoreService } from 'services/idempotency-store.service';
import { type AllowedTool, type BuiltInTool, isMCPTool, type MCPTool } from 'types/command.types';
import { type IdempotencyOptions, isIdempotentTool } from 'types/idempotency.types';
import { getServerIdFromTool } from 'types/mcp-registry.types';
import { SemanticAttributes, SpanKind, type TraceContext } from 'types/tracing.types';
import { getPromptAdapter } from 'ui/prompt-adapter.interface';
import { formatErrorMessage } from 'utils/error-utils';
import { readFile, writeFile } from 'utils/file-utils';
import { validateNotForbiddenPath } from 'utils/input-validator';
import { getMetricsCollector, observeHistogram } from 'utils/metrics-collector';
import { getTracer, type Span } from 'utils/tracing';

import { getHookExecutionService } from './hook-execution.service';
import { compressTerminalOutput, getCompressionStats } from './output-compression.service';
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
 * Path to the vendor/bin directory bundled with this package.
 * Populated at install time by scripts/postinstall.mjs.
 * This file is compiled to dist/executor/, so ../../vendor/bin reaches
 * the package root's vendor/bin directory.
 */
const VENDOR_BIN = resolve(dirname(fileURLToPath(import.meta.url)), '../../vendor/bin');

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
	file_outline: {
		description:
			'Get a structured outline of a file showing all symbols (functions, classes, types) with their signatures and line numbers. ' +
			'Uses the AST index for fast, precise results.',
		name: 'file_outline',
		parameters: {
			properties: {
				path: {
					description: 'Path to the file to outline',
					type: 'string'
				}
			},
			required: ['path'],
			type: 'object'
		}
	},
	find_references: {
		description:
			'Find all files and locations that reference a given symbol name. ' +
			'Uses the AST index for cross-file reference finding. Falls back to grep when index unavailable.',
		name: 'find_references',
		parameters: {
			properties: {
				path: {
					description: 'Optional scope: only search within this directory',
					type: 'string'
				},
				symbol: {
					description: 'Symbol name to find references for',
					type: 'string'
				}
			},
			required: ['symbol'],
			type: 'object'
		}
	},
	get_diagnostics: {
		description:
			'Get compiler errors and warnings for a file from the language server. ' +
			'Requires a running language server for the file type.',
		name: 'get_diagnostics',
		parameters: {
			properties: {
				file_path: {
					description: 'Path to the file to check',
					type: 'string'
				}
			},
			required: ['file_path'],
			type: 'object'
		}
	},
	get_type_info: {
		description:
			'Get the type signature of a symbol from the language server. ' +
			'Accepts either a symbol name or a line/character position.',
		name: 'get_type_info',
		parameters: {
			properties: {
				character: {
					description: '0-based character offset (alternative to symbol)',
					type: 'number'
				},
				file_path: {
					description: 'Path to the file',
					type: 'string'
				},
				line: {
					description: '0-based line number (alternative to symbol)',
					type: 'number'
				},
				symbol: {
					description: 'Symbol name to look up',
					type: 'string'
				}
			},
			required: ['file_path'],
			type: 'object'
		}
	},
	glob_file_search: {
		description: `Find files matching a glob pattern.

⚠️ RECOMMENDED: Use run_terminal_cmd with 'fd' for better performance.

This tool uses basic glob matching.

PREFERRED: Use run_terminal_cmd with modern 'fd' tool for:
  • 5-10x faster file discovery
  • .gitignore awareness (skips node_modules, .git, build/)
  • Better pattern matching

Examples:
  ✅ run_terminal_cmd("fd -e ts src/")  # Find all .ts files in src/
  ✅ run_terminal_cmd("fd -e tsx -e jsx .")  # Multiple extensions
  ✅ run_terminal_cmd("fd --type f 'test' .")  # Files containing 'test'
  ✅ run_terminal_cmd("fd --glob '**/*.config.js'")  # Glob pattern

This tool (glob_file_search) is acceptable for simple patterns, but fd is faster and more powerful.`,
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
	goto_definition: {
		description:
			'Find where a symbol is defined using the language server. ' +
			'Accepts either a symbol name or a line/character position.',
		name: 'goto_definition',
		parameters: {
			properties: {
				character: {
					description: '0-based character offset (alternative to symbol)',
					type: 'number'
				},
				file_path: {
					description: 'Path to the file containing the symbol usage',
					type: 'string'
				},
				line: {
					description: '0-based line number (alternative to symbol)',
					type: 'number'
				},
				symbol: {
					description: 'Symbol name to look up',
					type: 'string'
				}
			},
			required: ['file_path'],
			type: 'object'
		}
	},
	grep: {
		description: `⚠️ DEPRECATED: Use run_terminal_cmd with 'rg' (ripgrep) instead.

This tool uses legacy grep which:
  ❌ Searches node_modules, .git, and other ignored directories (wastes tokens)
  ❌ Produces verbose, unstructured output
  ❌ Lacks .gitignore awareness
  ❌ Slower on large codebases

PREFERRED: Use run_terminal_cmd with modern 'rg' (ripgrep) tool:

Examples:
  ✅ run_terminal_cmd("rg 'pattern' src/")  # Fast, .gitignore-aware
  ✅ run_terminal_cmd("rg -A 5 'pattern' file.ts")  # With 5 lines of context
  ✅ run_terminal_cmd("rg --json 'pattern' .")  # Structured output for parsing
  ✅ run_terminal_cmd("rg -l 'pattern' .")  # List matching files only

Benefits of rg over grep:
  • 5-10x faster
  • Respects .gitignore by default (skips node_modules, .git, build artifacts)
  • Structured JSON output available (--json flag)
  • Better regex engine
  • Saves 60-80% tokens by excluding irrelevant files

Only use this legacy grep tool if:
  • You need to search in .gitignore'd directories
  • rg is not available (rare)`,
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
	hover_info: {
		description: 'Get full documentation and type signature for a symbol from the language server.',
		name: 'hover_info',
		parameters: {
			properties: {
				character: {
					description: '0-based character offset (alternative to symbol)',
					type: 'number'
				},
				file_path: {
					description: 'Path to the file',
					type: 'string'
				},
				line: {
					description: '0-based line number (alternative to symbol)',
					type: 'number'
				},
				symbol: {
					description: 'Symbol name to look up',
					type: 'string'
				}
			},
			required: ['file_path'],
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
		description: `Read SMALL files only (max 100 lines).

⚠️ CRITICAL RESTRICTIONS:

NEVER use this tool for files >100 lines - this wastes 80-90% of your context window.
NEVER use this tool for JSON/YAML/TOML/XML files - use jq/yq via run_terminal_cmd instead.

DO NOT USE for these files (use run_terminal_cmd with rg instead):
  ❌ PRD.md, BACKLOG.md, FUNCTIONAL.md (150-500 lines)
  ❌ package.json, tsconfig.json (use jq)
  ❌ docker-compose.yml, *.yaml (use yq)

CORRECT usage examples:
  ✅ read_file("README.md") - if < 100 lines
  ✅ read_file("CONTRIBUTING.md") - if < 100 lines

INCORRECT usage (use run_terminal_cmd instead):
  ❌ read_file("knowledge-base/PRD.md") → use: run_terminal_cmd("rg '^## ' knowledge-base/PRD.md")
  ❌ read_file("package.json") → use: run_terminal_cmd("jq '.dependencies' package.json")
  ❌ read_file("knowledge-base/BACKLOG.md") → use: run_terminal_cmd("rg -A 5 'TASK-ID' knowledge-base/BACKLOG.md")

Violating these restrictions wastes tokens and degrades performance.`,
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
	request_context: {
		description:
			'Request additional code context for a file or symbol. ' +
			'Use this when smart_context provided insufficient detail. ' +
			'Returns signatures-only or full content based on level.',
		name: 'request_context',
		parameters: {
			properties: {
				level: {
					description: 'Detail level: "signatures" (declarations only) or "full" (complete source)',
					type: 'string'
				},
				target: {
					description: 'File path or symbol name to get context for',
					type: 'string'
				}
			},
			required: ['target'],
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
	smart_context: {
		description:
			'Get minimal, budget-aware code context relevant to a task. ' +
			'Returns only the most relevant symbols and signatures, reducing token usage by 40-60%.',
		name: 'smart_context',
		parameters: {
			properties: {
				budget: {
					description: 'Maximum token budget for the context',
					type: 'number'
				},
				files: {
					description: 'Specific files to focus on',
					items: { type: 'string' },
					type: 'array'
				},
				mode: {
					description: 'Context mode: "focused" (fewer files, more detail) or "broad" (more files, less detail)',
					type: 'string'
				},
				task: {
					description: 'Task description to determine relevant context',
					type: 'string'
				}
			},
			required: ['task'],
			type: 'object'
		}
	},
	symbol_search: {
		description:
			'Find functions, classes, types, and other symbols by name using the AST index. ' +
			'Supports fuzzy matching. Much faster and more precise than grep for finding definitions.',
		name: 'symbol_search',
		parameters: {
			properties: {
				kind: {
					description: 'Filter by symbol kind: function, class, interface, type, enum, method, variable, constant',
					type: 'string'
				},
				language: {
					description: 'Filter by language: typescript, javascript, python, go, rust, java',
					type: 'string'
				},
				query: {
					description: 'Symbol name to search for (supports fuzzy matching)',
					type: 'string'
				}
			},
			required: ['query'],
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
	private readonly astToolsService: ASTToolsService;
	private readonly hookExecutionService = getHookExecutionService();
	private readonly idempotencyStore: IdempotencyStoreService;
	private readonly logger = getLogger();
	private readonly lspToolsService: LSPToolsService;
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
	 * Cached result of rg (ripgrep) availability check.
	 * null = not yet checked, true/false = result of check.
	 */
	private rgAvailableCache: boolean | null = null;

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
		this.astToolsService = getASTToolsService(workingDir);
		this.lspToolsService = getLSPToolsService(workingDir);
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
		this.hookExecutionService.setSessionId(sessionId);
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

		// === PreToolUse hooks (before span, can block/modify) ===
		if (this.hookExecutionService.hasHooks('PreToolUse')) {
			const hookResult = await this.hookExecutionService.executePreToolUseHooks(toolCall);

			if (!hookResult.allowed) {
				this.logger.info(`Tool blocked by PreToolUse hook: ${name}`, {
					reason: hookResult.blockReason
				});
				return {
					output: `Tool call blocked by hook: ${hookResult.blockReason ?? 'No reason provided'}`,
					tool_call_id: toolCall.id
				};
			}

			if (hookResult.updatedArgs) {
				toolCall = { ...toolCall, arguments: { ...toolCall.arguments, ...hookResult.updatedArgs } };
			}
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

			// Track character consumption per tool for token budget analysis
			const inputChars = JSON.stringify(args).length;
			observeHistogram('tool_input_chars', inputChars, { tool: name });
			observeHistogram('tool_output_chars', output.length, { tool: name });

			this.logger.debug(`Tool ${name} completed successfully`, {
				outputLength: output.length
			});

			// Store result for idempotent tools
			if (isIdempotentTool(name)) {
				await this.idempotencyStore.store(toolCall, { output, success: true }, this.idempotencyOptions);
			}

			// === PostToolUse hooks (after execution, non-blocking) ===
			if (this.hookExecutionService.hasHooks('PostToolUse')) {
				// Fire-and-forget: do not await, do not block
				this.hookExecutionService.executePostToolUseHooks(toolCall, output).catch((err) => {
					this.logger.warn('PostToolUse hook error', { error: formatErrorMessage(err) });
				});
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

			// Record metric and emit event so failures are visible in dashboard + to subscribers
			getMetricsCollector().incrementCounter('tool_execution_failed', 1, { tool: name });
			getPipelineEmitter().emitToolExecutionFailed({ errorMessage, toolName: name });

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
			['file_outline']: (a) => Promise.resolve(this.astToolsService.executeFileOutline(a)),
			['find_references']: (a) => Promise.resolve(this.astToolsService.executeFindReferences(a)),
			['get_diagnostics']: (a) => this.lspToolsService.executeGetDiagnostics(a),
			['get_type_info']: (a) => this.lspToolsService.executeGetTypeInfo(a),
			['glob_file_search']: (a) => this.searchToolsService.executeGlobSearch(a),
			['goto_definition']: (a) => this.lspToolsService.executeGotoDefinition(a),
			['grep']: (a) => this.searchToolsService.executeGrep(a),
			['hover_info']: (a) => this.lspToolsService.executeHoverInfo(a),
			['list_dir']: (a) => this.executeListDir(a),
			['query_session']: (a) => this.sessionToolsService.executeQuerySession(a),
			['read_file']: (a) => this.executeReadFile(a),
			['request_context']: (a) => this.astToolsService.executeRequestContext(a),
			['run_terminal_cmd']: (a) => this.executeTerminalCmd(a),
			['search_replace']: (a) => this.executeSearchReplace(a),
			['smart_context']: (a) => Promise.resolve(this.astToolsService.executeSmartContext(a)),
			['symbol_search']: (a) => Promise.resolve(this.astToolsService.executeSymbolSearch(a)),
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
					output: truncateMcpOutput(result.output),
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
			return 'write requires path and content arguments';
		}

		const fullPath = this.validateAndResolvePath(path, 'write to');

		// Check if this is a protected file that already exists
		const fileName = path.split('/').pop() ?? path;
		const isProtectedFile = ToolExecutionService.PROTECTED_FILES.some(
			(protectedFile) => fileName === protectedFile || path.endsWith(`/${protectedFile}`)
		);

		// Allow writes to protected files only if they were read first
		// This prevents blind overwrites while allowing intentional updates
		if (isProtectedFile && existsSync(fullPath) && !this.readFiles.has(fullPath)) {
			return (
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
	private static readonly BLOCKED_READ_PATHS = ['.valora/sessions', 'node_modules', '.git/objects'];

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
			return 'read_file requires path argument';
		}

		// Check if path is in a blocked directory using find for lookup
		const blockedPath = ToolExecutionService.BLOCKED_READ_PATHS.find((blocked) => path.includes(blocked));
		if (blockedPath) {
			return `Cannot read files in ${blockedPath} — these files may be very large or contain session data`;
		}

		// Block sensitive files (credentials, keys, etc.)
		if (getCredentialGuard().isSensitiveFile(path)) {
			return `Cannot read sensitive file: ${path} — this file may contain credentials or private keys`;
		}

		const fullPath = this.resolvePath(path);

		if (!existsSync(fullPath)) {
			return (
				`File not found: ${path}\n\n` +
				`Verify the path with list_dir or glob_file_search("${path.split('/').pop() ?? path}") to locate the file.`
			);
		}

		// Check file size before reading
		const stat = statSync(fullPath);
		if (stat.size > ToolExecutionService.MAX_READ_FILE_SIZE) {
			const kb = Math.round(stat.size / 1024);
			const limitKb = Math.round(ToolExecutionService.MAX_READ_FILE_SIZE / 1024);
			return (
				`File too large to read: ${path} (${kb}KB > ${limitKb}KB limit)\n\n` +
				`Use selective extraction via run_terminal_cmd instead:\n` +
				`  run_terminal_cmd("rg -n 'pattern' ${path}")  # Search for specific content\n` +
				`  run_terminal_cmd("head -50 ${path}")          # Read first 50 lines\n` +
				`  run_terminal_cmd("sed -n '1,50p' ${path}")    # Read specific line range`
			);
		}

		const structuredGuidance = this.structuredFileGuidance(path);
		if (structuredGuidance !== null) {
			return structuredGuidance;
		}

		const content = await readFile(fullPath);
		const lineGuidance = this.lineCountGuidance(path, content);
		if (lineGuidance !== null) {
			return lineGuidance;
		}

		// Track that this file was read (enables writes to protected files)
		this.readFiles.add(fullPath);

		return content;
	}

	/**
	 * Returns guidance for structured files (JSON/YAML/TOML/XML) that should be
	 * read with jq/yq rather than read_file, or null if the file is not structured.
	 *
	 * Returns a string rather than throwing so the LLM receives actionable guidance
	 * without the result being counted as a tool failure.
	 */
	private structuredFileGuidance(path: string): null | string {
		const structuredFileExtensions = ['.json', '.yaml', '.yml', '.toml', '.xml'];
		const isStructuredFile = structuredFileExtensions.some((ext) => path.toLowerCase().endsWith(ext));
		if (!isStructuredFile) {
			return null;
		}

		const tool = path.endsWith('.json') ? 'jq' : 'yq';
		return (
			`Cannot use read_file for structured files: ${path}\n\n` +
			`Structured files (JSON/YAML/TOML/XML) must be read with ${tool} via run_terminal_cmd.\n\n` +
			`Use instead:\n` +
			`  run_terminal_cmd("${tool} '.' ${path}")  # Read entire file\n` +
			`  run_terminal_cmd("${tool} '.key' ${path}")  # Extract specific field\n\n` +
			`This saves 85-95% of tokens compared to read_file.`
		);
	}

	/**
	 * Returns guidance for reading large files (>100 lines) with selective CLI tools,
	 * or null if the file is within the line limit.
	 *
	 * Returns a string rather than throwing so the LLM receives actionable guidance
	 * without the result being counted as a tool failure.
	 */
	private lineCountGuidance(path: string, content: string): null | string {
		const lineCount = content.split('\n').length;
		if (lineCount <= 100) {
			return null;
		}

		const fileName = path.split('/').pop() ?? path;
		let suggestion = `run_terminal_cmd("rg '^## ' ${path}")  # Get markdown structure`;

		if (fileName.includes('PRD') || fileName.includes('BACKLOG') || fileName.includes('FUNCTIONAL')) {
			suggestion =
				`run_terminal_cmd("rg '^## ' ${path}")  # Get document structure\n` +
				`  run_terminal_cmd("rg -A 50 '^## Functional Requirements' ${path}")  # Extract section`;
		} else if (fileName.endsWith('.ts') || fileName.endsWith('.tsx') || fileName.endsWith('.js')) {
			suggestion = `run_terminal_cmd("rg -A 10 'class|function|export' ${path}")  # Extract key definitions`;
		}

		return (
			`File too large: ${path} (${lineCount} lines > 100 line limit)\n\n` +
			`Files with >100 lines must be read with selective extraction via run_terminal_cmd.\n\n` +
			`Use instead:\n  ${suggestion}\n\n` +
			`This saves 80-90% of tokens compared to reading the entire file.`
		);
	}

	/**
	 * Search and replace in a file
	 */
	private async executeSearchReplace(args: Record<string, unknown>): Promise<string> {
		const path = args['path'] as string;
		const oldStr = args['old_str'] as string;
		const newStr = args['new_str'] as string;

		if (!path || oldStr === undefined || newStr === undefined) {
			return 'search_replace requires path, old_str, and new_str arguments';
		}

		const fullPath = this.validateAndResolvePath(path, 'modify');

		if (!existsSync(fullPath)) {
			return (
				`File not found: ${path}\n\n` +
				`Verify the path with list_dir or glob_file_search before calling search_replace.`
			);
		}

		const content = await readFile(fullPath);

		if (!content.includes(oldStr)) {
			return (
				`Text not found in file: "${oldStr.substring(0, 50)}..."\n\n` +
				`Use read_file("${path}") to see the current file contents, then adjust old_str to match exactly.`
			);
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
			return Promise.resolve('delete_file requires path argument');
		}

		try {
			const fullPath = this.validateAndResolvePath(path, 'delete');

			if (!existsSync(fullPath)) {
				return Promise.resolve(`File not found: ${path} (nothing to delete)`);
			}

			rmSync(fullPath);

			this.logger.info(`Deleted file: ${fullPath}`);

			return Promise.resolve(`Successfully deleted ${path}`);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	/**
	 * Check whether rg (ripgrep) is available in the augmented PATH.
	 * Result is cached so the check only runs once per service instance.
	 */
	private async checkRgAvailable(): Promise<boolean> {
		if (this.rgAvailableCache !== null) return this.rgAvailableCache;
		try {
			await execAsync('command -v rg', {
				env: { ...process.env, PATH: this.buildAugmentedPath() },
				timeout: 3000
			});
			this.rgAvailableCache = true;
		} catch {
			this.rgAvailableCache = false;
		}
		return this.rgAvailableCache;
	}

	/**
	 * Translate an `rg` command to an equivalent `grep` command.
	 * Called when ripgrep is not available on the user's system.
	 * Handles the flag subset the LLM is instructed to use.
	 */
	private static translateRgToGrep(command: string): string {
		const EXCLUDES = [
			'--exclude-dir=node_modules',
			'--exclude-dir=.git',
			'--exclude-dir=dist',
			'--exclude-dir=build',
			'--exclude-dir=.valora'
		].join(' ');

		let rest = command.slice(3).trim(); // strip leading 'rg'
		const flags: string[] = ['-r', '-n'];

		// -l / --files-with-matches
		if (/(?:^|\s)(?:-l|--files-with-matches)(?:\s|$)/.test(rest)) {
			flags.push('-l');
			rest = rest.replace(/\s*(?:-l|--files-with-matches)\b/, '');
		}
		// -i / --ignore-case
		if (/(?:^|\s)(?:-i|--ignore-case)(?:\s|$)/.test(rest)) {
			flags.push('-i');
			rest = rest.replace(/\s*(?:-i|--ignore-case)\b/, '');
		}
		// -A N (after context)
		const aMatch = rest.match(/\s*-A\s+(\d+)/);
		if (aMatch?.[1]) {
			flags.push('-A', aMatch[1]);
			rest = rest.replace(/\s*-A\s+\d+/, '');
		}
		// -B N (before context)
		const bMatch = rest.match(/\s*-B\s+(\d+)/);
		if (bMatch?.[1]) {
			flags.push('-B', bMatch[1]);
			rest = rest.replace(/\s*-B\s+\d+/, '');
		}
		// -C N (context)
		const cMatch = rest.match(/\s*-C\s+(\d+)/);
		if (cMatch?.[1]) {
			flags.push('-C', cMatch[1]);
			rest = rest.replace(/\s*-C\s+\d+/, '');
		}
		// Strip flags with no grep equivalent
		rest = rest
			.replace(/\s*(?:-n|--line-number)\b/, '') // already in flags
			.replace(/\s*--json\b/, '') // no structured-output equivalent
			.replace(/\s*--glob\s+\S+/, '') // complex include pattern, skip
			.replace(/\s*--[\w-]+=?\S*/g, ''); // any remaining -- flags

		const body = rest.trim();
		// If body ends with a quoted pattern (no path following), default to current dir
		const needsPath = /['"]$/.test(body);
		return `grep ${flags.join(' ')} ${EXCLUDES} ${body}${needsPath ? ' .' : ''}`;
	}

	/**
	 * Build a PATH string that includes the package-local vendor/bin directory
	 * (populated by scripts/postinstall.mjs) and user-local bin directories.
	 *
	 * VENDOR_BIN takes priority so the pinned tool versions bundled with valora
	 * are used instead of whatever happens to be on the user's system PATH.
	 *
	 * Compatible with Linux, macOS, Windows, and devcontainer environments.
	 */
	private buildAugmentedPath(): string {
		const isWindows = process.platform === 'win32';
		const separator = isWindows ? ';' : ':';

		if (isWindows) {
			const home = process.env['USERPROFILE'] ?? process.env['HOME'] ?? 'C:\\Users\\node';
			const extras = [VENDOR_BIN, `${home}\\AppData\\Roaming\\npm`, `${home}\\AppData\\Local\\pnpm`];
			const current = process.env['PATH'] ?? 'C:\\Windows\\system32;C:\\Windows';
			return [...extras, current].join(separator);
		}

		const home = process.env['HOME'] ?? '/home/node';
		const extras = [VENDOR_BIN, `${home}/.local/bin`, `${home}/.npm-global/bin`, `${home}/.local/share/pnpm`];
		const current = process.env['PATH'] ?? '/usr/local/bin:/usr/bin:/bin';
		return [...extras, current].join(separator);
	}

	/**
	 * Resolve a command string, transparently translating rg to grep when
	 * ripgrep is not available on the user's system.
	 */
	private async resolveCommand(command: string): Promise<string> {
		if (/(?:^|\s)rg\s/.test(command) && !(await this.checkRgAvailable())) {
			const translated = ToolExecutionService.translateRgToGrep(command.trimStart());
			this.logger.debug(`rg not available, translating to: ${translated}`);
			return translated;
		}
		return command;
	}

	/**
	 * Execute a terminal command
	 */
	private async executeTerminalCmd(args: Record<string, unknown>): Promise<string> {
		const raw = args['command'] as string;
		const timeoutMs = (args['timeout_ms'] as number) ?? DEFAULT_TIMEOUT_MS;

		if (!raw) {
			throw new Error('run_terminal_cmd requires command argument');
		}

		const command = await this.resolveCommand(raw);
		this.logger.info(`Executing command: ${command}`);

		// Validate command against security blocklist
		const commandCheck = getCommandGuard().validate(command);
		if (!commandCheck.allowed) {
			return `Command blocked by security policy: ${commandCheck.reason}\n\nUse a different approach that does not involve blocked commands or patterns.`;
		}

		const credentialGuard = getCredentialGuard();

		try {
			const { stderr, stdout } = await execAsync(command, {
				cwd: this.workingDir,
				env: { ...credentialGuard.sanitiseEnvironment(process.env), PATH: this.buildAugmentedPath() },
				timeout: timeoutMs
			});

			const rawOutput = stdout + (stderr ? `\nStderr: ${stderr}` : '');
			const output = credentialGuard.scanOutput(rawOutput);

			const statsBefore = getCompressionStats();
			const compressed = compressTerminalOutput(command, output);
			const statsAfter = getCompressionStats();
			const filterSavedChars =
				statsAfter.inputChars - statsBefore.inputChars - (statsAfter.outputChars - statsBefore.outputChars);
			if (filterSavedChars > 0) {
				getMetricsCollector().incrementCounter('compression.terminal.saved_chars', filterSavedChars);
			}
			return compressed || 'Command completed successfully (no output)';
		} catch (error) {
			const execError = error as { code?: number; stderr?: string; stdout?: string };
			const output = [execError.stdout, execError.stderr].filter(Boolean).join('');

			const guidance = exitCodeOneGuidance(execError.code, command);
			if (guidance) return guidance;

			throw new Error(`Command failed: ${compressTerminalOutput(command, output) || (error as Error).message}`);
		}
	}

	/**
	 * List directory contents
	 */
	private executeListDir(args: Record<string, unknown>): Promise<string> {
		const path = (args['path'] as string) ?? '.';
		const fullPath = this.resolvePath(path);

		if (!existsSync(fullPath)) {
			return Promise.resolve(
				`Directory not found: ${path}\n\nVerify the path or use glob_file_search to find the correct location.`
			);
		}

		const stat = statSync(fullPath);
		if (!stat.isDirectory()) {
			return Promise.resolve(
				`Not a directory: ${path}\n\nThis path points to a file. Use read_file("${path}") to read it.`
			);
		}

		const entries = readdirSync(fullPath, { withFileTypes: true });
		const total = entries.length;
		const capped = entries.slice(0, MAX_LIST_DIR_ENTRIES);
		const formatted = capped.map((entry) => {
			const prefix = entry.isDirectory() ? '[DIR]' : '[FILE]';
			return `${prefix} ${entry.name}`;
		});

		if (total > MAX_LIST_DIR_ENTRIES) {
			formatted.push(`[... ${total - MAX_LIST_DIR_ENTRIES} more entries omitted — ${total} total]`);
		}

		return Promise.resolve(formatted.join('\n'));
	}

	/**
	 * Web search (placeholder - would integrate with actual web search)
	 */
	private executeWebSearch(args: Record<string, unknown>): Promise<string> {
		const query = args['query'] as string;

		if (!query) {
			return Promise.resolve('web_search requires query argument');
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
	 * Validate and resolve a path for write operations.
	 * Validates both the original path and the resolved full path against forbidden paths.
	 *
	 * @param path - The path to validate and resolve
	 * @param operation - The operation being attempted (e.g., "write to", "delete", "modify")
	 * @returns The resolved full path
	 * @throws Error if the path is in a forbidden location
	 */
	private validateAndResolvePath(path: string, operation: string): string {
		// Validate the original path
		validateNotForbiddenPath(path, operation);

		const fullPath = this.resolvePath(path);

		// Also validate the resolved path (catches absolute path manipulation)
		validateNotForbiddenPath(fullPath, operation);

		return fullPath;
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
 * Serialise MCP tool output and truncate to MAX_MCP_OUTPUT_CHARS using head+tail.
 * MCP servers are external and can return arbitrarily large payloads.
 */
function truncateMcpOutput(output: unknown): string {
	const text = typeof output === 'string' ? output : JSON.stringify(output);
	if (text.length <= MAX_MCP_OUTPUT_CHARS) return text;
	const HEAD = Math.floor(MAX_MCP_OUTPUT_CHARS * 0.8);
	const TAIL = MAX_MCP_OUTPUT_CHARS - HEAD;
	const omitted = text.length - HEAD - TAIL;
	return (
		text.substring(0, HEAD) + `\n\n[... ${omitted} characters omitted ...]\n\n` + text.substring(text.length - TAIL)
	);
}

/**
 * Returns true if a command is a search tool that exits with code 1 to signal
 * "no matches found" rather than an actual error.
 *
 * rg (ripgrep) and grep family: exit 0 = matches, exit 1 = no matches, exit 2 = error.
 * git grep follows the same convention.
 */
/**
 * If the command exited with code 1 and is a known search/exploratory tool,
 * return a guidance string instead of treating it as an error. Returns
 * undefined when the failure should propagate as a real error.
 */
function exitCodeOneGuidance(code: number | undefined, command: string): string | undefined {
	if (code !== 1) return undefined;
	if (isNoMatchesExitCode(command)) return `No matches found for: ${command}`;
	if (isExploratoryExitCode(command)) return `Command returned no results: ${command}`;
	return undefined;
}

function isNoMatchesExitCode(command: string): boolean {
	const trimmed = command.trimStart();
	return /^(rg|grep|egrep|fgrep|git grep)\b/.test(trimmed);
}

/**
 * Returns true if a command is an exploratory/probing command that commonly
 * exits with code 1 to signal "not found" or "false" rather than an error.
 *
 * - `which`, `command -v`, `type` — command existence checks
 * - `test`, `[` — file/condition tests
 * - `fd` — file finder (same convention as rg)
 * - Piped commands where the first segment is `cd` — directory probing
 */
export function isExploratoryExitCode(command: string): boolean {
	const trimmed = command.trimStart();

	// Direct exploratory commands
	if (/^(which|command\s+-v|type|test|fd)\b/.test(trimmed)) return true;

	// Shell test bracket syntax: [ -d /foo ] or [[ -f bar ]]
	if (/^\[{1,2}\s/.test(trimmed)) return true;

	// Piped commands starting with cd (directory probing)
	// e.g. "cd workspace && pwd" or "cd /some/path && which tsc"
	if (/^cd\b/.test(trimmed)) return true;

	return false;
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
