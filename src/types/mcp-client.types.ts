/**
 * External MCP Client Type Definitions
 *
 * Types for connecting to external MCP servers (Playwright, Fetch, etc.)
 * with user approval workflows.
 */

/**
 * Connection types for external MCP servers
 */
export type MCPConnectionType = 'sse' | 'stdio' | 'websocket';

/**
 * Risk levels for security assessment
 */
export type MCPRiskLevel = 'critical' | 'high' | 'low' | 'medium';

/**
 * Approval memory options
 */
export type MCPApprovalMemory = 'always_ask' | 'persistent' | 'session';

/**
 * Capability types that an MCP server can have
 */
export type MCPCapability =
	| 'browser_automation'
	| 'code_execution'
	| 'database_access'
	| 'file_system'
	| 'network_requests'
	| 'process_spawn'
	| 'screen_capture'
	| 'system_access';

/**
 * Connection configuration for an external MCP server
 */
export interface MCPConnectionConfig {
	/** Arguments for the command (for stdio type) */
	args?: string[];
	/** Command to execute (for stdio type) */
	command?: string;
	/** Environment variables to set */
	env?: Record<string, string>;
	/** Headers for connection (for sse/websocket types) */
	headers?: Record<string, string>;
	/** Connection type */
	type: MCPConnectionType;
	/** URL for connection (for sse/websocket types) */
	url?: string;
	/** Working directory for the command */
	workingDirectory?: string;
}

/**
 * Security configuration for an external MCP server
 */
export interface MCPSecurityConfig {
	/** Whether audit logging is enabled */
	audit_logging: boolean;
	/** Capabilities this server has */
	capabilities: MCPCapability[];
	/** Maximum execution time in milliseconds */
	max_execution_ms?: number;
	/** Risk level assessment */
	risk_level: MCPRiskLevel;
	/** Allowed tool names (if empty, all tools allowed) */
	tool_allowlist?: string[];
	/** Blocked tool names */
	tool_blocklist?: string[];
}

/**
 * Configuration for an external MCP server
 */
export interface ExternalMCPServerConfig {
	/** Connection configuration */
	connection: MCPConnectionConfig;
	/** Server description */
	description: string;
	/** Whether this server is enabled */
	enabled?: boolean;
	/** Unique server identifier */
	id: string;
	/** Human-readable server name */
	name: string;
	/** How long to remember approval decisions */
	remember_approval: MCPApprovalMemory;
	/** Whether approval is required before connecting */
	requires_approval: boolean;
	/** Security configuration */
	security: MCPSecurityConfig;
	/** Tags for categorization */
	tags?: string[];
	/** Version of the server configuration */
	version?: string;
}

/**
 * Registry of available external MCP servers
 */
export interface ExternalMCPRegistry {
	/** Registry schema version */
	schema_version: string;
	/** Available servers */
	servers: ExternalMCPServerConfig[];
}

/**
 * Request for accessing an external MCP server
 */
export interface MCPAccessRequest {
	/** Reason for requesting access */
	reason: string;
	/** ID of the server being requested */
	serverId: string;
	/** Name of the agent/stage requesting access */
	requestedBy: string;
	/** Specific tools being requested (empty means all available) */
	requestedTools?: string[];
	/** Timestamp of the request */
	timestamp: Date;
}

/**
 * Result of an MCP approval decision
 */
export interface MCPApprovalResult {
	/** List of tools allowed (if filtered) */
	allowedTools?: string[];
	/** Whether the connection was approved */
	approved: boolean;
	/** User's decision type */
	decision: 'approve' | 'configure' | 'deny' | 'session';
	/** Additional notes from user */
	notes?: string;
	/** Whether to remember this decision */
	remember: boolean;
	/** Timestamp of the decision */
	timestamp: Date;
}

/**
 * Cached approval entry
 */
export interface MCPApprovalCacheEntry {
	/** List of allowed tools */
	allowedTools?: string[];
	/** Whether approved */
	approved: boolean;
	/** When the approval expires */
	expiresAt?: Date;
	/** Server ID */
	serverId: string;
	/** When the approval was granted */
	timestamp: Date;
}

/**
 * External MCP requirement for commands
 */
export interface ExternalMCPRequirement {
	/** Whether this MCP is optional (command can proceed without it) */
	optional?: boolean;
	/** Reason for requiring this MCP */
	reason: string;
	/** Required tools from this MCP */
	requiredTools?: string[];
	/** Server ID from the registry */
	serverId: string;
}

/**
 * Tool definition from an external MCP server
 */
export interface ExternalMCPTool {
	/** Tool description */
	description: string;
	/** Input schema (JSON Schema) */
	inputSchema: Record<string, unknown>;
	/** Tool name */
	name: string;
	/** Server ID this tool belongs to */
	serverId: string;
}

/**
 * Connected MCP server instance
 */
export interface ConnectedMCPServer {
	/** Available tools from this server */
	availableTools: ExternalMCPTool[];
	/** When the connection was established */
	connectedAt: Date;
	/** Server configuration */
	config: ExternalMCPServerConfig;
	/** Whether currently connected */
	isConnected: boolean;
	/** Server ID */
	serverId: string;
}

/**
 * Audit log entry for MCP operations
 */
export interface MCPAuditLogEntry {
	/** Additional details */
	details?: Record<string, unknown>;
	/** Duration in milliseconds (for tool calls) */
	duration_ms?: number;
	/** Error message if operation failed */
	error?: string;
	/** Type of operation */
	operation: 'approval' | 'connect' | 'disconnect' | 'error' | 'tool_call';
	/** Server ID */
	serverId: string;
	/** Whether operation succeeded */
	success: boolean;
	/** Timestamp of the operation */
	timestamp: Date;
	/** Tool name (for tool_call operations) */
	toolName?: string;
}

/**
 * Tool call request to an external MCP
 */
export interface ExternalMCPToolCallRequest {
	/** Tool arguments */
	args: Record<string, unknown>;
	/** Request ID for tracking */
	requestId: string;
	/** Server ID */
	serverId: string;
	/** Timeout in milliseconds */
	timeout_ms?: number;
	/** Tool name */
	toolName: string;
}

/**
 * Tool call result from an external MCP
 */
export interface ExternalMCPToolCallResult {
	/** Result content */
	content: unknown;
	/** Duration in milliseconds */
	duration_ms: number;
	/** Error if failed */
	error?: string;
	/** Request ID */
	requestId: string;
	/** Whether the call succeeded */
	success: boolean;
}
