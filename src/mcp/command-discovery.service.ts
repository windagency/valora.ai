/**
 * Command Discovery Service - Handles discovery and loading of available commands
 */

import type { CommandLoader } from 'executor/command-loader';
import type { CommandDefinition } from 'types/command.types';

import { getLogger } from 'output/logger';

export class CommandDiscoveryService {
	constructor(private commandLoader: CommandLoader) {}

	/**
	 * Discover all available commands (lazy loading - only metadata)
	 */
	async discoverCommands(): Promise<CommandDefinition[]> {
		const logger = getLogger();
		logger.debug('Discovering available commands (lazy loading)');

		try {
			const commandNames = await this.commandLoader.listCommands();

			const commandPromises = commandNames.map(async (commandName) => {
				try {
					// Load command metadata only for memory efficiency (lazy load content)
					return await this.commandLoader.loadCommand(commandName, false);
				} catch (error) {
					logger.warn(`Failed to load command: ${commandName}`, {
						error: (error as Error).message
					});
					return null;
				}
			});

			const results = await Promise.all(commandPromises);
			const commands = results.filter((cmd): cmd is CommandDefinition => cmd !== null);

			logger.debug('Command discovery complete', {
				commandNames: commands.map((c) => c.name),
				total: commands.length,
				totalMemoryUsage: this.estimateMemoryUsage(commands)
			});

			return commands;
		} catch (error) {
			logger.error('Failed to discover commands', error as Error);
			throw error;
		}
	}

	/**
	 * Estimate memory usage of loaded commands for monitoring
	 */
	private estimateMemoryUsage(commands: CommandDefinition[]): string {
		const totalChars = commands.reduce((sum, cmd) => sum + (cmd.content?.length ?? 0), 0);
		const totalKb = Math.round(totalChars / 1024);
		return `${totalKb}KB`;
	}

	/**
	 * Get command names only (lighter weight than full discovery)
	 */
	async listCommandNames(): Promise<string[]> {
		return this.commandLoader.listCommands();
	}

	/**
	 * Load a specific command by name
	 */
	async loadCommand(commandName: string): Promise<CommandDefinition> {
		return this.commandLoader.loadCommand(commandName);
	}
}
