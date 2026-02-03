/**
 * Configuration schemas using Zod
 */

import { z } from 'zod';

import {
	DEFAULT_DAILY_FILE_MAX_SIZE_MB,
	DEFAULT_LOG_CLEANUP_INTERVAL_HOURS,
	DEFAULT_LOG_COMPRESS_AFTER_DAYS,
	DEFAULT_LOG_DRY_RUN,
	DEFAULT_LOG_MAX_AGE_DAYS,
	DEFAULT_LOG_MAX_FILES,
	DEFAULT_LOG_MAX_SIZE_MB,
	DEFAULT_LOG_RETENTION_ENABLED,
	DEFAULT_SESSION_CLEANUP_INTERVAL_HOURS,
	DEFAULT_SESSION_COMPRESS_AFTER_DAYS,
	DEFAULT_SESSION_DRY_RUN,
	DEFAULT_SESSION_MAX_AGE_DAYS,
	DEFAULT_SESSION_MAX_COUNT,
	DEFAULT_SESSION_MAX_SIZE_MB,
	DEFAULT_SESSION_RETENTION_ENABLED
} from './constants';

// Provider configuration schema
export const PROVIDER_CONFIG_SCHEMA = z.object({
	apiKey: z.string().optional(),
	baseUrl: z.string().url().optional(),
	default_model: z.string().optional(),
	max_retries: z.number().min(0).max(10).optional(),
	rate_limit: z
		.object({
			requests_per_minute: z.number().optional(),
			tokens_per_minute: z.number().optional()
		})
		.optional(),
	timeout_ms: z.number().min(1000).max(300000).optional(),
	// Vertex AI specific fields
	vertexAI: z.boolean().optional(),
	vertexProjectId: z.string().optional(),
	vertexRegion: z.string().optional()
});

// Providers configuration schema
export const PROVIDERS_CONFIG_SCHEMA = z.object({
	anthropic: PROVIDER_CONFIG_SCHEMA.optional(),
	cursor: PROVIDER_CONFIG_SCHEMA.optional(),
	google: PROVIDER_CONFIG_SCHEMA.optional(),
	moonshot: PROVIDER_CONFIG_SCHEMA.optional(),
	openai: PROVIDER_CONFIG_SCHEMA.optional(),
	xai: PROVIDER_CONFIG_SCHEMA.optional()
});

// Defaults configuration schema
export const DEFAULTS_CONFIG_SCHEMA = z.object({
	default_provider: z.string().optional(), // Store user's preferred provider
	// Dry-run mode configuration
	dry_run: z.boolean().default(false), // Enable dry-run mode by default
	dry_run_estimate_tokens: z.boolean().default(true), // Show token/cost estimates in dry-run
	dry_run_show_diffs: z.boolean().default(true), // Show diff previews in dry-run
	interactive: z.boolean().default(true),
	log_level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
	output_format: z.enum(['markdown', 'json', 'yaml']).default('markdown'),
	session_mode: z.boolean().default(true)
});

// Logging retention configuration schema
export const LOGGING_RETENTION_CONFIG_SCHEMA = z.object({
	// Max size for individual daily log files
	cleanup_interval_hours: z.number().min(1).max(168).default(DEFAULT_LOG_CLEANUP_INTERVAL_HOURS),
	compress_after_days: z.number().min(1).max(365).optional(),
	daily_file_max_size_mb: z.number().min(1).max(1000).default(DEFAULT_DAILY_FILE_MAX_SIZE_MB),
	// 1 day max
	dry_run: z.boolean().default(DEFAULT_LOG_DRY_RUN),
	enabled: z.boolean().default(DEFAULT_LOG_RETENTION_ENABLED),
	logs_path: z.string().optional(),
	// Override default logs directory
	max_age_days: z.number().min(1).max(365).optional(),
	max_files: z.number().min(1).max(10000).optional(),
	max_size_mb: z.number().min(1).max(10000).optional(), // 1 week max
	start_delay_minutes: z.number().min(0).max(1440).optional()
});

// Session retention configuration schema
export const SESSION_RETENTION_CONFIG_SCHEMA = z.object({
	cleanup_interval_hours: z.number().min(1).max(168).default(DEFAULT_SESSION_CLEANUP_INTERVAL_HOURS),
	compress_after_days: z.number().min(1).max(365).optional(),
	// 1 day max
	dry_run: z.boolean().default(DEFAULT_SESSION_DRY_RUN),
	enabled: z.boolean().default(DEFAULT_SESSION_RETENTION_ENABLED),
	max_age_days: z.number().min(1).max(365).optional(),
	max_count: z.number().min(1).max(10000).optional(),
	max_size_mb: z.number().min(1).max(10000).optional(), // 1 week max
	start_delay_minutes: z.number().min(0).max(1440).optional(),
	timeout: z.number().int().min(0).optional() // Session timeout in seconds
});

// Feature flags configuration schema
export const FEATURE_FLAGS_SCHEMA = z.object({
	agent_selection_analytics: z.boolean().default(false),
	agent_selection_fallback_reporting: z.boolean().default(false),
	agent_selection_monitoring: z.boolean().default(false),
	dynamic_agent_selection: z.boolean().default(false),
	dynamic_agent_selection_implement_only: z.boolean().default(true)
});

// Paths configuration schema
export const PATHS_CONFIG_SCHEMA = z.object({
	agents_dir: z.string().optional(),
	commands_dir: z.string().optional(),
	config_file: z.string().optional(),
	logs_dir: z.string().optional(),
	prompts_dir: z.string().optional(),
	sessions_dir: z.string().optional()
});

// Main configuration schema
export const CONFIG_SCHEMA = z.object({
	defaults: DEFAULTS_CONFIG_SCHEMA,
	features: FEATURE_FLAGS_SCHEMA.optional(),
	logging: LOGGING_RETENTION_CONFIG_SCHEMA.optional(),
	paths: PATHS_CONFIG_SCHEMA.optional(),
	providers: PROVIDERS_CONFIG_SCHEMA,
	sessions: SESSION_RETENTION_CONFIG_SCHEMA.optional()
});

// Type inference from schemas
export type Config = z.infer<typeof CONFIG_SCHEMA>;
export type DefaultsConfig = z.infer<typeof DEFAULTS_CONFIG_SCHEMA>;
export type FeatureFlags = z.infer<typeof FEATURE_FLAGS_SCHEMA>;
export type LoggingRetentionConfig = z.infer<typeof LOGGING_RETENTION_CONFIG_SCHEMA>;
export type PathsConfig = z.infer<typeof PATHS_CONFIG_SCHEMA>;
export type ProviderConfig = z.infer<typeof PROVIDER_CONFIG_SCHEMA>;
export type ProvidersConfig = z.infer<typeof PROVIDERS_CONFIG_SCHEMA>;
export type SessionRetentionConfig = z.infer<typeof SESSION_RETENTION_CONFIG_SCHEMA>;

// Default configuration
export const DEFAULT_CONFIG: Config = {
	defaults: {
		default_provider: undefined, // Will be set during setup or auto-configured in MCP context
		dry_run: false,
		dry_run_estimate_tokens: true,
		dry_run_show_diffs: true,
		interactive: true,
		log_level: 'info',
		output_format: 'markdown',
		session_mode: true
	},
	features: {
		agent_selection_analytics: false,
		agent_selection_fallback_reporting: false,
		agent_selection_monitoring: false,
		dynamic_agent_selection: false,
		dynamic_agent_selection_implement_only: true
	},
	logging: {
		cleanup_interval_hours: DEFAULT_LOG_CLEANUP_INTERVAL_HOURS,
		compress_after_days: DEFAULT_LOG_COMPRESS_AFTER_DAYS,
		daily_file_max_size_mb: DEFAULT_DAILY_FILE_MAX_SIZE_MB,
		dry_run: DEFAULT_LOG_DRY_RUN,
		enabled: DEFAULT_LOG_RETENTION_ENABLED,
		max_age_days: DEFAULT_LOG_MAX_AGE_DAYS,
		max_files: DEFAULT_LOG_MAX_FILES,
		max_size_mb: DEFAULT_LOG_MAX_SIZE_MB
	},
	paths: {
		agents_dir: 'agents',
		commands_dir: 'commands',
		config_file: 'config.json',
		logs_dir: 'logs',
		prompts_dir: 'prompts',
		sessions_dir: 'sessions'
	},
	providers: {},
	sessions: {
		cleanup_interval_hours: DEFAULT_SESSION_CLEANUP_INTERVAL_HOURS,
		compress_after_days: DEFAULT_SESSION_COMPRESS_AFTER_DAYS,
		dry_run: DEFAULT_SESSION_DRY_RUN,
		enabled: DEFAULT_SESSION_RETENTION_ENABLED,
		max_age_days: DEFAULT_SESSION_MAX_AGE_DAYS,
		max_count: DEFAULT_SESSION_MAX_COUNT,
		max_size_mb: DEFAULT_SESSION_MAX_SIZE_MB
	}
};
