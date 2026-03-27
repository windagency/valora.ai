/**
 * First-run setup wizard for new users
 */

import * as fs from 'fs';
import * as path from 'path';

import { getConfigLoader } from 'config/loader';
import { SetupWizard } from 'config/wizard';
import { createNextStepsMessage, createWelcomeBanner } from 'output/welcome-banner';
import { getGlobalConfigDir } from 'utils/paths';
import { isPromptCancellation } from 'utils/prompt-handler';

/**
 * Check if first-run setup is needed and execute if required
 */
export async function checkAndRunFirstTimeSetup(): Promise<void> {
	// Skip in non-interactive modes
	if (
		process.env['AI_INTERACTIVE'] === 'false' ||
		process.env['VALORA_INTERACTIVE'] === 'false' ||
		process.env['CI'] === 'true' ||
		process.env['NODE_ENV'] === 'test' ||
		process.env['AI_MCP_ENABLED'] === 'true'
	) {
		return;
	}

	// Check if global config exists
	const globalConfigPath = path.join(getGlobalConfigDir(), 'config.json');
	const hasGlobalConfig = fs.existsSync(globalConfigPath);

	const configLoader = getConfigLoader();

	// Check if setup is needed (respecting interactive mode)
	const needsSetup = !hasGlobalConfig && (await SetupWizard.needsSetup(configLoader, true));

	if (!needsSetup) {
		return;
	}

	// Show welcome banner

	console.log(createWelcomeBanner());

	// Run full setup
	const wizard = new SetupWizard(configLoader);
	try {
		await wizard.run();

		// Show next steps

		console.log(createNextStepsMessage());
		console.log('  Run `valora init` in your project directory to set up project-level configuration.\n');
	} catch (error) {
		// Re-throw prompt cancellations to be handled by main CLI
		if (isPromptCancellation(error)) {
			throw error;
		}
		// Re-throw other errors as well
		throw error;
	}
}

/**
 * Check if command should trigger first-run setup
 */
export function shouldTriggerFirstRun(args: string[]): boolean {
	// Don't trigger for help or version commands
	const helpFlags = ['--help', '-h', 'help'];
	const versionFlags = ['--version', '-V'];

	// Check if any help or version flags are present
	const hasHelpFlag = args.some((arg) => helpFlags.includes(arg));
	const hasVersionFlag = args.some((arg) => versionFlags.includes(arg));

	// Don't trigger when user is explicitly running config setup
	const isConfigSetup = args[0] === 'config' && args[1] === 'setup';

	return !hasHelpFlag && !hasVersionFlag && !isConfigSetup;
}
