/**
 * Command loader - loads command definitions from markdown files
 */

import type { CommandDefinition, CommandMetadata } from 'types/command.types';

import { getLogger } from 'output/logger';
import { readFile } from 'utils/file-utils';
import { parseMarkdownWithFrontmatter } from 'utils/yaml-parser';

import { commandFileExists, getCommandFilePath, listAvailableCommands, validateCommandName } from './command-discovery';
import { handleCommandLoadError, validateCommandMetadata } from './command-validation';

export class CommandLoader {
	private cache: Map<string, CommandDefinition> = new Map();

	constructor(private commandsDir?: string) {
		// commandsDir is handled by the imported functions
	}

	/**
	 * Load a specific command by name
	 */
	async loadCommand(commandName: string, loadContent: boolean = true): Promise<CommandDefinition> {
		// Validate command name for security
		validateCommandName(commandName);

		// Check cache first
		if (this.cache.has(commandName)) {
			return this.cache.get(commandName)!;
		}

		const filePath = getCommandFilePath(commandName, this.commandsDir);

		try {
			const content = await readFile(filePath);
			const parsed = parseMarkdownWithFrontmatter<CommandMetadata>(content, filePath);

			// Validate command metadata using the validation module
			validateCommandMetadata(parsed.metadata, filePath);

			const command: CommandDefinition = {
				...parsed.metadata,
				content: loadContent ? parsed.content : '' // Lazy load content
			};

			// Cache the command
			this.cache.set(commandName, command);

			return command;
		} catch (error) {
			handleCommandLoadError(error, commandName, filePath);
		}
	}

	/**
	 * Load all commands
	 */
	async loadAllCommands(): Promise<Map<string, CommandDefinition>> {
		const logger = getLogger();
		const commandNames = await listAvailableCommands(this.commandsDir);

		// Load all commands in parallel
		const commandEntries = await Promise.all(
			commandNames.map(async (commandName) => {
				try {
					const command = await this.loadCommand(commandName);
					return { command, commandName };
				} catch (error) {
					logger.warn(`Failed to load command ${commandName}`, { error: (error as Error).message });
					return null;
				}
			})
		);

		// Convert successful entries to Map, filtering out failed loads
		return new Map(
			commandEntries
				.filter((entry): entry is { command: CommandDefinition; commandName: string } => entry !== null)
				.map(({ command, commandName }) => [commandName, command])
		);
	}

	/**
	 * List available command names
	 */
	async listCommands(): Promise<string[]> {
		return listAvailableCommands(this.commandsDir);
	}

	/**
	 * Check if a command exists
	 */
	async commandExists(commandName: string): Promise<boolean> {
		// Validate command name for security
		validateCommandName(commandName);
		return commandFileExists(commandName, this.commandsDir);
	}

	/**
	 * Clear cache
	 */
	clearCache(): void {
		this.cache.clear();
	}

	/**
	 * Get cache size
	 */
	getCacheSize(): number {
		return this.cache.size;
	}
}
