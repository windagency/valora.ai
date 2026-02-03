/**
 * First-run setup wizard for new users
 */

import { getConfigLoader } from 'config/loader';
import { SetupWizard } from 'config/wizard';
import { createNextStepsMessage, createWelcomeBanner } from 'output/welcome-banner';
import { isPromptCancellation } from 'utils/prompt-handler';

/**
 * Check if first-run setup is needed and execute if required
 */
export async function checkAndRunFirstTimeSetup(): Promise<void> {
	// Skip in non-interactive modes
	if (
		process.env['AI_INTERACTIVE'] === 'false' ||
		process.env['CI'] === 'true' ||
		process.env['NODE_ENV'] === 'test' ||
		process.env['AI_MCP_ENABLED'] === 'true'
	) {
		return;
	}

	const configLoader = getConfigLoader();

	// Check if setup is needed (respecting interactive mode)
	const needsSetup = await SetupWizard.needsSetup(configLoader, true);

	if (!needsSetup) {
		return;
	}

	// Show welcome banner

	console.log(createWelcomeBanner());

	// Run quick setup
	const wizard = new SetupWizard(configLoader);
	try {
		await wizard.quickSetup();

		// Show next steps

		console.log(createNextStepsMessage());
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

	return !hasHelpFlag && !hasVersionFlag;
}
