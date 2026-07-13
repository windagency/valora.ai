/**
 * Configuration loader - loads config from file and environment variables
 */

import * as path from 'path';
import { isWorkspaceTrusted } from 'security/workspace-trust.service';
import { URL } from 'url';

import { getProviderRegistry } from 'llm/registry';
import { getLogger } from 'output/logger';
import { BuiltinProviders } from 'types/provider-names.types';
import { ConfigurationError } from 'utils/error-handler';
import { formatErrorMessage } from 'utils/error-utils';
import { ensureDir, fileExists, readJSON, writeJSON } from 'utils/file-utils';
import { getGlobalConfigDir, getPackageDataDir, getProjectConfigDir, getWorkspaceTrustCheckRoot } from 'utils/paths';

import {
	DEFAULT_DAILY_FILE_MAX_SIZE_MB,
	DEFAULT_LOG_CLEANUP_INTERVAL_HOURS,
	DEFAULT_LOG_DRY_RUN,
	DEFAULT_LOG_RETENTION_ENABLED,
	DEFAULT_SESSION_CLEANUP_INTERVAL_HOURS,
	DEFAULT_SESSION_DRY_RUN,
	DEFAULT_SESSION_RETENTION_ENABLED
} from './constants';
import { assertNoLegacyMemoryKeys } from './memory-config-guard';
import { type Config, CONFIG_SCHEMA, DEFAULT_CONFIG } from './schema';

/**
 * Common parsers for environment variables
 */
const ENV_PARSERS = {
	boolean: (v: string) => v === 'true',
	integer: (v: string) => parseInt(v, 10),
	string: (v: string) => v
} as const;

/**
 * Providers whose whole purpose is talking to a local/self-hosted endpoint —
 * `localhost`/`127.0.0.1`/`host.docker.internal`-shaped baseUrls are their
 * expected default, not a suspicious override. Every other provider is a
 * cloud API with no legitimate reason to point at a private/link-local
 * address at all.
 */
const LOCAL_FIRST_PROVIDERS = new Set<string>([BuiltinProviders.LOCAL, 'ollama']);

const CLOUD_METADATA_HOSTNAMES = new Set(['metadata', 'metadata.google.internal']);

export class ConfigLoader {
	private config: Config | null = null;
	private configPath: string;
	private rawConfig: null | Record<string, unknown> = null;

	constructor(configPath?: string) {
		this.configPath =
			configPath ??
			process.env['VALORA_CONFIG_PATH'] ??
			process.env['AI_CONFIG_PATH'] ??
			path.join(getPackageDataDir(), 'config.default.json');
	}

	/**
	 * Load configuration with multi-level cascade:
	 * 1. Package defaults (data/config.default.json)
	 * 2. Global user preferences (~/.valora/config.json)
	 * 3. Project-specific settings (.valora/config.json)
	 * 4. Environment variables (VALORA_* with AI_* alias)
	 * 5. CLI flags
	 */
	async load(cliOverrides?: Partial<Config>): Promise<Config> {
		if (this.config) {
			return this.config;
		}

		const packageConfig = await this.loadPackageConfig();
		const globalConfig = await this.loadGlobalConfig();
		const projectConfig = await this.loadProjectConfig();
		const envConfig = this.loadFromEnv();

		// Capture unknown top-level keys (e.g. plugin config) before mergeConfigs drops them.
		// Uses package → global → project precedence (last-wins), matching mergeConfigs priority.
		this.rawConfig = Object.assign(
			{},
			packageConfig as Record<string, unknown>,
			globalConfig as Record<string, unknown>,
			projectConfig as Record<string, unknown>
		);

		const globalCliFlags = getGlobalCliOverrides();
		const mergedConfig = this.mergeConfigs(
			DEFAULT_CONFIG,
			packageConfig,
			globalConfig,
			projectConfig,
			envConfig,
			globalCliFlags ?? {},
			cliOverrides ?? {}
		);

		// Reject the legacy `memory.*` shape with a targeted message before
		// Zod's strict parser surfaces a generic "unrecognized key" error.
		assertNoLegacyMemoryKeys(mergedConfig);

		try {
			this.config = CONFIG_SCHEMA.parse(mergedConfig);
			this.sanitizeProviderBaseUrls(this.config);
			this.autoMigrateDefaultProvider();
			return this.config;
		} catch (error) {
			throw new ConfigurationError('Invalid configuration', {
				errors: error
			});
		}
	}

	/**
	 * Applies regardless of trust level — a trusted-but-compromised config, a
	 * malicious plugin, or a misconfigured env var can set a provider's
	 * `baseUrl` just as easily as an untrusted project config can, and every
	 * provider sends the real API key as a plaintext Authorization header to
	 * whatever `baseUrl` names. Strips (doesn't throw on) an unsafe value so a
	 * single bad provider entry can't crash config load for the whole run.
	 */
	private sanitizeProviderBaseUrls(config: Config): void {
		if (!config.providers) return;

		for (const [providerKey, providerConfig] of Object.entries(config.providers)) {
			this.sanitizeSingleProviderBaseUrl(providerKey, providerConfig);
		}
	}

	private sanitizeSingleProviderBaseUrl(providerKey: string, providerConfig: undefined | { baseUrl?: string }): void {
		if (!providerConfig?.baseUrl) return;

		let parsed: URL;
		try {
			parsed = new URL(providerConfig.baseUrl);
		} catch {
			delete providerConfig.baseUrl;
			return;
		}

		const isSafeScheme = parsed.protocol === 'http:' || parsed.protocol === 'https:';
		const isLocalFirstProvider = LOCAL_FIRST_PROVIDERS.has(providerKey);
		const isUnsafeHost = !isLocalFirstProvider && isPrivateOrLinkLocalHost(parsed.hostname);
		if (isSafeScheme && !isUnsafeHost) return;

		getLogger().warn(
			`[Security] Provider "${providerKey}" declares an unsafe baseUrl (${isSafeScheme ? 'private/link-local/metadata host' : 'non-http(s) scheme'}) — ignored. The real API key would otherwise be sent to this endpoint.`
		);
		delete providerConfig.baseUrl;
	}

	/**
	 * Load package default config from the configured path
	 */
	private async loadPackageConfig(): Promise<Partial<Config>> {
		if (!fileExists(this.configPath)) {
			return {};
		}
		try {
			return await readJSON<Partial<Config>>(this.configPath);
		} catch (error) {
			throw new ConfigurationError(`Failed to parse config file: ${this.configPath}`, {
				error: formatErrorMessage(error)
			});
		}
	}

	/**
	 * Load global user config (~/.valora/config.json)
	 */
	private async loadGlobalConfig(): Promise<Partial<Config>> {
		const globalConfigPath = path.join(getGlobalConfigDir(), 'config.json');
		if (!fileExists(globalConfigPath)) {
			return {};
		}
		try {
			return await readJSON<Partial<Config>>(globalConfigPath);
		} catch {
			// Non-fatal: skip invalid global config
			return {};
		}
	}

	/**
	 * Load project config (.valora/config.json)
	 */
	private async loadProjectConfig(): Promise<Partial<Config>> {
		const projectConfigDir = getProjectConfigDir();
		if (!projectConfigDir) {
			return {};
		}
		const projectConfigPath = path.join(projectConfigDir, 'config.json');
		if (!fileExists(projectConfigPath)) {
			return {};
		}
		try {
			const projectConfig = await readJSON<Partial<Config>>(projectConfigPath);
			return this.stripUntrustedProviderOverrides(projectConfig);
		} catch {
			// Non-fatal: skip invalid project config
			return {};
		}
	}

	/**
	 * An untrusted project's config.json can override just a provider's
	 * `baseUrl` (or `defaults.default_provider`) with no trust gate at all —
	 * silently redirecting the real API key, resolved separately from a
	 * trusted global config/env var, to an attacker-controlled endpoint on
	 * the very next LLM call. Strip these two specific fields when the
	 * project isn't trusted; every other project-config field still applies
	 * normally. Deletes the keys outright rather than setting them to
	 * `undefined` — `mergeSingleConfig` spreads `config.defaults` directly
	 * (`{...result.defaults, ...config.defaults}`), so an explicit
	 * `default_provider: undefined` would overwrite a legitimate value from
	 * an earlier (trusted) layer instead of just not contributing one.
	 */
	private stripUntrustedProviderOverrides(projectConfig: Partial<Config>): Partial<Config> {
		const hasProviderOverride = projectConfig.providers !== undefined;
		const hasDefaultProviderOverride = projectConfig.defaults?.default_provider !== undefined;
		if (!hasProviderOverride && !hasDefaultProviderOverride) return projectConfig;

		const trustRoot = getWorkspaceTrustCheckRoot();
		if (isWorkspaceTrusted(trustRoot)) return projectConfig;

		getLogger().warn(
			'Untrusted project .valora/config.json declares a provider/default_provider override — ignored until the project is trusted (see `valora config trust`)'
		);

		const stripped: Partial<Config> = { ...projectConfig };
		delete stripped.providers;
		if (stripped.defaults) {
			stripped.defaults = { ...stripped.defaults };
			delete stripped.defaults.default_provider;
		}
		return stripped;
	}

	/**
	 * Emit a one-time warning for any provider key in config that has no registered descriptor.
	 * Call this after plugin initialisation so plugin-contributed providers are already registered.
	 */
	warnUnknownProviders(): void {
		if (!this.config?.providers) {
			return;
		}
		for (const key of Object.keys(this.config.providers)) {
			if (!getProviderRegistry().getDescriptor(key) && !warnedUnknownProviders.has(key)) {
				warnedUnknownProviders.add(key);
				getLogger().warn(
					`Provider "${key}" is configured but no plugin registers it — install the plugin or remove the entry`
				);
			}
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

		// Load local provider configuration from environment variables
		const localBaseUrl = process.env['LOCAL_BASE_URL'];
		if (localBaseUrl && config.providers) {
			(config.providers as Record<string, { baseUrl: string; default_model?: string }>)['local'] =
				this.buildLocalEnvConfig(localBaseUrl, process.env['LOCAL_DEFAULT_MODEL']);
		}

		// Load Vertex AI configuration for Anthropic provider
		const useVertex = process.env['CLAUDE_CODE_USE_VERTEX'];
		const vertexRegion = process.env['CLOUD_ML_REGION'];
		const vertexProjectId = process.env['ANTHROPIC_VERTEX_PROJECT_ID'];

		if (useVertex && config.providers) {
			config.providers['anthropic'] = {
				...(config.providers['anthropic'] ?? {}),
				vertexAI: useVertex === '1' || useVertex.toLowerCase() === 'true',
				vertexProjectId: vertexProjectId,
				vertexRegion: vertexRegion
			};
		}
	}

	/**
	 * Load defaults configuration from environment variables.
	 * Supports both VALORA_* and AI_* prefixes (VALORA_* takes precedence).
	 */
	private loadDefaultsFromEnv(config: Partial<Config>): void {
		const interactive = process.env['VALORA_INTERACTIVE'] ?? process.env['AI_INTERACTIVE'];
		const logLevel = process.env['VALORA_LOG_LEVEL'] ?? process.env['AI_LOG_LEVEL'];
		if (interactive === undefined && !logLevel) return;

		// DEFAULT_CONFIG.defaults carries an explicit own-property
		// `default_provider: undefined` — spreading it to seed this layer's
		// `defaults` object would otherwise silently reset an already-resolved
		// default_provider from an earlier, trusted layer back to undefined
		// once mergeSingleConfig shallow-spreads this layer on top (the same
		// clobbering class stripUntrustedProviderOverrides guards against for a
		// different, untrusted-layer cause — this function has no business
		// touching default_provider at all, so drop it immediately).
		config.defaults ??= { ...DEFAULT_CONFIG.defaults };
		delete config.defaults.default_provider;

		if (interactive !== undefined) {
			config.defaults.interactive = interactive === 'true';
		}
		if (logLevel) {
			config.defaults.log_level = logLevel as 'debug' | 'error' | 'info' | 'warn';
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
			autoUpdate: { ...DEFAULT_CONFIG.autoUpdate! },
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
		if (config.autoUpdate) {
			result.autoUpdate = { ...result.autoUpdate, ...config.autoUpdate };
		}
		if (config.providers) {
			result.providers = this.mergeProviderConfigs(result.providers, config.providers);
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
		if (config.hooks) {
			result.hooks = { ...result.hooks, ...config.hooks };
		}
		return result;
	}

	/**
	 * Deep-merge individual provider configs so higher-priority layers override
	 * specific fields without erasing fields absent from the higher-priority layer.
	 * Undefined values in the incoming config are skipped.
	 */
	private mergeProviderConfigs(
		base: Config['providers'],
		incoming: NonNullable<Partial<Config>>['providers']
	): Config['providers'] {
		const merged = { ...base };
		for (const [key, value] of Object.entries(incoming!)) {
			if (value !== undefined) {
				const existing = merged[key as keyof typeof merged] ?? {};
				const definedValues = Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
				merged[key as keyof typeof merged] = { ...existing, ...definedValues } as typeof existing;
			}
		}
		return merged;
	}

	/**
	 * Build local provider config from env vars, omitting default_model when unset
	 * to avoid overriding a lower-priority config layer's value.
	 */
	private buildLocalEnvConfig(baseUrl: string, model: string | undefined): { baseUrl: string; default_model?: string } {
		return model !== undefined ? { baseUrl, default_model: model } : { baseUrl };
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
	 * Get the merged config before schema validation — preserves keys that CONFIG_SCHEMA strips.
	 * Intended for plugin config consumption via api.config.extend().
	 */
	getRaw(): Record<string, unknown> {
		if (!this.rawConfig) {
			throw new ConfigurationError('Configuration not loaded. Call load() first.');
		}
		return this.rawConfig;
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
	 * Load raw config file content without cascade, env vars, or DEFAULT_CONFIG merging.
	 * Used by the setup wizard to preserve existing settings when updating config.
	 */
	async loadRaw(): Promise<Partial<Config>> {
		if (!fileExists(this.configPath)) {
			return {};
		}
		try {
			return await readJSON<Partial<Config>>(this.configPath);
		} catch {
			return {};
		}
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
			const parsed = CONFIG_SCHEMA.parse(mergedConfig);
			this.sanitizeProviderBaseUrls(parsed);
			return parsed;
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
		this.rawConfig = null;
		return this.load();
	}
}

/**
 * Best-effort check for a literal private/link-local/loopback host — string-
 * level only (no DNS resolution), so an arbitrary hostname that happens to
 * *resolve* to a private address isn't caught here. Still closes the primary
 * threat: a baseUrl override naming a private IP, `localhost`, or a
 * cloud-metadata hostname directly (exactly the shape a config override would
 * use), for any provider not in `LOCAL_FIRST_PROVIDERS`.
 */
function isPrivateOrLinkLocalHost(hostname: string): boolean {
	// URL.hostname keeps the brackets on an IPv6 literal (e.g. "[::1]").
	const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');

	if (host === 'localhost' || host.endsWith('.localhost')) return true;
	if (CLOUD_METADATA_HOSTNAMES.has(host)) return true;

	const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host);
	if (ipv4Match) return isPrivateOrLoopbackIpv4(Number(ipv4Match[1]), Number(ipv4Match[2]));

	return isPrivateOrLoopbackIpv6(host);
}

const IPV4_SINGLE_OCTET_PRIVATE_FIRSTS = new Set([0, 10, 127]);

/**
 * Deliberately NOT blocked here, despite being reserved by other RFCs: TEST-NET
 * (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24, RFC 5737), benchmarking
 * (198.18.0.0/15, RFC 2544), IETF protocol assignments (192.0.0.0/24, RFC 6890),
 * 6to4 relay anycast (192.88.99.0/24, RFC 3068), multicast (224.0.0.0/4) and
 * reserved/broadcast (240.0.0.0/4, 255.255.255.255/32). None of these host real
 * internal infrastructure the way RFC1918/loopback/link-local/CGNAT do — no
 * legitimate *or* attacker-controlled service listens on a documentation or
 * benchmarking address — so blocking them would guard against a copy-pasted
 * example config at best, not an actual SSRF target. Not worth the added
 * surface for this function's actual threat model.
 */
function isPrivateOrLoopbackIpv4(first: number, second: number): boolean {
	if (IPV4_SINGLE_OCTET_PRIVATE_FIRSTS.has(first)) return true;
	if (first === 172) return second >= 16 && second <= 31;
	if (first === 192) return second === 168;
	if (first === 169) return second === 254; // link-local, incl. cloud metadata
	if (first === 100) return second >= 64 && second <= 127; // RFC 6598 CGNAT, 100.64.0.0/10
	return false;
}

function isPrivateOrLoopbackIpv6(host: string): boolean {
	if (host === '::1' || host === '::') return true;
	if (/^fe[89ab][0-9a-f]:/.test(host)) return true; // IPv6 link-local, fe80::/10
	if (/^f[cd][0-9a-f]{2}:/.test(host)) return true; // IPv6 unique local, fc00::/7

	// Node's URL parser always normalises an IPv4-mapped IPv6 literal to
	// hex-group form (::ffff:169.254.169.254 -> ::ffff:a9fe:a9fe), never
	// dotted-decimal — a regex matching only the dotted form never fires
	// against real URL.hostname output. Only the first hex group is needed:
	// it encodes the address's first two octets, which is all
	// isPrivateOrLoopbackIpv4 checks.
	const hexMappedMatch = /^::ffff:([0-9a-f]{1,4}):[0-9a-f]{1,4}$/.exec(host);
	if (hexMappedMatch) {
		const highBits = parseInt(hexMappedMatch[1]!, 16);
		return isPrivateOrLoopbackIpv4((highBits >>> 8) & 0xff, highBits & 0xff);
	}

	// RFC 6052 NAT64/SIIT well-known prefix (64:ff9b::/96) embeds an IPv4
	// address in its low 32 bits — the identical embedding technique as the
	// ::ffff: IPv4-mapped form above, just a different prefix. Node
	// normalises this to hex-group form too, so the same first-hex-group
	// extraction applies.
	const nat64Match = /^64:ff9b::([0-9a-f]{1,4}):[0-9a-f]{1,4}$/.exec(host);
	if (nat64Match) {
		const highBits = parseInt(nat64Match[1]!, 16);
		return isPrivateOrLoopbackIpv4((highBits >>> 8) & 0xff, highBits & 0xff);
	}

	// Belt-and-suspenders for a dotted-decimal form, in case some other
	// caller ever passes one directly rather than through URL.hostname.
	const dottedMappedMatch = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(host);
	if (dottedMappedMatch) return isPrivateOrLinkLocalHost(dottedMappedMatch[1]!);

	return false;
}

// Tracks provider keys that have already been warned about in this process run
const warnedUnknownProviders = new Set<string>();

/**
 * Resets the warned-unknown-providers tracking set. Intended for use in tests only.
 */
export function resetUnknownProviderWarningsForTests(): void {
	warnedUnknownProviders.clear();
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
