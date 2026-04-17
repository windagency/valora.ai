/**
 * Command loader - loads command definitions from markdown files
 */

import type { CommandDefinition, CommandMetadata } from 'types/command.types';

import { getLogger } from 'output/logger';
import { fileExists, readFile } from 'utils/file-utils';
import { parseMarkdownWithFrontmatter } from 'utils/yaml-parser';

import { commandFileExists, getCommandFilePath, listAvailableCommands, validateCommandName } from './command-discovery';
import { handleCommandLoadError, validateCommandMetadata } from './command-validation';

export class CommandLoader {
	private cache: Map<string, CommandDefinition> = new Map();
	private pluginDirs = new Set<string>();

	constructor(private commandsDir?: string) {
		// commandsDir is handled by the imported functions
	}

	/**
	 * Register an additional command directory contributed by a plugin.
	 */
	registerPluginDir(dir: string): void {
		this.pluginDirs.add(dir);
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

		const filePath = this.resolveCommandFilePath(commandName);

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
	 * Resolve the file path for a command, checking plugin dirs if not in the primary dir.
	 */
	private resolveCommandFilePath(commandName: string): string {
		const primary = getCommandFilePath(commandName, this.commandsDir);
		if (fileExists(primary)) return primary;

		for (const pluginDir of this.pluginDirs) {
			const candidate = getCommandFilePath(commandName, pluginDir);
			if (fileExists(candidate)) return candidate;
		}

		return primary;
	}

	/**
	 * Load all commands
	 */
	async loadAllCommands(): Promise<Map<string, CommandDefinition>> {
		const logger = getLogger();
		const primaryNames = await listAvailableCommands(this.commandsDir);
		const pluginNames = (
			await Promise.all([...this.pluginDirs].map((dir) => listAvailableCommands(dir).catch(() => [] as string[])))
		).flat();
		const commandNames = [...new Set([...pluginNames, ...primaryNames])];

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
	 * List available command names from primary and plugin directories.
	 */
	async listCommands(): Promise<string[]> {
		const primary = await listAvailableCommands(this.commandsDir);
		const plugin = (
			await Promise.all([...this.pluginDirs].map((dir) => listAvailableCommands(dir).catch(() => [] as string[])))
		).flat();
		return [...new Set([...plugin, ...primary])];
	}

	/**
	 * Check if a command exists across primary and plugin directories.
	 */
	async commandExists(commandName: string): Promise<boolean> {
		validateCommandName(commandName);
		if (await commandFileExists(commandName, this.commandsDir)) return true;
		for (const dir of this.pluginDirs) {
			if (await commandFileExists(commandName, dir).catch(() => false)) return true;
		}
		return false;
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
