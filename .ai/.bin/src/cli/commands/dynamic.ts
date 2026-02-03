/**
 * Dynamic command definitions for CLI
 */

import type { CommandAdapter } from 'cli/command-adapter.interface';
import type { CommandExecutor } from 'cli/command-executor';
import type { CommandLoader } from 'executor/command-loader';
import type { IsolatedExecutionOptions } from 'types/command.types';
import type { DocumentCategory, DocumentOutputOptions } from 'types/document.types';

import { DocumentOutputProcessor } from 'cli/document-output-processor';
import { getConfigLoader } from 'config/loader';
import { SetupWizard } from 'config/wizard';
import { createContainer, SERVICE_IDENTIFIERS } from 'di/container';
import { getColorAdapter } from 'output/color-adapter.interface';
import { getLogger } from 'output/logger';
import { formatError } from 'utils/error-handler';
import { getCommandHelp } from 'utils/help-content';

/**
 * CLI options for exec command
 */
interface ExecCommandOptions extends Record<string, unknown> {
	documentAutoApprove?: boolean;
	documentCategory?: DocumentCategory;
	documentPath?: string;
	forceRequired?: boolean;
	interactive?: boolean;
	logLevel?: string;
	mockInputs?: Record<string, Record<string, unknown>>;
	noDocumentOutput?: boolean;
	sessionId?: string;
	skipValidation?: boolean;
	stage?: string | string[];
}

/**
 * Filter options to only include flags compatible with CommandExecutionOptions
 */
function filterFlags(options: Record<string, unknown>): Record<string, boolean | string | undefined> {
	const filtered: Record<string, boolean | string | undefined> = {};
	for (const [key, value] of Object.entries(options)) {
		if (typeof value === 'boolean' || typeof value === 'string' || value === undefined) {
			filtered[key] = value;
		}
	}
	return filtered;
}

/**
 * Parse unknown options from args array (e.g., --specs-file=path, --template=standard)
 * These are options that Commander doesn't know about due to .allowUnknownOption()
 */
function parseUnknownOptionsFromArgs(args: string[]): Record<string, string> {
	const parsed: Record<string, string> = {};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (!arg?.startsWith('--')) continue;

		// Handle --flag=value format
		if (arg.includes('=')) {
			const [flag, ...valueParts] = arg.split('=');
			const value = valueParts.join('='); // Handle paths with = in them
			if (flag && value) {
				const flagName = flag.replace(/^--/, '');
				parsed[flagName] = value;
			}
		} else {
			// Handle --flag value format
			const nextArg = args[i + 1];
			if (nextArg && !nextArg.startsWith('-')) {
				const flagName = arg.replace(/^--/, '');
				parsed[flagName] = nextArg;
				i++; // Skip the value in next iteration
			}
		}
	}

	return parsed;
}

/**
 * CLI options for rollout command
 */
interface RolloutCommandOptions extends Record<string, unknown> {
	analytics?: string;
	export?: string;
	metrics?: boolean;
	status?: boolean;
}

/**
 * CLI options for shortcut commands
 */
interface ShortcutCommandOptions extends Record<string, unknown> {
	documentAutoApprove?: boolean;
	documentCategory?: DocumentCategory;
	documentPath?: string;
	interactive?: boolean;
	logLevel?: string;
	noDocumentOutput?: boolean;
	sessionId?: string;
}

/**
 * Build document output options from CLI options
 */
function buildDocumentOutputOptions(options: ExecCommandOptions | ShortcutCommandOptions): DocumentOutputOptions {
	return DocumentOutputProcessor.buildOptionsFromCli({
		documentAutoApprove: options.documentAutoApprove,
		documentCategory: options.documentCategory,
		documentPath: options.documentPath,
		noDocumentOutput: options.noDocumentOutput
	});
}

/**
 * Build isolation options from CLI flags
 */
function buildIsolationOptions(options: ExecCommandOptions): IsolatedExecutionOptions | undefined {
	const isolation: IsolatedExecutionOptions = {} as IsolatedExecutionOptions;

	if (options['stage']) {
		isolation.stages = Array.isArray(options['stage']) ? options['stage'] : [options['stage']];
	}

	if (options['skipValidation']) {
		isolation.skipValidation = true;
	}

	if (options['mockInputs'] && typeof options['mockInputs'] === 'object') {
		isolation.mockInputs = options['mockInputs'] as Record<string, Record<string, unknown>>;
	}

	if (options['forceRequired']) {
		isolation.forceRequired = true;
	}

	// Return undefined if no isolation options specified
	return Object.keys(isolation).length > 0 ? isolation : undefined;
}

/**
 * Configure the main list command
 */
export function configureListCommand(program: CommandAdapter): void {
	program
		.command('list')
		.description('List available commands')
		.action(async () => {
			const color = getColorAdapter();
			try {
				const container = createContainer();
				const commandLoader = container.resolve(SERVICE_IDENTIFIERS.COMMAND_LOADER) as CommandLoader;
				const commands = await commandLoader.listCommands();

				console.group(color.bold('\nAvailable commands:'));
				commands.forEach((cmd) => console.log(`  ${color.cyan(cmd)}`));
				console.groupEnd();

				console.log();

				// Stop cleanup schedulers before exit
				const { stopAllCleanupSchedulers } = await import('cleanup/coordinator');
				stopAllCleanupSchedulers();

				// Exit successfully
				process.exit(0);
			} catch (error) {
				console.error(color.red('Failed to list commands:'), formatError(error as Error));

				// Stop cleanup schedulers before exit
				const { stopAllCleanupSchedulers } = await import('cleanup/coordinator');
				stopAllCleanupSchedulers();

				process.exit(1);
			}
		});
}

/**
 * Configure exec command for direct execution
 */
export function configureExecCommand(program: CommandAdapter): void {
	program
		.command('exec <command> [args...]')
		.description('Execute a specific command')
		.action(async (...rawArgs: Array<Record<string, unknown>>) => {
			const commandName = rawArgs[0] as unknown as string;
			const args = rawArgs[1] as unknown as string[];
			const options = rawArgs[2] as unknown as ExecCommandOptions;
			const color = getColorAdapter();
			try {
				// Check if config exists, run setup if not (respecting interactive mode)
				const configLoader = getConfigLoader();
				const isNonInteractive = process.env['AI_INTERACTIVE'] === 'false';
				const needsSetup = await SetupWizard.needsSetup(configLoader, !isNonInteractive);
				if (needsSetup) {
					if (isNonInteractive) {
						console.info(color.cyan('ℹ️  No API providers configured - using Cursor provider (non-interactive mode)'));
					} else {
						console.warn(color.yellow('\n⚠️  Configuration not found. Running setup...\n'));
						const wizard = new SetupWizard(configLoader);
						await wizard.quickSetup();

						console.log();
					}
				}

				// Set up logger
				const logger = getLogger();
				const logLevel = options['logLevel'] as string | undefined;
				if (logLevel) {
					logger.setLevel(logLevel as 'debug' | 'error' | 'info' | 'warn');
				}

				// Build isolation options
				const isolationOptions = buildIsolationOptions(options);

				// Build document output options
				const documentOptions = buildDocumentOutputOptions(options);

				// Create container and resolve executor
				const container = createContainer();
				const executor = container.resolve(SERVICE_IDENTIFIERS.COMMAND_EXECUTOR) as CommandExecutor;

				// Execute command
				await executor.execute(commandName, {
					args,
					documentOutput: documentOptions,
					flags: filterFlags(options),
					interactive: options['interactive'] as boolean | undefined,
					isolation: isolationOptions,
					sessionId: options['sessionId'] as string | undefined
				});

				// Stop cleanup schedulers before exit
				const { stopAllCleanupSchedulers } = await import('cleanup/coordinator');
				stopAllCleanupSchedulers();

				// Exit successfully
				process.exit(0);
			} catch (error) {
				console.error(color.red('\n❌ Execution failed:'), formatError(error as Error));

				// Stop cleanup schedulers before exit
				const { stopAllCleanupSchedulers } = await import('cleanup/coordinator');
				stopAllCleanupSchedulers();

				process.exit(1);
			}
		});
}

/**
 * Build feature flag display data
 */
function buildFeatureFlagData(
	config: ReturnType<ReturnType<typeof getConfigLoader>['get']>,
	analyticsEnabled: boolean
): Array<{ disabledText: string; enabled: boolean | undefined; enabledText: string; name: string }> {
	const color = getColorAdapter();
	return [
		{
			disabledText: color.red('❌ DISABLED'),
			enabled: config.features?.dynamic_agent_selection,
			enabledText: color.green('✅ ENABLED'),
			name: 'dynamic_agent_selection'
		},
		{
			disabledText: color.yellow('⚠️  ENABLED (Phase 1)'),
			enabled: config.features?.dynamic_agent_selection_implement_only,
			enabledText: color.green('✅ ENABLED'),
			name: 'dynamic_agent_selection_implement_only'
		},
		{
			disabledText: color.red('❌ DISABLED'),
			enabled: analyticsEnabled,
			enabledText: color.green('✅ ENABLED'),
			name: 'agent_selection_analytics'
		},
		{
			disabledText: color.red('❌ DISABLED'),
			enabled: config.features?.agent_selection_monitoring,
			enabledText: color.green('✅ ENABLED'),
			name: 'agent_selection_monitoring'
		},
		{
			disabledText: color.red('❌ DISABLED'),
			enabled: config.features?.agent_selection_fallback_reporting,
			enabledText: color.green('✅ ENABLED'),
			name: 'agent_selection_fallback_reporting'
		}
	];
}

/**
 * Format feature flags for display
 */
function formatFeatureFlags(
	config: ReturnType<ReturnType<typeof getConfigLoader>['get']>,
	analyticsEnabled: boolean
): string {
	const color = getColorAdapter();
	const flags = buildFeatureFlagData(config, analyticsEnabled);
	const flagLines = flags.map((flag) => `  ${flag.name}: ${flag.enabled ? flag.enabledText : flag.disabledText}`);
	return `${color.bold('Feature Flags:')}\n${flagLines.join('\n')}`;
}

/**
 * Determine current rollout phase
 */
function getRolloutPhase(
	config: ReturnType<ReturnType<typeof getConfigLoader>['get']>
): 'disabled' | 'full' | 'implement-only' {
	if (config.features?.dynamic_agent_selection) return 'full';
	if (config.features?.dynamic_agent_selection_implement_only) return 'implement-only';
	return 'disabled';
}

/**
 * Format rollout phase for display
 */
function formatRolloutPhase(config: ReturnType<ReturnType<typeof getConfigLoader>['get']>): string {
	const color = getColorAdapter();
	const phaseMessages: Record<'disabled' | 'full' | 'implement-only', string> = {
		disabled: '  Feature disabled',
		full: '  Full system adoption with monitoring',
		'implement-only': '  Implement command only (gradual rollout)'
	};
	const phase = getRolloutPhase(config);
	return `${color.bold('\nRollout Phase:')}\n${phaseMessages[phase]}`;
}

/**
 * Display rollout status information
 */
function displayRolloutStatus(config: ReturnType<ReturnType<typeof getConfigLoader>['get']>): void {
	const color = getColorAdapter();
	const analyticsEnabled = config.features?.agent_selection_analytics ?? false;

	console.log(`
${color.bold('🚀 Dynamic Agent Selection Rollout Status')}

${formatFeatureFlags(config, analyticsEnabled)}
${formatRolloutPhase(config)}

${color.bold('Commands with Dynamic Selection:')}
  implement: ✅ ENABLED (dynamic_agent_selection: true)
`);
}

/**
 * Display analytics information
 */
function displayAnalytics(hours: number, analyticsEnabled: boolean): void {
	const color = getColorAdapter();

	if (isNaN(hours) || hours <= 0) {
		console.error(color.red('❌ Invalid hours value. Must be a positive number.'));
		process.exit(1);
	}

	if (!analyticsEnabled) {
		console.log(`${color.yellow('⚠️  Agent selection analytics is disabled. Enable with feature flag: agent_selection_analytics')}
   Set environment variable: AI_FEATURE_AGENT_SELECTION_ANALYTICS=true
   Or update config.json: "features": { "agent_selection_analytics": true }`);
		process.exit(1);
	}

	console.log(`
${color.bold(`📊 Agent Selection Analytics (Last ${hours} hours)`)}
${color.gray('Analytics data would be displayed here when service is available')}
This requires the analytics service to be instantiated and data collected.
`);
}

/**
 * Display rollout metrics
 */
function displayMetrics(analyticsEnabled: boolean): void {
	const color = getColorAdapter();

	if (!analyticsEnabled) {
		console.log(color.yellow('⚠️  Agent selection analytics is disabled. Cannot show metrics.'));
		process.exit(1);
	}

	console.log(`
${color.bold('📈 Rollout Success Metrics')}

${color.bold('Target Metrics (Phase 7 Success Criteria):')}
  Accuracy: >85% correct agent selection for well-defined tasks
  Performance: <500ms agent resolution overhead
  Adoption: >70% of implement commands use auto-selection within 3 months
  Satisfaction: <20% manual overrides indicating user dissatisfaction
${color.gray('\nActual metrics would be calculated from analytics data...')}
`);
}

/**
 * Handle analytics export
 */
function handleExport(exportPath: string, analyticsEnabled: boolean): void {
	const color = getColorAdapter();

	if (!analyticsEnabled) {
		console.log(color.yellow('⚠️  Agent selection analytics is disabled. Cannot export data.'));
		process.exit(1);
	}

	console.log(`${color.yellow('⚠️  Analytics export not yet implemented')}
Would export to: ${exportPath}`);
}

/**
 * Display default help message
 */
function displayDefaultHelp(): void {
	const color = getColorAdapter();
	console.log(`${color.cyan('ℹ️  Use --status, --analytics, --metrics, or --export options')}
   Example: valora rollout --status
   Example: valora rollout --analytics 24`);
}

/**
 * Ensure configuration is set up
 */
async function ensureConfigSetup(): Promise<ReturnType<ReturnType<typeof getConfigLoader>['get']>> {
	const color = getColorAdapter();
	const configLoader = getConfigLoader();
	const isNonInteractive = process.env['AI_INTERACTIVE'] === 'false';
	const needsSetup = await SetupWizard.needsSetup(configLoader, !isNonInteractive);

	if (needsSetup) {
		if (isNonInteractive) {
			console.info(color.cyan('ℹ️  No API providers configured - using Cursor provider (non-interactive mode)'));
		} else {
			console.warn(color.yellow('\n⚠️  Configuration not found. Running setup...\n'));
			const wizard = new SetupWizard(configLoader);
			await wizard.quickSetup();
			console.log();
		}
	}

	return configLoader.get();
}

/**
 * Handle rollout command options
 */
function handleRolloutOptions(
	options: RolloutCommandOptions,
	config: ReturnType<ReturnType<typeof getConfigLoader>['get']>,
	analyticsEnabled: boolean
): void {
	if (options.status) {
		displayRolloutStatus(config);
	}

	if (options.analytics) {
		const hours = parseInt(options.analytics);
		displayAnalytics(hours, analyticsEnabled);
	}

	if (options.metrics) {
		displayMetrics(analyticsEnabled);
	}

	if (options.export) {
		handleExport(options.export, analyticsEnabled);
	}

	// Default behavior - show status if no specific option provided
	if (!options.status && !options.analytics && !options.metrics && !options.export) {
		displayDefaultHelp();
	}
}

/**
 * Configure the rollout monitoring command
 */
export function configureRolloutCommand(program: CommandAdapter): void {
	program
		.command('rollout')
		.description('Monitor dynamic agent selection rollout status and analytics')
		.option('--status', 'Show current rollout status and feature flags')
		.option('--analytics <hours>', 'Show agent selection analytics for last N hours', '24')
		.option('--metrics', 'Show success metrics for rollout evaluation')
		.option('--export <file>', 'Export analytics data to JSON file')
		.action(async (options: RolloutCommandOptions) => {
			const color = getColorAdapter();
			try {
				const config = await ensureConfigSetup();
				const analyticsEnabled = config.features?.agent_selection_analytics ?? false;
				handleRolloutOptions(options, config, analyticsEnabled);

				// Stop cleanup schedulers before exit
				const { stopAllCleanupSchedulers } = await import('cleanup/coordinator');
				stopAllCleanupSchedulers();

				// Exit successfully
				process.exit(0);
			} catch (err) {
				console.error(color.red('\n❌ Rollout command failed:'), formatError(err as Error));

				// Stop cleanup schedulers before exit
				const { stopAllCleanupSchedulers } = await import('cleanup/coordinator');
				stopAllCleanupSchedulers();

				process.exit(1);
			}
		});
}

/**
 * Configure all dynamic shortcut commands
 */
export function configureShortcutCommands(program: CommandAdapter): void {
	const shortcuts = [
		'plan',
		'implement',
		'review-plan',
		'review-code',
		'review-functional',
		'test',
		'commit',
		'create-pr',
		'refine-specs',
		'create-prd',
		'create-backlog',
		'generate-docs',
		'fetch-task',
		'refine-task',
		'gather-knowledge',
		'assert',
		'feedback'
	];

	shortcuts.forEach((cmd) => {
		// Get help content for this command to use proper description and options
		const helpContent = getCommandHelp(cmd);
		const description = helpContent?.description ?? `Execute ${cmd} command`;

		// Create the command with proper description
		const command = program.command(`${cmd} [args...]`).description(description).allowUnknownOption();

		// Register command-specific options from help content for --help display
		if (helpContent?.options) {
			for (const opt of helpContent.options) {
				// Parse the flag to extract the option name and value placeholder
				// e.g., "--specs-file <path>" -> flag: "--specs-file", valueName: "<path>"
				const flagParts = opt.flag.split(' ');
				const flagName = flagParts[0] ?? opt.flag;
				const valuePlaceholder = flagParts.slice(1).join(' ');

				// Build description with default value if present
				const optDescription = opt.default ? `${opt.description} (default: ${opt.default})` : opt.description;

				// Register the option
				if (valuePlaceholder) {
					command.option(`${flagName} ${valuePlaceholder}`, optDescription);
				} else {
					command.option(flagName, optDescription);
				}
			}
		}

		command.action(async (...rawArgs: Array<Record<string, unknown>>) => {
			const args = rawArgs[0] as unknown as string[];
			const options = rawArgs[1] as unknown as ShortcutCommandOptions;
			const color = getColorAdapter();

			// Parse unknown options from args (e.g., --specs-file=path)
			// These are command-specific options that Commander doesn't know about
			const unknownOptions = parseUnknownOptionsFromArgs(args);

			// Merge global options, command options, and unknown options
			const globalOptions = program.opts();
			const mergedOptions = { ...globalOptions, ...options, ...unknownOptions };
			try {
				// Check if config exists, run setup if not (respecting interactive mode)
				const configLoader = getConfigLoader();
				const isNonInteractive = process.env['AI_INTERACTIVE'] === 'false';
				const needsSetup = await SetupWizard.needsSetup(configLoader, !isNonInteractive);
				if (needsSetup) {
					if (isNonInteractive) {
						console.info(color.cyan('ℹ️  No API providers configured - using Cursor provider (non-interactive mode)'));
					} else {
						console.log(color.yellow('\n⚠️  Configuration not found. Running setup...\n'));
						const wizard = new SetupWizard(configLoader);
						await wizard.quickSetup();

						console.log();
					}
				}

				// Set up logger
				const logger = getLogger();
				const logLevel = options['logLevel'] as string | undefined;
				if (logLevel) {
					logger.setLevel(logLevel as 'debug' | 'error' | 'info' | 'warn');
				}

				// Build document output options from merged options
				const documentOptions = buildDocumentOutputOptions(mergedOptions as ShortcutCommandOptions);

				// Create container and resolve executor
				const container = createContainer();
				const executor = container.resolve(SERVICE_IDENTIFIERS.COMMAND_EXECUTOR) as CommandExecutor;

				// Execute command
				await executor.execute(cmd, {
					args,
					documentOutput: documentOptions,
					flags: filterFlags(mergedOptions),
					interactive: mergedOptions['interactive'] as boolean | undefined,
					isolation: undefined,
					sessionId: mergedOptions['sessionId'] as string | undefined
				});

				// Stop cleanup schedulers before exit
				const { stopAllCleanupSchedulers } = await import('cleanup/coordinator');
				stopAllCleanupSchedulers();

				// Exit successfully
				process.exit(0);
			} catch (error) {
				console.error(color.red('\n❌ Execution failed:'), formatError(error as Error));

				// Stop cleanup schedulers before exit
				const { stopAllCleanupSchedulers } = await import('cleanup/coordinator');
				stopAllCleanupSchedulers();

				process.exit(1);
			}
		});
	});
}
