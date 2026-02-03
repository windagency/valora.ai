/**
 * Help command definitions for CLI
 */

import type { CommandAdapter } from 'cli/command-adapter.interface';

import { getColorAdapter } from 'output/color-adapter.interface';
import { getHelpFormatter } from 'output/help-formatter';
import { formatErrorMessage } from 'utils/error-handler';
import { getAllCommandNames, getCommandHelp, hasCommandHelp, searchCommands } from 'utils/help-content';

/**
 * CLI options for help command
 */
interface HelpOptions extends Record<string, unknown> {
	search?: string;
}

/**
 * Configure help command
 */
export function configureHelpCommand(program: CommandAdapter): void {
	const helpCmd = program.command('help').description('Display help information for commands');

	helpCmd
		.argument('[command]', 'Command to get help for')
		.option('-s, --search <keyword>', 'Search commands by keyword')
		.action((...args: Array<Record<string, unknown>>) => {
			const commandName = args[0] as unknown as string | undefined;
			const options = args[1] as unknown as HelpOptions;
			const color = getColorAdapter();
			const formatter = getHelpFormatter();

			try {
				// Search mode
				if (options['search'] as string | undefined) {
					const results = searchCommands(options['search'] as string);

					console.log(formatter.formatSearchResults(results));
					return;
				}

				// Show overview if no command specified
				if (!commandName) {
					console.log(formatter.formatOverview());
					return;
				}

				// Show command help
				if (!hasCommandHelp(commandName)) {
					console.error(color.red(`\n❌ Command not found: ${commandName}\n`));

					console.log(color.gray('Available commands:'));

					console.log(formatter.formatCommandList(getAllCommandNames()));

					console.log();
					process.exit(1);
				}

				const help = getCommandHelp(commandName);
				if (help) {
					console.log(formatter.formatCommandHelp(help));
				}
			} catch (error) {
				console.error(color.red('Failed to display help:'), formatErrorMessage(error));
				process.exit(1);
			}
		});
}
