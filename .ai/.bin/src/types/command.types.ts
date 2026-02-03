/**
 * Command type definitions
 */

import type { ModelNameValue } from './provider-names.types';

export type AgentRole =
	| 'asserter'
	| 'lead'
	| 'platform-engineer'
	| 'product-manager'
	| 'qa'
	| 'secops-engineer'
	| 'software-engineer-typescript'
	| 'software-engineer-typescript-backend'
	| 'software-engineer-typescript-frontend'
	| 'software-engineer-typescript-frontend-react'
	| 'ui-ux-designer';

/**
 * AI Model names - uses centralized model registry
 * Note: This includes legacy models that may still be in command definitions
 */
export type AIModel = 'gpt-5-codex' | 'gpt-5-thinking-high' | ModelNameValue;

export type AllowedTool =
	| 'codebase_search'
	| 'delete_file'
	| 'glob_file_search'
	| 'grep'
	| 'list_dir'
	| 'mcp_tool_call'
	| 'query_session'
	| 'read_file'
	| 'run_terminal_cmd'
	| 'search_replace'
	| 'web_search'
	| 'write';

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

export type MergeStrategy = 'conditional' | 'parallel' | 'sequential' | 'waterfall';

/**
 * Cache configuration for a pipeline stage
 */
export interface PipelineStage {
	/** Cache configuration for this stage */
	cache?: PipelineStageCacheConfig;
	conditional?: string;
	inputs?: Record<string, string>;
	outputs?: string[];
	parallel?: boolean;
	prompt: string;
	required: boolean;
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
	outputs: Record<string, unknown>;
	prompt: string;
	stage: string;
	success: boolean;
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
