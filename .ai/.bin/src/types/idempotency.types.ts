/**
 * Idempotency Types
 *
 * Type definitions for idempotency support in tool execution.
 */

/**
 * Idempotency record stored for each executed operation
 */
export interface IdempotencyRecord {
	/** Unique idempotency key (hash of tool call parameters) */
	key: string;
	/** Tool name that was executed */
	tool_name: string;
	/** Cached result from the execution */
	result: IdempotencyResult;
	/** When the record was created */
	created_at: string;
	/** When the record expires (TTL) */
	expires_at: string;
	/** Hash of the input arguments for verification */
	args_hash: string;
	/** Optional session ID for scoping */
	session_id?: string;
}

/**
 * Cached result from an idempotent operation
 */
export interface IdempotencyResult {
	/** Whether the operation succeeded */
	success: boolean;
	/** The output from the tool execution */
	output: string;
	/** Error message if the operation failed */
	error?: string;
}

/**
 * Options for idempotency store operations
 */
export interface IdempotencyOptions {
	/** Time-to-live in milliseconds (default: 1 hour) */
	ttl_ms?: number;
	/** Session ID to scope the idempotency key */
	session_id?: string;
	/** Whether to force execution even if cached result exists */
	force_execute?: boolean;
}

/**
 * Result of checking idempotency
 */
export interface IdempotencyCheckResult {
	/** Whether a cached result was found */
	found: boolean;
	/** The cached record if found */
	record?: IdempotencyRecord;
	/** The generated idempotency key */
	key: string;
}

/**
 * Configuration for the idempotency store
 */
export interface IdempotencyStoreConfig {
	/** Directory to store idempotency records */
	store_dir: string;
	/** Default TTL in milliseconds */
	default_ttl_ms: number;
	/** Maximum number of records to keep */
	max_records: number;
	/** Interval for cleanup in milliseconds */
	cleanup_interval_ms: number;
}

/**
 * Tools that should be idempotent (state-changing operations)
 */
export const IDEMPOTENT_TOOLS = ['write', 'search_replace', 'delete_file', 'run_terminal_cmd'] as const;

export type IdempotentTool = (typeof IDEMPOTENT_TOOLS)[number];

/**
 * Check if a tool should be idempotent
 */
export function isIdempotentTool(toolName: string): toolName is IdempotentTool {
	return IDEMPOTENT_TOOLS.includes(toolName as IdempotentTool);
}
