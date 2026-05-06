#!/usr/bin/env node

/**
 * Main CLI entry point
 *
 * Architecture: Modular command structure with separation of concerns
 * - config commands: configuration management
 * - session commands: session lifecycle management
 * - dynamic commands: runtime-loaded orchestration commands
 */

import type { UpdateCheckState } from 'updater/throttle';

import * as path from 'node:path';
import { getCliSubcommand } from 'plugins/cli-registry';
import { PluginInstallerService } from 'plugins/plugin-installer.service';
import { PluginLoaderService } from 'plugins/plugin-loader.service';
import {
	runAutoInstall,
	scheduleUpdateCheck,
	settleUpdateCheck,
	shouldAutoUpdate,
	shouldShowReminder,
	writeUpdateState
} from 'updater/index';
import { DEFAULT_STATE } from 'updater/state';

import { autoInstallOutdatedPlugins } from 'cli/auto-plugin-install';
import { silentSpawnRunner } from 'cli/spawn-runner';
import { getConfigLoader, setGlobalCliOverrides } from 'config/loader';
import { createContainer, dispatchDeactivateHooks, initializePlugins } from 'di/container';
import { getGlobalConfigDir, getRuntimeDataDir, getValoraVersion } from 'utils/paths';
import { handlePromptCancellation, isPromptCancellation } from 'utils/prompt-handler';

import type { CommandAdapter } from './command-adapter.interface';
import type { CliOptions } from './types/cli-options.types';

import { configureCompletionCommand } from './autocomplete';
import { configureTemplateCommand } from './command-templates';
import { type CommanderCommandContract, createCommand } from './commander-adapter';
import { configureAgentsAuditCommand } from './commands/agents-audit';
import { configureBatchCommand } from './commands/batch.command';
import { configureConfigCommand } from './commands/config';
import { configureDashboardCommand } from './commands/dashboard';
import { configureDoctorCommand } from './commands/doctor';
import {
	configureConsolidateCommand,
	configureExecCommand,
	configureListCommand,
	configureRolloutCommand,
	configureShortcutCommands
} from './commands/dynamic';
import { configureExploreCommand } from './commands/explore';
import { configureHelpCommand } from './commands/help';
import { configureInitCommand } from './commands/init';
import { configureMapCommand } from './commands/map';
import { configureMemoryCommand } from './commands/memory.command';
import { configureMonitoringCommand } from './commands/monitoring';
import { configurePluginCommand } from './commands/plugin.command';
import { configureSecurityCommand } from './commands/security.command';
import { configureSessionCommand } from './commands/session';
import { configureTraceCommand } from './commands/trace-explain';
import { configureUpdateCommand, persistUpdateSuccess } from './commands/update.command';
import { CliConfigBuilder } from './config-builder';
import { checkAndRunFirstTimeSetup, shouldTriggerFirstRun } from './first-run-setup';
import { globalFlags } from './flags';
import { schedulePluginUpdateCheck, settlePluginUpdateCheck } from './plugin-update-orchestrator';
import { printUpdateBanner } from './update-banner';

const packageVersion = getValoraVersion();

const CORE_UPDATE_SETTLE_MS = 200;
const PLUGIN_UPDATE_SETTLE_MS = 500;

// Check for --no-interactive flag before any setup (needed for command actions)
const rawArgs = process.argv.slice(2);
const hasNoInteractiveFlag = rawArgs.includes('--no-interactive');
if (hasNoInteractiveFlag) {
	process.env['AI_INTERACTIVE'] = 'false';
}

const program = createCommand();

program.name('valora').description('VALORA - AI-Assisted Development Workflow Orchestration').version(packageVersion);

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

// Batch processing flag
program.addOption(globalFlags.batch);

// EU AI Act disclosure
program.addOption(globalFlags.noDisclosure);

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
configureConsolidateCommand(program);
configureCompletionCommand(program);
configureTemplateCommand(program);
configureInitCommand(program);
configureBatchCommand(program);
configureMapCommand(program);
const memoryDir = path.join(getRuntimeDataDir(), 'memory');
configureMemoryCommand(program, { jsonDir: memoryDir, vaultDir: memoryDir });
configurePluginCommand(program);
configureAgentsAuditCommand(program);
configureTraceCommand(program);
configureSecurityCommand(program);

const rawProgram = (program as CommanderCommandContract).getUnderlyingCommand();
configureUpdateCommand(rawProgram);

const isUpdateCommand = rawArgs[0] === 'update';

async function handleAutoInstall(state: UpdateCheckState): Promise<void> {
	const { latestVersion } = state;
	if (!latestVersion || !shouldAutoUpdate(state, packageVersion)) return;
	process.stderr.write(`Updating Valora to v${latestVersion}…\n`);
	const result = await runAutoInstall();
	if (result === 'success') {
		process.stderr.write(`✓ Updated to v${latestVersion}.\n`);
		await persistUpdateSuccess(getGlobalConfigDir(), packageVersion, latestVersion);
	}
}

async function handleAutoMode(
	state: null | UpdateCheckState,
	outdatedPlugins: Awaited<ReturnType<typeof settlePluginUpdateCheck>>
): Promise<void> {
	if (state) await handleAutoInstall(state);
	const installer = new PluginInstallerService(silentSpawnRunner);
	await autoInstallOutdatedPlugins(installer, outdatedPlugins);
}

async function handleReminderMode(
	state: null | UpdateCheckState,
	outdatedPlugins: Awaited<ReturnType<typeof settlePluginUpdateCheck>>
): Promise<void> {
	const hasCoreUpdate = state !== null && shouldShowReminder(state, packageVersion, 'reminder');
	const hasPluginUpdates = outdatedPlugins.length > 0;
	if (!hasCoreUpdate && !hasPluginUpdates) return;
	printUpdateBanner(state ?? { ...DEFAULT_STATE }, packageVersion, outdatedPlugins);
	if (state) {
		await writeUpdateState(getGlobalConfigDir(), { ...state, remindedForVersion: state.latestVersion });
	}
}

function shouldSkipUpdateCheck(): boolean {
	return (
		process.env['VALORA_DISABLE_AUTO_UPDATE'] === '1' ||
		process.env['CI'] === 'true' ||
		process.env['NODE_ENV'] === 'test' ||
		process.env['AI_TEST_MODE'] === 'true' ||
		process.env['AI_MCP_ENABLED'] === 'true' ||
		!process.stderr.isTTY
	);
}

rawProgram.hook('postAction', async () => {
	if (shouldSkipUpdateCheck() || isUpdateCommand) return;

	const config = await getConfigLoader().load();
	const mode = config.autoUpdate?.mode ?? 'reminder';
	if (mode === 'disabled') return;

	const [state, outdatedPlugins] = await Promise.all([
		settleUpdateCheck(CORE_UPDATE_SETTLE_MS),
		settlePluginUpdateCheck(PLUGIN_UPDATE_SETTLE_MS)
	]);

	if (!state && outdatedPlugins.length === 0) return;

	if (mode === 'reminder') {
		await handleReminderMode(state, outdatedPlugins);
	} else if (mode === 'auto') {
		await handleAutoMode(state, outdatedPlugins);
	}
});

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

function registerPluginCliStubs(prog: CommandAdapter, entries: Array<{ description: string; name: string }>): void {
	const parentStubs = new Map<string, CommandAdapter>();

	for (const entry of entries) {
		const parts = entry.name.split(' ');
		// Zod regex guarantees at least one word so parts[0] is always defined
		const parentName = parts[0]!;
		const childName = parts[1];
		const entryName = entry.name;
		const entryDesc = entry.description;

		const action = async (): Promise<void> => {
			const container = createContainer();
			await initializePlugins(container);
			const reg = getCliSubcommand(entryName);
			if (!reg) {
				console.error(`Plugin subcommand '${entryName}' was declared in a manifest but no handler was registered.`);
				process.exit(1);
			}
			try {
				await reg.handler();
			} finally {
				await dispatchDeactivateHooks(container);
			}
		};

		if (childName) {
			let parentCmd = parentStubs.get(parentName);
			if (!parentCmd) {
				parentCmd = prog.command(parentName);
				parentStubs.set(parentName, parentCmd);
			}
			parentCmd.command(childName).description(entryDesc).action(action);
		} else {
			prog.command(parentName).description(entryDesc).action(action);
		}
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

		// Pre-parse: register Commander stubs for plugin-declared CLI subcommands
		const pluginConfig = await getConfigLoader().load();
		const pluginCliLoader = new PluginLoaderService();
		const cliEntries = pluginCliLoader
			.catalogAll(pluginConfig.plugins)
			.flatMap((p) => (p.status === 'enabled' && p.manifest?.cli ? p.manifest.cli : []));
		registerPluginCliStubs(program, cliEntries);

		// Parse arguments
		program.parse();

		// Schedule background update checks after parse — fire-and-forget, never blocks the command
		if (!shouldSkipUpdateCheck() && !isUpdateCommand) {
			void (async () => {
				const config = await getConfigLoader().load();
				const mode = config.autoUpdate?.mode ?? 'reminder';
				if (mode === 'disabled') return;
				const frequencyDays = config.autoUpdate?.frequencyDays ?? 1;
				scheduleUpdateCheck(getGlobalConfigDir(), packageVersion, frequencyDays);
				schedulePluginUpdateCheck(getGlobalConfigDir(), packageVersion, frequencyDays);
			})();
		}

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
