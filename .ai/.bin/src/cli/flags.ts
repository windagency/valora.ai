/**
 * Global CLI flags definitions
 */

import type { OptionAdapter } from './command-adapter.interface';

import { createOption } from './commander-adapter';

/**
 * Global flags interface with explicit property types
 */
export interface GlobalFlags {
	agent: OptionAdapter;
	cleanupInterval: OptionAdapter;
	compressAfter: OptionAdapter;
	documentAutoApprove: OptionAdapter;
	documentCategory: OptionAdapter;
	documentPath: OptionAdapter;
	dryRun: OptionAdapter;
	forceRequired: OptionAdapter;
	interactive: OptionAdapter;
	isolated: OptionAdapter;
	logLevel: OptionAdapter;
	logsPath: OptionAdapter;
	maxAge: OptionAdapter;
	maxFiles: OptionAdapter;
	maxSize: OptionAdapter;
	mockInputs: OptionAdapter;
	mode: OptionAdapter;
	model: OptionAdapter;
	noDocumentOutput: OptionAdapter;
	noInteractive: OptionAdapter;
	noRetention: OptionAdapter;
	noSessionRetention: OptionAdapter;
	output: OptionAdapter;
	progress: OptionAdapter;
	provider: OptionAdapter;
	quiet: OptionAdapter;
	retentionDryRun: OptionAdapter;
	retentionEnabled: OptionAdapter;
	saveActivity: OptionAdapter;
	sessionCleanupInterval: OptionAdapter;
	sessionCompressAfter: OptionAdapter;
	sessionId: OptionAdapter;
	sessionMaxAge: OptionAdapter;
	sessionMaxCount: OptionAdapter;
	sessionMaxSize: OptionAdapter;
	sessionRetentionDryRun: OptionAdapter;
	sessionRetentionEnabled: OptionAdapter;
	showActivity: OptionAdapter;
	skipValidation: OptionAdapter;
	stage: OptionAdapter;
	verbose: OptionAdapter;
	wizard: OptionAdapter;
}

export const globalFlags: GlobalFlags = {
	agent: createOption('--agent <role>', 'Override default agent'),

	cleanupInterval: createOption('--cleanup-interval <hours>', 'Run cleanup every N hours').argParser(parseInt),

	compressAfter: createOption('--compress-after <days>', 'Compress log files after this many days').argParser(parseInt),

	// Document output flags
	documentAutoApprove: createOption('--document-auto-approve', 'Auto-approve document creation without prompts'),

	documentCategory: createOption('--document-category <category>', 'Override document category').choices([
		'root',
		'backend',
		'frontend',
		'infrastructure'
	]),

	documentPath: createOption('--document-path <path>', 'Custom output path for document'),

	dryRun: createOption('-n, --dry-run', 'Show what would be executed without running'),

	forceRequired: createOption('--force-required', 'Override stage requirements for testing'),

	interactive: createOption('--interactive', 'Enable interactive mode with approval prompts').default(true),

	isolated: createOption('--isolated', 'Execute in complete isolation mode (no dependencies)'),

	logLevel: createOption('--log-level <level>', 'Set log level').choices(['debug', 'info', 'warn', 'error']),

	logsPath: createOption('--logs-path <path>', 'Override logs directory path'),

	maxAge: createOption('--max-age <days>', 'Maximum age for log files in days').argParser(parseInt),

	maxFiles: createOption('--max-files <count>', 'Maximum number of log files to keep').argParser(parseInt),

	maxSize: createOption('--max-size <mb>', 'Maximum total log size in MB').argParser(parseInt),

	mockInputs: createOption('--mock-inputs <json>', 'Provide mock inputs for isolated execution').argParser(JSON.parse),
	mode: createOption('--mode <mode>', 'Override default AI model mode'),

	model: createOption('--model <name>', 'Override default AI model'),

	noDocumentOutput: createOption('--no-document-output', 'Disable document output to knowledge-base'),

	noInteractive: createOption('--no-interactive', 'Disable interactive mode'),

	noRetention: createOption('--no-retention', 'Disable log retention cleanup'),

	noSessionRetention: createOption('--no-session-retention', 'Disable session retention cleanup'),

	output: createOption('--output <format>', 'Output format').choices(['markdown', 'json', 'yaml']),

	progress: createOption('--progress <mode>', 'Progress display mode')
		.choices(['rich', 'simple', 'off'])
		.default('simple'),

	provider: createOption('--provider <name>', 'Override default LLM provider'),

	quiet: createOption('-q, --quiet', 'Suppress non-essential output'),

	retentionDryRun: createOption('--retention-dry-run', 'Show retention actions without executing them'),

	saveActivity: createOption('--save-activity <file>', 'Save activity log to file'),

	showActivity: createOption('--show-activity', 'Display real-time activity feed'),
	// Logging retention policy override flags
	retentionEnabled: createOption('--retention-enabled', 'Enable log retention cleanup'),

	sessionCleanupInterval: createOption(
		'--session-cleanup-interval <hours>',
		'Run session cleanup every N hours'
	).argParser(parseInt),

	sessionCompressAfter: createOption(
		'--session-compress-after <days>',
		'Compress sessions after this many days'
	).argParser(parseInt),

	sessionId: createOption('--session-id <id>', 'Resume or use specific session'),

	sessionMaxAge: createOption('--session-max-age <days>', 'Maximum age for sessions in days').argParser(parseInt),

	sessionMaxCount: createOption('--session-max-count <count>', 'Maximum number of sessions to keep').argParser(
		parseInt
	),

	sessionMaxSize: createOption('--session-max-size <mb>', 'Maximum total sessions size in MB').argParser(parseInt),

	sessionRetentionDryRun: createOption(
		'--session-retention-dry-run',
		'Show session retention actions without executing them'
	),

	// Session retention policy override flags
	sessionRetentionEnabled: createOption('--session-retention-enabled', 'Enable session retention cleanup'),

	skipValidation: createOption('--skip-validation', 'Skip pipeline validation for isolated execution'),

	// Isolation flags for independent command execution
	stage: createOption('--stage <stage>', 'Execute only specific stage(s)').argParser((value) => value.split(',')),

	verbose: createOption('-v, --verbose', 'Enable verbose output'),

	wizard: createOption('--wizard', 'Launch interactive command wizard')
};
