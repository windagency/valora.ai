#!/usr/bin/env node

/**
 * Main CLI entry point
 *
 * Architecture: Modular command structure with separation of concerns
 * - config commands: configuration management
 * - session commands: session lifecycle management
 * - dynamic commands: runtime-loaded orchestration commands
 */

import { setGlobalCliOverrides } from 'config/loader';
import { createRequire } from 'node:module';
import { handlePromptCancellation, isPromptCancellation } from 'utils/prompt-handler';

import type { CliOptions } from './types/cli-options.types';

import { configureCompletionCommand } from './autocomplete';
import { configureTemplateCommand } from './command-templates';
import { createCommand } from './commander-adapter';
import { configureConfigCommand } from './commands/config';
import { configureDashboardCommand } from './commands/dashboard';
import { configureDoctorCommand } from './commands/doctor';
import {
	configureExecCommand,
	configureListCommand,
	configureRolloutCommand,
	configureShortcutCommands
} from './commands/dynamic';
import { configureExploreCommand } from './commands/explore';
import { configureHelpCommand } from './commands/help';
import { configureMonitoringCommand } from './commands/monitoring';
import { configureSessionCommand } from './commands/session';
import { CliConfigBuilder } from './config-builder';
import { checkAndRunFirstTimeSetup, shouldTriggerFirstRun } from './first-run-setup';
import { globalFlags } from './flags';

const require = createRequire(import.meta.url);
const packageJson = require('../../package.json') as { version: string };

// Check for --no-interactive flag before any setup (needed for command actions)
const rawArgs = process.argv.slice(2);
const hasNoInteractiveFlag = rawArgs.includes('--no-interactive');
if (hasNoInteractiveFlag) {
	process.env['AI_INTERACTIVE'] = 'false';
}

const program = createCommand();

program.name('ai').description('VALORA - AI-Assisted Development Workflow Orchestration').version(packageJson.version);

// Add global options
program.addOption(globalFlags.interactive);
program.addOption(globalFlags.noInteractive);
program.addOption(globalFlags.sessionId);
program.addOption(globalFlags.model);
program.addOption(globalFlags.mode);
program.addOption(globalFlags.agent);
program.addOption(globalFlags.provider);
program.addOption(globalFlags.logLevel);
program.addOption(globalFlags.dryRun);
program.addOption(globalFlags.verbose);
program.addOption(globalFlags.quiet);
program.addOption(globalFlags.output);
program.addOption(globalFlags.wizard);

// Add retention policy options
program.addOption(globalFlags.retentionEnabled);
program.addOption(globalFlags.noRetention);
program.addOption(globalFlags.logsPath);
program.addOption(globalFlags.maxAge);
program.addOption(globalFlags.maxSize);
program.addOption(globalFlags.maxFiles);
program.addOption(globalFlags.compressAfter);
program.addOption(globalFlags.cleanupInterval);
program.addOption(globalFlags.retentionDryRun);

// Add session retention policy options
program.addOption(globalFlags.sessionRetentionEnabled);
program.addOption(globalFlags.noSessionRetention);
program.addOption(globalFlags.sessionMaxAge);
program.addOption(globalFlags.sessionMaxSize);
program.addOption(globalFlags.sessionMaxCount);
program.addOption(globalFlags.sessionCompressAfter);
program.addOption(globalFlags.sessionCleanupInterval);
program.addOption(globalFlags.sessionRetentionDryRun);

// Add isolation options
program.addOption(globalFlags.stage);
program.addOption(globalFlags.skipValidation);
program.addOption(globalFlags.mockInputs);
program.addOption(globalFlags.forceRequired);
program.addOption(globalFlags.isolated);

// Add document output options
program.addOption(globalFlags.noDocumentOutput);
program.addOption(globalFlags.documentAutoApprove);
program.addOption(globalFlags.documentCategory);
program.addOption(globalFlags.documentPath);

// Configure all command modules
configureConfigCommand(program);
configureSessionCommand(program);
configureDashboardCommand(program);
configureMonitoringCommand(program);
configureExploreCommand(program);
configureHelpCommand(program);
configureDoctorCommand(program);
configureListCommand(program);
configureExecCommand(program);
configureRolloutCommand(program);
configureShortcutCommands(program);
configureCompletionCommand(program);
configureTemplateCommand(program);

/**
 * Initialize cleanup schedulers if not in test/MCP mode
 */
async function initializeCleanupIfNeeded(): Promise<void> {
	const isMCPMode = process.env['AI_MCP_ENABLED'] === 'true';
	const isTestMode = process.env['NODE_ENV'] === 'test' || process.env['AI_TEST_MODE'] === 'true';

	if (!isMCPMode && !isTestMode) {
		const { initializeCleanupSchedulers } = await import('cleanup/coordinator');
		await initializeCleanupSchedulers().catch(() => {
			// Silently fail - don't block CLI startup
			// Errors are already logged by the coordinator
		});
	}
}

/**
 * Build and apply CLI configuration overrides
 */
function buildAndApplyCliOverrides(options: CliOptions): void {
	// Set verbose environment variable if flag is provided
	if (options.verbose) {
		process.env['AI_VERBOSE'] = 'true';
	}

	const configBuilder = new CliConfigBuilder(options);

	// Validate CLI option combinations
	const validation = configBuilder.validateOptionCombinations();
	if (!validation.valid) {
		console.error('CLI option validation errors:');
		validation.errors.forEach((error) => {
			console.error(`  - ${error}`);
		});
		process.exit(1);
	}

	// Build and apply CLI overrides
	const cliOverrides = configBuilder.buildCliOverrides();
	if (Object.keys(cliOverrides).length > 0) {
		setGlobalCliOverrides(cliOverrides);
	}
}

/**
 * Show command palette and execute selected command
 */
async function showCommandPaletteIfNeeded(rawArgs: string[]): Promise<void> {
	if (!rawArgs.length) {
		const { showCommandPalette } = await import('./command-palette');
		const selectedCommand = await showCommandPalette();

		if (selectedCommand) {
			// Execute the selected command
			const arg0 = process.argv[0] ?? '';
			const arg1 = process.argv[1] ?? '';
			process.argv = [arg0, arg1, selectedCommand];
			program.parse();
		}
	}
}

// Main async initialization
void (async () => {
	try {
		// Check if we should run first-time setup
		if (shouldTriggerFirstRun(rawArgs)) {
			await checkAndRunFirstTimeSetup();
		}

		// Initialize unified cleanup schedulers (log and session)
		await initializeCleanupIfNeeded();

		// Parse arguments
		program.parse();

		// Build CLI configuration from options
		const options = program.opts() as CliOptions;

		// Build and apply CLI overrides
		buildAndApplyCliOverrides(options);

		// If no command provided, show command palette
		await showCommandPaletteIfNeeded(rawArgs);
	} catch (error) {
		// Handle prompt cancellation gracefully
		if (isPromptCancellation(error)) {
			handlePromptCancellation();
		}

		// Handle other initialization errors
		console.error('Initialization error:', error);
		process.exit(1);
	}
})();
