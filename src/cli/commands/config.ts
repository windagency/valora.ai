/**
 * Config command definitions for CLI
 */

import * as path from 'node:path';
import { isWorkspaceTrusted, revokeWorkspaceTrust, trustWorkspace } from 'security/workspace-trust.service';

import type { CommandAdapter } from 'cli/command-adapter.interface';

import { ConfigLoader, getConfigLoader } from 'config/loader';
import { SetupWizard } from 'config/wizard';
import { createContainer, initializePlugins } from 'di/container';
import { getColorAdapter } from 'output/color-adapter.interface';
import { sanitizeData } from 'utils/data-sanitizer';
import { formatError } from 'utils/error-handler';
import { getRuntimeDataDir, getWorkspaceTrustCheckRoot } from 'utils/paths';

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
				const container = createContainer();
				await initializePlugins(container);

				const userConfigPath = path.join(getRuntimeDataDir(), 'config.json');
				const configLoader = new ConfigLoader(userConfigPath);
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

	configCmd
		.command('trust')
		.description(
			"Trust this project's .valora/config.json to run its own declared hooks. " +
				'Required before any project-declared hook command will execute — ' +
				'untrusted project hooks are skipped with a warning instead of running automatically.'
		)
		.action(() => {
			const color = getColorAdapter();
			const projectDir = getWorkspaceTrustCheckRoot();
			trustWorkspace(projectDir);
			console.log(color.green(`✓ Trusted ${projectDir}`));
		});

	configCmd
		.command('untrust')
		.description("Revoke a previously trusted project's ability to run its own declared hooks.")
		.action(() => {
			const color = getColorAdapter();
			const projectDir = getWorkspaceTrustCheckRoot();
			revokeWorkspaceTrust(projectDir);
			console.log(color.green(`✓ Revoked trust for ${projectDir}`));
		});

	configCmd
		.command('trust-status')
		.description('Show whether the current project is trusted to run its own declared hooks')
		.action(() => {
			const projectDir = getWorkspaceTrustCheckRoot();
			console.log(isWorkspaceTrusted(projectDir) ? `Trusted: ${projectDir}` : `Not trusted: ${projectDir}`);
		});
}
