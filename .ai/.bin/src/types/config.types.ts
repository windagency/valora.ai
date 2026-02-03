/**
 * Configuration type definitions
 */

import type { LogLevel, OutputFormat } from './common.types';
import type { ProviderName } from './provider-names.types';

export interface Config {
	defaults: DefaultsConfig;
	features?: FeatureFlags;
	paths?: PathsConfig;
	providers: ProvidersConfig;
}

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
