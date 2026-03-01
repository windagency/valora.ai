/**
 * Type definitions for CLI Options
 *
 * These types replace generic Record<string, unknown> to provide type safety
 * and eliminate noPropertyAccessFromIndexSignature errors (TS4111)
 */

/**
 * Global CLI options returned by program.opts()
 */
export interface CliOptions {
	// Core options
	agent?: string;
	dryRun?: boolean;
	interactive?: boolean;
	logLevel?: 'debug' | 'error' | 'info' | 'warn';
	mode?: string;
	model?: string;
	noInteractive?: boolean;
	output?: 'json' | 'markdown' | 'yaml';
	progress?: 'off' | 'rich' | 'simple';
	provider?: string;
	quiet?: boolean;
	sessionId?: string;
	verbose?: boolean;
	wizard?: boolean;

	// Logging retention policy options
	cleanupInterval?: number;
	compressAfter?: number;
	logsPath?: string;
	maxAge?: number;
	maxFiles?: number;
	maxSize?: number;
	noRetention?: boolean;
	retentionDryRun?: boolean;
	retentionEnabled?: boolean;

	// Session retention policy options
	noSessionRetention?: boolean;
	sessionCleanupInterval?: number;
	sessionCompressAfter?: number;
	sessionMaxAge?: number;
	sessionMaxCount?: number;
	sessionMaxSize?: number;
	sessionRetentionDryRun?: boolean;
	sessionRetentionEnabled?: boolean;

	// Isolation options
	forceRequired?: boolean;
	isolated?: boolean;
	mockInputs?: Record<string, unknown>;
	skipValidation?: boolean;
	stage?: string;

	// Activity tracking
	saveActivity?: string;
	showActivity?: boolean;

	// Document output options
	documentAutoApprove?: boolean;
	documentCategory?: 'backend' | 'frontend' | 'infrastructure' | 'root';
	documentPath?: string;
	noDocumentOutput?: boolean;
}
