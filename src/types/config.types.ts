/**
 * Configuration type definitions
 */

import type { LogLevel, OutputFormat } from './common.types';
import type { ExternalMCPServerConfig } from './mcp-client.types';
import type { ProviderName } from './provider-names.types';

export interface Config {
	defaults: DefaultsConfig;
	/** External MCP server configurations (overrides from registry) */
	external_mcp_servers?: ExternalMCPServersConfig;
	features?: FeatureFlags;
	paths?: PathsConfig;
	providers: ProvidersConfig;
	/**
	 * Scope configuration for project boundaries
	 * Controls which paths agents can access when working on user projects
	 */
	scope?: ScopeConfig;
}

/**
 * Configuration for external MCP servers
 */
export interface ConfigValidationError {
	field: string;
	message: string;
}

export interface ConfigValidationResult {
	errors: ConfigValidationError[];
	valid: boolean;
}

export interface DefaultsConfig {
	default_provider?: string;
	interactive?: boolean;
	log_level?: LogLevel;
	output_format?: OutputFormat;
	session_mode?: boolean;
}

export interface ExternalMCPServersConfig {
	/** Whether external MCP integration is enabled */
	enabled?: boolean;
	/** Path to external MCP registry file (default: data/external-mcp.default.json) */
	registry_path?: string;
	/** Server-specific overrides */
	servers?: Array<Partial<ExternalMCPServerConfig>>;
}

export interface FeatureFlags {
	agent_selection_analytics?: boolean;
	agent_selection_fallback_reporting?: boolean;
	agent_selection_monitoring?: boolean;
	dynamic_agent_selection?: boolean;
	dynamic_agent_selection_implement_only?: boolean;
}

export interface PathsConfig {
	agents_dir?: string;
	commands_dir?: string;
	config_file?: string;
	logs_dir?: string;
	prompts_dir?: string;
	sessions_dir?: string;
}

/**
 * Scope configuration for defining project boundaries
 * Controls which paths are included/excluded when VALORA operates on a codebase
 */
export interface ProviderConfig {
	apiKey?: string;
	baseUrl?: string;
	default_model?: string;
	max_retries?: number;
	rate_limit?: {
		requests_per_minute?: number;
		tokens_per_minute?: number;
	};
	timeout_ms?: number;
	// Vertex AI specific fields
	vertexAI?: boolean;
	vertexProjectId?: string;
	vertexRegion?: string;
}

export interface ScopeConfig {
	/**
	 * Glob patterns for paths to exclude from VALORA operations
	 * Default: ['.valora/**'] - excludes VALORA's project config
	 * Used to prevent agents from modifying VALORA infrastructure when working on user projects
	 */
	excludePaths?: string[];
	/**
	 * Glob patterns for paths to include (if specified, only these paths are considered)
	 * If not specified, all paths except excludePaths are included
	 */
	includePaths?: string[];
}

/**
 * Provider configurations
 * Keys match ProviderName enum values
 */
export interface ProvidersConfig {
	[ProviderName.ANTHROPIC]?: ProviderConfig;
	[ProviderName.CURSOR]?: ProviderConfig;
	[ProviderName.GOOGLE]?: ProviderConfig;
	[ProviderName.MOONSHOT]?: ProviderConfig;
	[ProviderName.OPENAI]?: ProviderConfig;
	[ProviderName.XAI]?: ProviderConfig;
}
