/**
 * CLI-related type definitions
 */

import type { LogLevel } from './logger.types';

/**
 * CLI flag values (string, boolean, or undefined)
 */
export type CLIFlagValue = boolean | string | undefined;

/**
 * CLI options object
 */
export interface CLIOptions {
	// Global flags
	agent?: string;
	dryRun?: boolean;
	interactive?: boolean;
	logLevel?: LogLevel;
	mode?: string;
	model?: string;
	'no-interactive'?: boolean;
	noInteractive?: boolean;
	output?: string;
	provider?: string;
	quiet?: boolean;
	sessionId?: string;
	verbose?: boolean;
	wizard?: boolean;

	// Retention policy flags
	cleanupInterval?: number;
	compressAfter?: number;
	logsPath?: string;
	maxAge?: number;
	maxFiles?: number;
	maxSize?: number;
	'no-retention'?: boolean;
	noRetention?: boolean;
	'retention-enabled'?: boolean;
	retentionDryRun?: boolean;
	retentionEnabled?: boolean;

	// Session retention policy flags
	'no-session-retention'?: boolean;
	noSessionRetention?: boolean;
	'session-retention-enabled'?: boolean;
	sessionCleanupInterval?: number;
	sessionCompressAfter?: number;
	sessionMaxAge?: number;
	sessionMaxCount?: number;
	sessionMaxSize?: number;
	sessionRetentionDryRun?: boolean;
	sessionRetentionEnabled?: boolean;

	// Isolation options
	'force-required'?: boolean;
	forceRequired?: boolean;
	isolated?: boolean;
	mockInputs?: Record<string, unknown>;
	'skip-validation'?: boolean;
	skipValidation?: boolean;
	stage?: string;

	// Activity tracking
	saveActivity?: string;
	showActivity?: boolean;
}

/**
 * MCP server CLI overrides
 */
export interface MCPServerOverrides {
	logLevel?: LogLevel;
	output?: string;
	quiet?: boolean;
	verbose?: boolean;
}

/**
 * Command line argument transformer function
 */
export type CLITransformer<T = unknown> = (value: string) => T;

/**
 * Command line argument validator function
 */
export type CLIValidator<T = unknown> = (value: T) => boolean;

/**
 * CLI option definition
 */
export interface CLIOptionDefinition {
	default?: unknown;
	description: string;
	required?: boolean;
	transform?: CLITransformer;
	type?: 'boolean' | 'number' | 'string';
	validate?: CLIValidator;
}
