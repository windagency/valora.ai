/**
 * Command Palette - Fuzzy searchable command launcher
 *
 * Provides interactive command discovery when running 'ai' with no arguments
 */

import { CommandLoader } from 'executor/command-loader';
import { getColorAdapter } from 'output/color-adapter.interface';
import { getHeaderFormatter } from 'output/header-formatter';
import { getPromptAdapter, type PromptChoice, type PromptSeparator } from 'ui/prompt-adapter.interface';

const prompt = getPromptAdapter();

export interface CommandPaletteItem {
	description: string;
	name: string;
	phase: string;
	value: string;
}

export interface RecentCommand {
	args: string[];
	command: string;
	timestamp: Date;
}

export class CommandPalette {
	private commandLoader: CommandLoader;
	private recentCommands: RecentCommand[] = [];

	constructor(commandLoader?: CommandLoader) {
		this.commandLoader = commandLoader ?? new CommandLoader();
		this.loadRecentCommands();
	}

	/**
	 * Load recent commands from history
	 */
	private loadRecentCommands(): void {
		try {
			// TODO: Load from ~/.ai/history.json or similar
			// For now, using empty array
			this.recentCommands = [];
		} catch {
			// Silently fail - not critical
		}
	}

	/**
	 * Save command to history
	 */
	saveToHistory(command: string, args: string[]): void {
		try {
			this.recentCommands.unshift({
				args,
				command,
				timestamp: new Date()
			});

			// Keep only last 10
			this.recentCommands = this.recentCommands.slice(0, 10);

			// TODO: Persist to ~/.ai/history.json
		} catch {
			// Silently fail - not critical
		}
	}

	/**
	 * Get all available commands
	 */
	private async getAvailableCommands(): Promise<CommandPaletteItem[]> {
		const commandsMap = await this.commandLoader.loadAllCommands();
		const commands = Array.from(commandsMap.values());

		return commands.map((cmd) => ({
			description: cmd.description ?? 'No description available',
			name: cmd.name,
			phase: this.inferPhase(cmd.name),
			value: cmd.name
		}));
	}

	/**
	 * Infer workflow phase from command name
	 */
	private inferPhase(commandName: string): string {
		const phaseMap: Record<string, string> = {
			assert: 'test',
			commit: 'finalize',
			'create-backlog': 'initialize',
			'create-pr': 'finalize',
			'create-prd': 'initialize',
			feedback: 'learn',
			'fetch-task': 'prepare',
			'gather-knowledge': 'workflow',
			implement: 'implement',
			plan: 'workflow',
			'refine-specs': 'initialize',
			'refine-task': 'prepare',
			'review-code': 'review',
			'review-functional': 'review',
			'review-plan': 'workflow',
			test: 'test'
		};

		return phaseMap[commandName] ?? 'other';
	}

	/**
	 * Show the command palette
	 */
	async show(): Promise<null | string> {
		const color = getColorAdapter();
		const headerFormatter = getHeaderFormatter();
		const title = '🎯 What would you like to do?';
		const subtitle = 'Type to search commands, workflows, or tasks...';

		console.log(headerFormatter.formatMultiLineHeader([title, subtitle]));

		const commands = await this.getAvailableCommands();

		// Group commands by phase
		const commandsByPhase = commands.reduce(
			(acc, cmd) => {
				acc[cmd.phase] ??= [];
				// Type guard ensures acc[cmd.phase] is defined after the check above
				const phaseArray = acc[cmd.phase];
				if (phaseArray) {
					phaseArray.push(cmd);
				}
				return acc;
			},
			{} as Record<string, CommandPaletteItem[]>
		);

		// Build choices array with separators
		const choices: Array<CommandPaletteItem | PromptChoice<unknown> | PromptSeparator | string> = [];

		// Add recent commands section if any
		if (this.recentCommands.length > 0) {
			choices.push(new prompt.Separator(color.bold('Recent commands:')));
			this.recentCommands.slice(0, 3).forEach((recent) => {
				const cmd = commands.find((c) => c.name === recent.command);
				if (cmd) {
					choices.push({
						...cmd,
						name: `${cmd.name} ${recent.args.join(' ')}`.trim()
					});
				}
			});
			choices.push(new prompt.Separator());
		}

		// Add commands grouped by phase
		const phaseOrder = ['workflow', 'implement', 'test', 'review', 'finalize', 'prepare', 'initialize', 'learn'];

		phaseOrder.forEach((phase) => {
			if (commandsByPhase[phase] && commandsByPhase[phase].length > 0) {
				choices.push(new prompt.Separator(color.bold(`${phase.charAt(0).toUpperCase() + phase.slice(1)}:`)));
				commandsByPhase[phase].forEach((cmd) => choices.push(cmd));
			}
		});

		// Add quick actions
		choices.push(new prompt.Separator());
		choices.push(new prompt.Separator(color.bold('Quick actions:')));
		choices.push({
			description: 'Configure settings',
			name: 'config',
			phase: 'other',
			value: 'config'
		});
		choices.push({
			description: 'Check system health',
			name: 'doctor',
			phase: 'other',
			value: 'doctor'
		});
		choices.push({
			description: 'List all commands',
			name: 'list',
			phase: 'other',
			value: 'list'
		});
		choices.push({
			description: 'Exit',
			name: 'exit',
			phase: 'other',
			value: 'exit'
		});

		try {
			const answer = await prompt.prompt<{ command: string }>([
				{
					choices,
					loop: false,
					message: 'Select a command:',
					name: 'command',
					pageSize: 15,
					type: 'list'
				}
			]);

			if (answer.command === 'exit') {
				return null;
			}

			return answer.command;
		} catch {
			// User cancelled (Ctrl+C)
			return null;
		}
	}

	/**
	 * Show command palette with autocomplete search
	 * Note: Requires inquirer-autocomplete-prompt plugin
	 */
	async showWithSearch(): Promise<null | string> {
		// Fall back to regular list since autocomplete requires additional plugin
		return this.show();
	}

	/**
	 * Show quick action menu
	 */
	async showQuickActions(): Promise<null | string> {
		const color = getColorAdapter();
		const headerFormatter = getHeaderFormatter();
		console.log(headerFormatter.formatHeader('⚡ Quick Actions', { width: 58 }));

		const choices = [
			{
				name: color.cyan('Continue last session'),
				value: 'session:resume'
			},
			{
				name: color.cyan('View available commands'),
				value: 'list'
			},
			{
				name: color.cyan('Configure settings'),
				value: 'config'
			},
			{
				name: color.cyan('Check system health'),
				value: 'doctor'
			},
			{
				name: color.cyan('View help'),
				value: 'help'
			},
			new prompt.Separator(),
			{
				name: color.gray('Exit'),
				value: 'exit'
			}
		];

		try {
			const answer = await prompt.prompt<{ action: string }>([
				{
					choices,
					message: 'What would you like to do?',
					name: 'action',
					type: 'list'
				}
			]);

			if (answer.action === 'exit') {
				return null;
			}

			return answer.action;
		} catch {
			return null;
		}
	}
}

/**
 * Show command palette
 */
export async function showCommandPalette(): Promise<null | string> {
	const palette = new CommandPalette();
	return palette.show();
}
