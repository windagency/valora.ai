/**
 * Config command definitions for CLI
 */

import type { CommandAdapter } from 'cli/command-adapter.interface';

import { getConfigLoader } from 'config/loader';
import { SetupWizard } from 'config/wizard';
import { getColorAdapter } from 'output/color-adapter.interface';
import { sanitizeData } from 'utils/data-sanitizer';
import { formatError } from 'utils/error-handler';

/**
 * Configure config command
 */
export function configureConfigCommand(program: CommandAdapter): void {
	const configCmd = program.command('config').description('Manage configuration');

	configCmd
		.command('setup')
		.description('Run interactive setup wizard')
		.option('--quick', 'Quick setup with minimal prompts')
		.action(async (options) => {
			const color = getColorAdapter();
			try {
				const configLoader = getConfigLoader();
				const wizard = new SetupWizard(configLoader);

				if (options['quick'] as boolean | undefined) {
					await wizard.quickSetup();
				} else {
					await wizard.run();
				}
			} catch (error) {
				console.error(color.red('Setup failed:'), formatError(error as Error));
				process.exit(1);
			}
		});

	configCmd
		.command('show')
		.description('Show current configuration')
		.action(async () => {
			const color = getColorAdapter();
			try {
				const configLoader = getConfigLoader();
				const config = await configLoader.load();

				// Sanitize sensitive data using centralized sanitizer
				const sanitized = sanitizeData(config);

				console.group('Configuration:');

				console.log(JSON.stringify(sanitized, null, 2));

				console.groupEnd();
			} catch (error) {
				console.error(color.red('Failed to load config:'), formatError(error as Error));
				process.exit(1);
			}
		});

	configCmd
		.command('path')
		.description('Show configuration file path')
		.action(() => {
			const configLoader = getConfigLoader();

			console.info(configLoader.getConfigPath());
		});
}
