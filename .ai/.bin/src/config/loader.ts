/**
 * Configuration loader - loads config from file and environment variables
 */

import * as path from 'path';
import { ConfigurationError } from 'utils/error-handler';
import { formatErrorMessage } from 'utils/error-utils';
import { ensureDir, fileExists, getAIRoot, readJSON, writeJSON } from 'utils/file-utils';

import {
	DEFAULT_DAILY_FILE_MAX_SIZE_MB,
	DEFAULT_LOG_CLEANUP_INTERVAL_HOURS,
	DEFAULT_LOG_DRY_RUN,
	DEFAULT_LOG_RETENTION_ENABLED,
	DEFAULT_SESSION_CLEANUP_INTERVAL_HOURS,
	DEFAULT_SESSION_DRY_RUN,
	DEFAULT_SESSION_RETENTION_ENABLED
} from './constants';
import { type Config, CONFIG_SCHEMA, DEFAULT_CONFIG } from './schema';

/**
 * Common parsers for environment variables
 */
const ENV_PARSERS = {
	boolean: (v: string) => v === 'true',
	integer: (v: string) => parseInt(v, 10),
	string: (v: string) => v
} as const;

export class ConfigLoader {
	private config: Config | null = null;
	private configPath: string;

	constructor(configPath?: string) {
		this.configPath =
			configPath ??
			process.env['AI_CONFIG_PATH'] ??
			path.join(getAIRoot(), DEFAULT_CONFIG.paths?.config_file ?? 'config.json');
	}

	/**
	 * Load configuration from file, environment variables, and CLI overrides
	 */
	async load(cliOverrides?: Partial<Config>): Promise<Config> {
		if (this.config) {
			return this.config;
		}

		let fileConfig: Partial<Config> = {};

		// Load from file if exists
		if (fileExists(this.configPath)) {
			try {
				fileConfig = await readJSON<Partial<Config>>(this.configPath);
			} catch (error) {
				throw new ConfigurationError(`Failed to parse config file: ${this.configPath}`, {
					error: formatErrorMessage(error)
				});
			}
		}

		// Merge with environment variables and global CLI overrides
		const envConfig = this.loadFromEnv();
		const globalOverrides = getGlobalCliOverrides();
		const mergedConfig = this.mergeConfigs(
			DEFAULT_CONFIG,
			fileConfig,
			envConfig,
			globalOverrides ?? {},
			cliOverrides ?? {}
		);

		// Validate
		try {
			this.config = CONFIG_SCHEMA.parse(mergedConfig);

			// Auto-migrate: set default_provider if missing but providers exist
			this.autoMigrateDefaultProvider();

			return this.config;
		} catch (error) {
			throw new ConfigurationError('Invalid configuration', {
				errors: error
			});
		}
	}

	/**
	 * Auto-migrate: set default_provider if missing but providers exist
	 */
	private autoMigrateDefaultProvider(): void {
		if (this.config && !this.config.defaults.default_provider && this.config.providers) {
			const configuredProviders = Object.keys(this.config.providers).filter(
				(key) => this.config?.providers[key as keyof typeof this.config.providers] !== undefined
			);
			if (configuredProviders.length > 0) {
				this.config.defaults.default_provider = configuredProviders[0];
				// Log migration for visibility
				console.info(`Auto-migrated config: set default_provider to '${configuredProviders[0]}'`);
			}
		}
	}

	/**
	 * Load configuration from environment variables
	 */
	private loadFromEnv(): Partial<Config> {
		const config: Partial<Config> = {
			providers: {}
		};

		this.loadProvidersFromEnv(config);
		this.loadDefaultsFromEnv(config);
		this.loadLoggingFromEnv(config);
		this.loadSessionsFromEnv(config);
		this.loadFeaturesFromEnv(config);

		return config;
	}

	/**
	 * Load provider configurations from environment variables
	 */
	private loadProvidersFromEnv(config: Partial<Config>): void {
		const providerEnvMapping = {
			anthropic: { apiKey: 'ANTHROPIC_API_KEY', model: 'ANTHROPIC_DEFAULT_MODEL' },
			google: { apiKey: 'GOOGLE_API_KEY', model: 'GOOGLE_DEFAULT_MODEL' },
			moonshot: { apiKey: 'MOONSHOT_API_KEY', model: 'MOONSHOT_DEFAULT_MODEL' },
			openai: { apiKey: 'OPENAI_API_KEY', model: 'OPENAI_DEFAULT_MODEL' },
			xai: { apiKey: 'XAI_API_KEY', model: 'XAI_DEFAULT_MODEL' }
		};

		for (const [provider, envVars] of Object.entries(providerEnvMapping)) {
			const apiKey = process.env[envVars.apiKey];
			if (apiKey && config.providers) {
				(config.providers as Record<string, { apiKey: string; default_model?: string }>)[provider] = {
					apiKey,
					default_model: process.env[envVars.model]
				};
			}
		}

		// Load Vertex AI configuration for Anthropic provider
		const useVertex = process.env['CLAUDE_CODE_USE_VERTEX'];
		const vertexRegion = process.env['CLOUD_ML_REGION'];
		const vertexProjectId = process.env['ANTHROPIC_VERTEX_PROJECT_ID'];

		if (useVertex && config.providers) {
			config.providers.anthropic = {
				...(config.providers.anthropic ?? {}),
				vertexAI: useVertex === '1' || useVertex.toLowerCase() === 'true',
				vertexProjectId: vertexProjectId,
				vertexRegion: vertexRegion
			};
		}
	}

	/**
	 * Load defaults configuration from environment variables
	 */
	private loadDefaultsFromEnv(config: Partial<Config>): void {
		if (process.env['AI_INTERACTIVE'] !== undefined) {
			config.defaults ??= { ...DEFAULT_CONFIG.defaults };
			config.defaults.interactive = process.env['AI_INTERACTIVE'] === 'true';
		}

		if (process.env['AI_LOG_LEVEL']) {
			config.defaults ??= { ...DEFAULT_CONFIG.defaults };
			config.defaults.log_level = process.env['AI_LOG_LEVEL'] as 'debug' | 'error' | 'info' | 'warn';
		}
	}

	/**
	 * Load logging configuration from environment variables
	 */
	private loadLoggingFromEnv(config: Partial<Config>): void {
		const envVars = [
			'AI_LOG_LOGS_PATH',
			'AI_LOG_RETENTION_ENABLED',
			'AI_LOG_MAX_AGE_DAYS',
			'AI_LOG_MAX_SIZE_MB',
			'AI_LOG_MAX_FILES',
			'AI_LOG_COMPRESS_AFTER_DAYS',
			'AI_LOG_DAILY_FILE_MAX_SIZE_MB',
			'AI_LOG_CLEANUP_INTERVAL_HOURS',
			'AI_LOG_DRY_RUN'
		];

		if (!this.hasAnyEnvVar(envVars)) {
			return;
		}

		config.logging ??= {
			cleanup_interval_hours: DEFAULT_LOG_CLEANUP_INTERVAL_HOURS,
			daily_file_max_size_mb: DEFAULT_DAILY_FILE_MAX_SIZE_MB,
			dry_run: DEFAULT_LOG_DRY_RUN,
			enabled: DEFAULT_LOG_RETENTION_ENABLED
		};

		this.applyEnvMapping(config.logging, {
			cleanup_interval_hours: { env: 'AI_LOG_CLEANUP_INTERVAL_HOURS', parser: ENV_PARSERS.integer },
			compress_after_days: { env: 'AI_LOG_COMPRESS_AFTER_DAYS', parser: ENV_PARSERS.integer },
			daily_file_max_size_mb: { env: 'AI_LOG_DAILY_FILE_MAX_SIZE_MB', parser: ENV_PARSERS.integer },
			dry_run: { env: 'AI_LOG_DRY_RUN', parser: ENV_PARSERS.boolean },
			enabled: { env: 'AI_LOG_RETENTION_ENABLED', parser: ENV_PARSERS.boolean },
			logs_path: { env: 'AI_LOG_LOGS_PATH', parser: ENV_PARSERS.string },
			max_age_days: { env: 'AI_LOG_MAX_AGE_DAYS', parser: ENV_PARSERS.integer },
			max_files: { env: 'AI_LOG_MAX_FILES', parser: ENV_PARSERS.integer },
			max_size_mb: { env: 'AI_LOG_MAX_SIZE_MB', parser: ENV_PARSERS.integer }
		});
	}

	/**
	 * Load sessions configuration from environment variables
	 */
	private loadSessionsFromEnv(config: Partial<Config>): void {
		const envVars = [
			'AI_SESSION_RETENTION_ENABLED',
			'AI_SESSION_MAX_AGE_DAYS',
			'AI_SESSION_MAX_SIZE_MB',
			'AI_SESSION_MAX_COUNT',
			'AI_SESSION_COMPRESS_AFTER_DAYS',
			'AI_SESSION_CLEANUP_INTERVAL_HOURS',
			'AI_SESSION_DRY_RUN'
		];

		if (!this.hasAnyEnvVar(envVars)) {
			return;
		}

		config.sessions ??= {
			cleanup_interval_hours: DEFAULT_SESSION_CLEANUP_INTERVAL_HOURS,
			dry_run: DEFAULT_SESSION_DRY_RUN,
			enabled: DEFAULT_SESSION_RETENTION_ENABLED
		};

		this.applyEnvMapping(config.sessions, {
			cleanup_interval_hours: { env: 'AI_SESSION_CLEANUP_INTERVAL_HOURS', parser: ENV_PARSERS.integer },
			compress_after_days: { env: 'AI_SESSION_COMPRESS_AFTER_DAYS', parser: ENV_PARSERS.integer },
			dry_run: { env: 'AI_SESSION_DRY_RUN', parser: ENV_PARSERS.boolean },
			enabled: { env: 'AI_SESSION_RETENTION_ENABLED', parser: ENV_PARSERS.boolean },
			max_age_days: { env: 'AI_SESSION_MAX_AGE_DAYS', parser: ENV_PARSERS.integer },
			max_count: { env: 'AI_SESSION_MAX_COUNT', parser: ENV_PARSERS.integer },
			max_size_mb: { env: 'AI_SESSION_MAX_SIZE_MB', parser: ENV_PARSERS.integer }
		});
	}

	/**
	 * Load feature flags from environment variables
	 */
	private loadFeaturesFromEnv(config: Partial<Config>): void {
		const featureEnvMapping = {
			agent_selection_analytics: { env: 'AI_FEATURE_AGENT_SELECTION_ANALYTICS', parser: ENV_PARSERS.boolean },
			agent_selection_fallback_reporting: {
				env: 'AI_FEATURE_AGENT_SELECTION_FALLBACK_REPORTING',
				parser: ENV_PARSERS.boolean
			},
			agent_selection_monitoring: { env: 'AI_FEATURE_AGENT_SELECTION_MONITORING', parser: ENV_PARSERS.boolean },
			dynamic_agent_selection: { env: 'AI_FEATURE_DYNAMIC_AGENT_SELECTION', parser: ENV_PARSERS.boolean },
			dynamic_agent_selection_implement_only: {
				env: 'AI_FEATURE_DYNAMIC_AGENT_SELECTION_IMPLEMENT_ONLY',
				parser: ENV_PARSERS.boolean
			}
		};

		const envVars = Object.values(featureEnvMapping).map((mapping) => mapping.env);

		if (!this.hasAnyEnvVar(envVars)) {
			return;
		}

		config.features ??= {
			agent_selection_analytics: false,
			agent_selection_fallback_reporting: false,
			agent_selection_monitoring: false,
			dynamic_agent_selection: false,
			dynamic_agent_selection_implement_only: true
		};

		this.applyEnvMapping(config.features, featureEnvMapping);
	}

	/**
	 * Merge multiple config objects
	 */
	private mergeConfigs(...configs: Array<Partial<Config>>): Config {
		const merged: Config = {
			defaults: { ...DEFAULT_CONFIG.defaults },
			features: { ...DEFAULT_CONFIG.features! },
			paths: { ...DEFAULT_CONFIG.paths },
			providers: {}
		};

		return configs.reduce<Config>((result, config) => this.mergeSingleConfig(result, config), merged);
	}

	/**
	 * Merge a single config into the result
	 */
	private mergeSingleConfig(result: Config, config: Partial<Config>): Config {
		if (config.providers) {
			result.providers = { ...result.providers, ...config.providers };
		}
		if (config.defaults) {
			result.defaults = { ...result.defaults, ...config.defaults };
		}
		if (config.paths) {
			result.paths = { ...result.paths, ...config.paths };
		}
		if (config.logging) {
			result.logging = { ...result.logging, ...config.logging };
		}
		if (config.sessions) {
			result.sessions = { ...result.sessions, ...config.sessions };
		}
		if (config.features) {
			result.features = this.mergeFeatures(config.features, result.features!);
		}
		return result;
	}

	/**
	 * Merge feature flags
	 */
	private mergeFeatures(
		configFeatures: NonNullable<Partial<Config['features']>>,
		resultFeatures: NonNullable<Config['features']>
	): NonNullable<Config['features']> {
		return {
			agent_selection_analytics: configFeatures.agent_selection_analytics ?? resultFeatures.agent_selection_analytics,
			agent_selection_fallback_reporting:
				configFeatures.agent_selection_fallback_reporting ?? resultFeatures.agent_selection_fallback_reporting,
			agent_selection_monitoring:
				configFeatures.agent_selection_monitoring ?? resultFeatures.agent_selection_monitoring,
			dynamic_agent_selection: configFeatures.dynamic_agent_selection ?? resultFeatures.dynamic_agent_selection,
			dynamic_agent_selection_implement_only:
				configFeatures.dynamic_agent_selection_implement_only ?? resultFeatures.dynamic_agent_selection_implement_only
		};
	}

	/**
	 * Check if any of the environment variables exist
	 */
	private hasAnyEnvVar(envVars: string[]): boolean {
		return envVars.some((envVar) => process.env[envVar] !== undefined);
	}

	/**
	 * Apply environment variable mapping to a config section
	 */
	private applyEnvMapping<T extends Record<string, unknown>>(
		target: T,
		mapping: Record<string, { env: string; parser: (value: string) => unknown }>
	): void {
		for (const [key, { env, parser }] of Object.entries(mapping)) {
			const value = process.env[env];
			if (value) {
				target[key as keyof T] = parser(value) as T[keyof T];
			}
		}
	}

	/**
	 * Save configuration to file
	 */
	async save(config: Config): Promise<void> {
		try {
			await ensureDir(path.dirname(this.configPath));
			await writeJSON(this.configPath, config);
			this.config = config;
		} catch (error) {
			throw new ConfigurationError(`Failed to save config to ${this.configPath}`, {
				error: (error as Error).message
			});
		}
	}

	/**
	 * Get current configuration
	 */
	get(): Config {
		if (!this.config) {
			throw new ConfigurationError('Configuration not loaded. Call load() first.');
		}
		return this.config;
	}

	/**
	 * Check if configuration file exists
	 */
	exists(): boolean {
		return fileExists(this.configPath);
	}

	/**
	 * Get configuration file path
	 */
	getConfigPath(): string {
		return this.configPath;
	}

	/**
	 * Load configuration from a specific file path
	 */
	async loadFromPath(filePath: string): Promise<Config> {
		try {
			const fileConfig = await readJSON<Partial<Config>>(filePath);

			// Merge with environment variables
			const envConfig = this.loadFromEnv();
			const mergedConfig = this.mergeConfigs(DEFAULT_CONFIG, fileConfig, envConfig);

			// Validate
			return CONFIG_SCHEMA.parse(mergedConfig);
		} catch (error) {
			throw new ConfigurationError(`Failed to parse config file: ${filePath}`, {
				error: (error as Error).message
			});
		}
	}

	/**
	 * Reload configuration
	 */
	async reload(): Promise<Config> {
		this.config = null;
		return this.load();
	}
}

// Singleton instance
let loaderInstance: ConfigLoader | null = null;

// Global CLI overrides that can be set before configuration loading
let globalCliOverrides: null | Partial<Config> = null;

export function getConfigLoader(configPath?: string): ConfigLoader {
	loaderInstance ??= new ConfigLoader(configPath);
	return loaderInstance;
}

/**
 * Set global CLI overrides that will be applied to all configuration loading
 */
export function setGlobalCliOverrides(overrides: Partial<Config>): void {
	globalCliOverrides = overrides;
}

/**
 * Get current global CLI overrides
 */
export function getGlobalCliOverrides(): null | Partial<Config> {
	return globalCliOverrides;
}
