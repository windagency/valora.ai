/**
 * Command type definitions
 */

import type { MCPTool } from './mcp-registry.types';
import type { ModelNameValue } from './provider-names.types';

/**
 * Agent role identifier.
 * Extensible via registry.json agent definitions — new roles for other
 * languages/frameworks can be added without code changes.
 */
export type AgentRole = string;

/**
 * AI Model names - uses centralized model registry
 * Note: This includes legacy models that may still be in command definitions
 */
export type AIModel = 'gpt-5-codex' | 'gpt-5-thinking-high' | ModelNameValue;

/**
 * Built-in tools available to commands
 */
export type BuiltInTool =
	| 'codebase_search'
	| 'delete_file'
	| 'file_outline'
	| 'find_references'
	| 'get_diagnostics'
	| 'get_type_info'
	| 'glob_file_search'
	| 'goto_definition'
	| 'grep'
	| 'hover_info'
	| 'list_dir'
	| 'query_session'
	| 'read_file'
	| 'request_context'
	| 'run_terminal_cmd'
	| 'search_replace'
	| 'smart_context'
	| 'symbol_search'
	| 'web_search'
	| 'write';

/**
 * External MCP tools available to commands.
 * Derived from external-mcp.json registry for maintainability.
 * @see mcp-registry.types.ts
 */
export type { MCPTool } from './mcp-registry.types';
export { getServerIdFromTool, isValidMCPTool } from './mcp-registry.types';

/**
 * All tools available to commands (built-in + MCP)
 */
export type AllowedTool = BuiltInTool | MCPTool;

/**
 * Check if a tool is an MCP tool (starts with mcp_ prefix)
 */
export function isMCPTool(tool: string): tool is MCPTool {
	return tool.startsWith('mcp_');
}

/**
 * Extract server ID from MCP tool name
 * e.g., 'mcp_playwright' -> 'playwright'
 */
export type CacheStrategy = 'adaptive' | 'none' | 'pipeline' | 'stage';

export interface CommandDefinition extends CommandMetadata {
	content: string;
}

export interface CommandExecutionContext {
	args: string[];
	commandName: string;
	flags: Record<string, boolean | string>;
	sessionId?: string;
}

export interface CommandIsolationMode {
	/**
	 * Full pipeline execution (current behaviour)
	 */
	pipeline: boolean;
	/**
	 * Execute specific stages only
	 */
	stages: boolean;
	/**
	 * Execute single stage with isolation
	 */
	isolated: boolean;
}

export interface CommandMetadata {
	agent?: AgentRole; // Optional when dynamic_agent_selection is true
	agent_selection_criteria?: string[];
	'allowed-tools': AllowedTool[];
	'argument-hint'?: string;
	deprecated?: boolean;
	description: string;
	dynamic_agent_selection?: boolean;
	experimental?: boolean;
	fallback_agent?: AgentRole;
	/**
	 * Knowledge files to load from knowledge-base/ directory for this command.
	 * These are loaded selectively to avoid consuming unnecessary tokens.
	 *
	 * Examples:
	 * - ['FUNCTIONAL.md'] - Load functional specifications
	 * - ['PRD.md'] - Load product requirements document
	 * - ['PLAN-*.md'] - Load latest plan file (glob pattern, sorted by modification time)
	 * - ['PRD.md', 'FUNCTIONAL.md'] - Load multiple files
	 *
	 * Files are loaded in order specified. Glob patterns return files sorted by
	 * modification time (most recent first).
	 */
	knowledge_files?: string[];
	model: AIModel;
	name: string;
	prompts: PromptsPipeline;
	/**
	 * Enable automatic stash protection for uncommitted changes.
	 * When true, the command will prompt to stash uncommitted changes before
	 * execution and restore them after completion.
	 *
	 * This is useful for commands that run git analysis operations that may
	 * inadvertently modify the working tree state.
	 */
	stash_protection?: boolean;
}

export interface CommandResult {
	duration_ms: number;
	error?: string;
	outputs: Record<string, unknown>;
	stages: StageOutput[];
	success: boolean;
}

export interface IsolatedExecutionOptions {
	/**
	 * Execute only specific stages instead of full pipeline
	 */
	stages?: string[];
	/**
	 * Skip pipeline validation (for isolated stage execution)
	 */
	skipValidation?: boolean;
	/**
	 * Provide mock inputs for isolated execution
	 */
	mockInputs?: Record<string, Record<string, unknown>>;
	/**
	 * Override stage requirements for testing
	 */
	forceRequired?: boolean;
}

/**
 * Controls how tool failures affect stage success.
 * - 'strict': all failures count toward hard-stop (default for code/test/refactor)
 * - 'tolerant': only fatal (mutating) failures count toward hard-stop (default for context/review)
 * - 'lenient': never hard-stop; stage always completes (possibly degraded)
 */
export type FailurePolicy = 'lenient' | 'strict' | 'tolerant';

export type MergeStrategy = 'conditional' | 'parallel' | 'sequential' | 'waterfall';

/**
 * Extract server ID from MCP tool name
 * e.g., 'mcp_playwright' -> 'playwright'
 * e.g., 'mcp_chrome_devtools' -> 'chrome-devtools'
 */
export function extractMCPServerId(tool: MCPTool): string {
	return tool.replace('mcp_', '').replace(/_/g, '-');
}

/**
 * Cache configuration for a pipeline stage
 */
export interface PipelineStage {
	/** Opt this stage into batch processing when --batch flag is set */
	batch?: boolean;
	/** Cache configuration for this stage */
	cache?: PipelineStageCacheConfig;
	conditional?: string;
	/**
	 * Controls how tool failures affect stage success.
	 * Defaults vary by stage type — see DEFAULT_FAILURE_POLICY in stage-executor.ts.
	 */
	failure_policy?: FailurePolicy;
	inputs?: Record<string, string>;
	/**
	 * Maximum number of tool-call failures before hard-stopping the stage.
	 * A failure is any tool result whose content starts with "Error:". Guidance
	 * responses (file-not-found hints, no-matches, etc.) are NOT counted.
	 * Overrides the default of 5 (MAX_TOOL_FAILURES_BEFORE_HARD_STOP).
	 */
	max_tool_failures?: number;
	/**
	 * Maximum number of tool-call iterations before forcing a final structured
	 * output. Increase for stages that legitimately need many tool calls (e.g.
	 * writing many test files, updating many documentation blocks).
	 * Overrides the default of 20.
	 */
	max_tool_iterations?: number;
	outputs?: string[];
	parallel?: boolean;
	prompt: string;
	required: boolean;
	/** Per-stage retry configuration. Only applies to sequential stages. */
	retry?: StageRetryConfig;
	stage: StageType;
	timeout_ms?: number;
}

export interface PipelineStageCacheConfig {
	/** Whether caching is enabled for this stage */
	enabled: boolean;
	/** TTL in milliseconds (default: 1 hour) */
	ttl_ms?: number;
	/** Input keys to use for cache key generation (default: all inputs) */
	cache_key_inputs?: string[];
	/** File paths to monitor for changes (invalidates cache when files change) */
	file_dependencies?: string[];
}

export interface PromptsPipeline {
	cache_strategy: CacheStrategy;
	merge_strategy: MergeStrategy;
	pipeline: PipelineStage[];
	retry_policy?: RetryPolicy;
	rollback_on_failure?: string;
}

export interface RetryPolicy {
	backoff_ms: number;
	max_attempts: number;
	retry_on: RetryReason[];
}

export type RetryReason = 'error' | 'timeout' | 'validation_failed';

export interface StageOutput {
	duration_ms: number;
	error?: string;
	metadata?: Record<string, unknown>;
	/** The actual model name used by the provider for this stage */
	model?: string;
	outputs: Record<string, unknown>;
	prompt: string;
	stage: string;
	success: boolean;
}

export interface StageRetryConfig {
	/** Delay in ms between attempts (default: 0) */
	delay_ms?: number;
	/** Maximum number of attempts including the first (default: 1 = no retry) */
	maxAttempts?: number;
}

export type StageType =
	| 'breakdown'
	| 'code'
	| 'context'
	| 'deployment'
	| 'documentation'
	| 'maintenance'
	| 'onboard'
	| 'plan'
	| 'refactor'
	| 'review'
	| 'test';
