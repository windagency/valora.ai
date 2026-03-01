/**
 * CLI Configuration Builder
 *
 * Provides type-safe mapping of CLI options to configuration objects.
 * Eliminates manual flag parsing and reduces code duplication.
 */

import type { Config, LoggingRetentionConfig, SessionRetentionConfig } from 'config/schema';
/**
 * CLI Configuration Builder Class
 *
 * Handles type-safe mapping of CLI options to configuration objects
 */
import type { CLIOptions } from 'types/cli.types';

/**
 * Mapping configuration for CLI options to config properties
 */
interface CliOptionMapping {
	/** CLI option name */
	optionName: string;
	/** Target config property path (dot notation) */
	configPath: string;
	/** Transform function for the value */
	transform?: (value: boolean | number | Record<string, unknown> | string) => unknown;
	/** Validation function */
	validate?: (value: unknown) => boolean;
}

export class CliConfigBuilder {
	private readonly options: CLIOptions;

	constructor(cliOptions: CLIOptions) {
		this.options = cliOptions;
	}

	/**
	 * Build logging retention configuration from CLI options
	 */
	buildLoggingConfig(): Partial<LoggingRetentionConfig> {
		const mappings: CliOptionMapping[] = [
			{ configPath: 'enabled', optionName: 'retentionEnabled' },
			{ configPath: 'enabled', optionName: 'noRetention', transform: () => false },
			{ configPath: 'logs_path', optionName: 'logsPath' },
			{ configPath: 'max_age_days', optionName: 'maxAge' },
			{ configPath: 'max_size_mb', optionName: 'maxSize' },
			{ configPath: 'max_files', optionName: 'maxFiles' },
			{ configPath: 'compress_after_days', optionName: 'compressAfter' },
			{ configPath: 'cleanup_interval_hours', optionName: 'cleanupInterval' },
			{ configPath: 'dry_run', optionName: 'retentionDryRun' }
		];

		return this.buildConfigFromMappings<LoggingRetentionConfig>(mappings);
	}

	/**
	 * Build session retention configuration from CLI options
	 */
	buildSessionConfig(): Partial<SessionRetentionConfig> {
		const mappings: CliOptionMapping[] = [
			{ configPath: 'enabled', optionName: 'sessionRetentionEnabled' },
			{ configPath: 'enabled', optionName: 'noSessionRetention', transform: () => false },
			{ configPath: 'max_age_days', optionName: 'sessionMaxAge' },
			{ configPath: 'max_size_mb', optionName: 'sessionMaxSize' },
			{ configPath: 'max_count', optionName: 'sessionMaxCount' },
			{ configPath: 'compress_after_days', optionName: 'sessionCompressAfter' },
			{ configPath: 'cleanup_interval_hours', optionName: 'sessionCleanupInterval' },
			{ configPath: 'dry_run', optionName: 'sessionRetentionDryRun' }
		];

		return this.buildConfigFromMappings<SessionRetentionConfig>(mappings);
	}

	/**
	 * Build complete CLI configuration overrides
	 */
	buildCliOverrides(): Partial<Config> {
		const overrides: Partial<Config> = {};
		const loggingConfig = this.buildLoggingConfig();
		const sessionConfig = this.buildSessionConfig();

		if (Object.keys(loggingConfig).length > 0) {
			overrides.logging = loggingConfig as LoggingRetentionConfig;
		}

		if (Object.keys(sessionConfig).length > 0) {
			overrides.sessions = sessionConfig as SessionRetentionConfig;
		}

		return overrides;
	}

	/**
	 * Validate CLI option combinations
	 */
	validateOptionCombinations(): { errors: string[]; valid: boolean } {
		const errors: string[] = [];

		// Validate logging retention options
		if (this.hasConflictingRetentionOptions()) {
			errors.push('Cannot specify both --retention-enabled and --no-retention');
		}

		// Validate session retention options
		if (this.hasConflictingSessionRetentionOptions()) {
			errors.push('Cannot specify both --session-retention-enabled and --no-session-retention');
		}

		// Validate numeric options are positive
		const numericValidations = [
			{ name: 'max-age', option: 'maxAge' },
			{ name: 'max-size', option: 'maxSize' },
			{ name: 'max-files', option: 'maxFiles' },
			{ name: 'compress-after', option: 'compressAfter' },
			{ name: 'cleanup-interval', option: 'cleanupInterval' },
			{ name: 'session-max-age', option: 'sessionMaxAge' },
			{ name: 'session-max-size', option: 'sessionMaxSize' },
			{ name: 'session-max-count', option: 'sessionMaxCount' },
			{ name: 'session-compress-after', option: 'sessionCompressAfter' },
			{ name: 'session-cleanup-interval', option: 'sessionCleanupInterval' }
		];

		// Validate numeric options using forEach and filter for invalid values
		numericValidations.forEach(({ name, option }) => {
			const value = this.options[option as keyof CLIOptions];
			if (value !== undefined && (typeof value !== 'number' || value <= 0)) {
				errors.push(`Option --${name} must be a positive number, got: ${value}`);
			}
		});

		return {
			errors,
			valid: errors.length === 0
		};
	}

	/**
	 * Generic method to build config from mappings
	 */
	private buildConfigFromMappings<T>(mappings: CliOptionMapping[]): Partial<T> {
		const config: Partial<T> = {};

		// Use forEach to process each mapping
		mappings.forEach((mapping) => {
			const optionValue = this.options[mapping.optionName as keyof CLIOptions];

			if (optionValue !== undefined) {
				// Apply validation if provided
				if (mapping.validate && !mapping.validate(optionValue)) {
					return; // Skip invalid values
				}

				// Apply transformation if provided
				const finalValue = mapping.transform ? mapping.transform(optionValue) : optionValue;

				// Set value at config path
				this.setNestedProperty(config, mapping.configPath, finalValue);
			}
		});

		return config;
	}

	/**
	 * Set a nested property in an object using dot notation
	 */
	private setNestedProperty(obj: Record<string, unknown>, path: string, value: unknown): void {
		const keys = path.split('.');

		// Use reduce to navigate/create nested structure
		const target = keys.slice(0, -1).reduce<Record<string, unknown>>((current, key) => {
			if (!(key in current)) {
				current[key] = {};
			}
			return current[key] as Record<string, unknown>;
		}, obj);

		// Safely access the last key with proper null check
		const lastKey = keys[keys.length - 1];
		if (lastKey !== undefined) {
			target[lastKey] = value;
		}
	}

	/**
	 * Check for conflicting retention options
	 */
	private hasConflictingRetentionOptions(): boolean {
		return this.options.retentionEnabled !== undefined && this.options.noRetention !== undefined;
	}

	/**
	 * Check for conflicting session retention options
	 */
	private hasConflictingSessionRetentionOptions(): boolean {
		return this.options.sessionRetentionEnabled !== undefined && this.options.noSessionRetention !== undefined;
	}
}
