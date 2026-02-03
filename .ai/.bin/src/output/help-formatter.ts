/**
 * Rich formatting utilities for help output using box-drawing characters
 */

import { type CommandHelp, getGlobalFlagsByCategory, type SubcommandHelp, WORKFLOW_PHASES } from 'utils/help-content';

import { getColorAdapter } from './color-adapter.interface';
import { getHeaderFormatter } from './header-formatter';

export class HelpFormatter {
	/**
	 * Format the help header with box
	 */
	formatHeader(title: string, subtitle?: string): string {
		const headerFormatter = getHeaderFormatter();
		if (subtitle) {
			return headerFormatter.formatMultiLineHeader([title, subtitle], { maxWidth: 70 }).trim();
		}
		return headerFormatter.formatHeader(title, { maxWidth: 70 }).trim();
	}

	/**
	 * Format a section header
	 */
	formatSection(title: string): string {
		const colorAdapter = getColorAdapter();
		const width = Math.min(title.length, 60);
		return '\n' + colorAdapter.bold(title) + '\n' + colorAdapter.gray('─'.repeat(width));
	}

	/**
	 * Format workflow phase indicator
	 */
	formatWorkflowPhase(phase: string): string {
		const phaseInfo = WORKFLOW_PHASES[phase as keyof typeof WORKFLOW_PHASES];
		if (!phaseInfo) return phase;

		const colorFn = this.getColorFunction(phaseInfo.color);
		return colorFn(`${phaseInfo.icon} ${phaseInfo.name} Phase`);
	}

	/**
	 * Get color function by name using object lookup
	 */
	private getColorFunction(colorName: string): (text: string) => string {
		const colorAdapter = getColorAdapter();

		const colorMap: Record<string, (text: string) => string> = {
			blue: (text) => colorAdapter.blue(text),
			cyan: (text) => colorAdapter.cyan(text),
			green: (text) => colorAdapter.green(text),
			magenta: (text) => colorAdapter.magenta(text),
			red: (text) => colorAdapter.red(text),
			white: (text) => colorAdapter.white(text),
			yellow: (text) => colorAdapter.yellow(text)
		};

		return colorMap[colorName] ?? ((text) => colorAdapter.white(text));
	}

	/**
	 * Format command usage
	 */
	formatUsage(commandName: string, argumentHint?: string): string {
		const colorAdapter = getColorAdapter();
		const usage = argumentHint ? `valora ${commandName} ${argumentHint}` : `valora ${commandName} [options]`;
		return '  ' + colorAdapter.yellow(usage);
	}

	/**
	 * Format examples section
	 */
	formatExamples(examples: Array<{ code: string; description: string }>): string {
		const colorAdapter = getColorAdapter();
		const lines = examples.flatMap((example) => [
			'  ' + colorAdapter.gray(`# ${example.description}`),
			'  ' + colorAdapter.green(`$ ${example.code}`),
			''
		]);

		return lines.join('\n');
	}

	/**
	 * Format options section
	 */
	formatOptions(options: Array<{ default?: string; description: string; flag: string }>): string {
		const colorAdapter = getColorAdapter();
		const maxFlagLength = Math.max(...options.map((o) => o.flag.length));

		const lines = options.map((option) => {
			const padding = ' '.repeat(maxFlagLength - option.flag.length + 2);
			const flag = colorAdapter.cyan(option.flag);
			const description = colorAdapter.gray(option.description);
			const defaultValue = option.default ? colorAdapter.yellow(` (default: ${option.default})`) : '';

			return `  ${flag}${padding}${description}${defaultValue}`;
		});

		return lines.join('\n');
	}

	/**
	 * Format related commands as a tree
	 */
	formatRelatedCommands(relatedCommands: string[]): string {
		const colorAdapter = getColorAdapter();

		if (relatedCommands.length === 0) {
			return colorAdapter.gray('  None');
		}

		const lines = relatedCommands.map((cmd, index) => {
			const isLast = index === relatedCommands.length - 1;
			const prefix = isLast ? '└─' : '├─';
			return '  ' + colorAdapter.gray(prefix) + ' ' + colorAdapter.cyan(cmd);
		});

		return lines.join('\n');
	}

	/**
	 * Format agent information
	 */
	formatAgent(agent: string): string {
		const colorAdapter = getColorAdapter();
		if (agent === 'system') {
			return '  ' + colorAdapter.gray('🔧 System utility (no agent)');
		}
		return '  ' + colorAdapter.magenta(`🤖 Agent: ${agent}`);
	}

	/**
	 * Format subcommands section
	 */
	formatSubcommands(subcommands: SubcommandHelp[], parentCommand: string): string {
		const colorAdapter = getColorAdapter();

		const lines = subcommands.flatMap((sub) => {
			const result = [
				'  ' + colorAdapter.cyan(`valora ${parentCommand} ${sub.name}`),
				'     ' + colorAdapter.gray(sub.description)
			];

			if (sub.options && sub.options.length > 0) {
				const optionLines = sub.options.map((opt) => {
					const defaultVal = opt.default ? colorAdapter.yellow(` (default: ${opt.default})`) : '';
					return '     ' + colorAdapter.gray(`  ${opt.flag}`) + colorAdapter.gray(` - ${opt.description}`) + defaultVal;
				});
				result.push(...optionLines);
			}

			result.push('');
			return result;
		});

		return lines.join('\n');
	}

	/**
	 * Format global flags section
	 */
	formatGlobalFlags(): string {
		const colorAdapter = getColorAdapter();
		const grouped = getGlobalFlagsByCategory();

		const lines = Object.entries(grouped).flatMap(([category, flags]) => [
			'  ' + colorAdapter.bold(category),
			...flags.map((flag) => {
				const defaultVal = flag.default ? colorAdapter.yellow(` (default: ${flag.default})`) : '';
				return '    ' + colorAdapter.cyan(flag.flag) + '  ' + colorAdapter.gray(flag.description) + defaultVal;
			}),
			''
		]);

		return lines.join('\n');
	}

	/**
	 * Format common global flags for command help (subset of most useful flags)
	 */
	formatCommonGlobalFlags(): string {
		const colorAdapter = getColorAdapter();

		const commonFlags = [
			{ description: 'Preview changes with diffs (no execution)', flag: '-n, --dry-run' },
			{ description: 'Enable verbose output', flag: '-v, --verbose' },
			{ description: 'Override AI model', flag: '--model <name>' },
			{ description: 'Disable interactive prompts', flag: '--no-interactive' }
		];

		const flagLines = commonFlags.map(
			(flag) => '  ' + colorAdapter.cyan(flag.flag.padEnd(20)) + ' ' + colorAdapter.gray(flag.description)
		);

		return [...flagLines, '', '  ' + colorAdapter.gray('Run `valora help` for all global flags')].join('\n');
	}

	/**
	 * Format full command help
	 */
	formatCommandHelp(help: CommandHelp): string {
		const colorAdapter = getColorAdapter();
		const lines: string[] = [];

		// Header
		lines.push(this.formatHeader(help.name, help.description));
		lines.push('');

		// Workflow Phase
		lines.push(this.formatSection('WORKFLOW POSITION'));
		lines.push('  ' + this.formatWorkflowPhase(help.workflowPhase));
		lines.push('');

		// Usage
		lines.push(this.formatSection('USAGE'));
		if (help.subcommands && help.subcommands.length > 0) {
			lines.push(this.formatUsage(help.name, '<subcommand> [options]'));
		} else {
			lines.push(this.formatUsage(help.name));
		}
		lines.push('');

		// Subcommands (for parent commands like config, session, monitoring)
		if (help.subcommands && help.subcommands.length > 0) {
			lines.push(this.formatSection('SUBCOMMANDS'));
			lines.push(this.formatSubcommands(help.subcommands, help.name));
		}

		// Examples
		if (help.examples.length > 0) {
			lines.push(this.formatSection('EXAMPLES'));
			lines.push(this.formatExamples(help.examples));
		}

		// Options (command-specific)
		if (help.options.length > 0) {
			lines.push(this.formatSection('OPTIONS'));
			lines.push(this.formatOptions(help.options));
			lines.push('');
		}

		// Global flags (always show for workflow commands)
		if (help.workflowPhase !== 'system') {
			lines.push(this.formatSection('GLOBAL FLAGS'));
			lines.push(this.formatCommonGlobalFlags());
			lines.push('');
		}

		// Related Commands
		if (help.relatedCommands.length > 0) {
			lines.push(this.formatSection('RELATED COMMANDS'));
			lines.push(this.formatRelatedCommands(help.relatedCommands));
			lines.push('');
		}

		// Agent (only show for workflow commands, not system utilities)
		if (help.workflowPhase !== 'system') {
			lines.push(this.formatSection('AGENT ASSIGNED'));
			lines.push(this.formatAgent(help.agent));
			lines.push('');
		}

		// Footer with links
		lines.push(colorAdapter.gray('  📚 Full docs: https://docs.ai-orchestration.dev/commands/' + help.name));
		lines.push(colorAdapter.gray('  💬 Get help: valora help'));
		lines.push('');

		return lines.join('\n');
	}

	/**
	 * Format command list
	 */
	formatCommandList(commands: string[]): string {
		const colorAdapter = getColorAdapter();
		const columns = 3;
		const maxCmdLength = Math.max(...commands.map((c) => c.length));
		const columnWidth = Math.min(maxCmdLength + 4, 25);

		const lines = Array.from({ length: Math.ceil(commands.length / columns) }, (_, i) => {
			const row = Array.from({ length: columns }, (_, j) => {
				const cmd = commands[i * columns + j];
				if (!cmd) return '';
				const padding = ' '.repeat(Math.max(0, columnWidth - cmd.length - 2));
				return colorAdapter.cyan(cmd) + padding;
			}).filter(Boolean);

			return '  ' + row.join('');
		});

		return lines.join('\n');
	}

	/**
	 * Format search results
	 */
	formatSearchResults(results: CommandHelp[]): string {
		const colorAdapter = getColorAdapter();

		if (results.length === 0) {
			return colorAdapter.yellow('No commands found matching your search.');
		}

		const lines = [
			colorAdapter.bold(`\nFound ${results.length} command(s):\n`),
			...results.flatMap((help) => [
				colorAdapter.cyan(`  ${help.name}`),
				colorAdapter.gray(`    ${help.description}`),
				''
			])
		];

		return lines.join('\n');
	}

	/**
	 * Format help overview (when no command specified)
	 */
	formatOverview(): string {
		const colorAdapter = getColorAdapter();
		const lines: string[] = [];

		lines.push(this.formatHeader('VALORA', 'Command Line Interface'));
		lines.push('');

		lines.push(colorAdapter.bold('  VALORA - AI-Assisted Development Workflow Orchestration\n'));

		lines.push(this.formatSection('WORKFLOW PHASES'));
		lines.push('');

		const phases = [
			{ commands: ['refine-specs', 'create-prd', 'create-backlog'], name: 'initialize', phase: 'Initialize' },
			{ commands: ['fetch-task', 'refine-task'], name: 'prepare', phase: 'Prepare Task' },
			{ commands: ['gather-knowledge', 'plan', 'review-plan'], name: 'workflow', phase: 'Planning' },
			{ commands: ['implement'], name: 'implement', phase: 'Implement' },
			{ commands: ['assert', 'test'], name: 'test', phase: 'Validate' },
			{ commands: ['review-code', 'review-functional'], name: 'review', phase: 'Review' },
			{ commands: ['commit', 'create-pr'], name: 'finalize', phase: 'Finalize' },
			{ commands: ['feedback'], name: 'learn', phase: 'Learn' }
		];

		lines.push(
			...phases.flatMap(({ commands, name, phase }) => {
				const phaseInfo = WORKFLOW_PHASES[name as keyof typeof WORKFLOW_PHASES];
				const colorFn = this.getColorFunction(phaseInfo.color);

				return [
					'  ' + colorFn(`${phaseInfo.icon} ${phase}`),
					...commands.map((cmd) => '     ' + colorAdapter.cyan(cmd)),
					''
				];
			})
		);

		lines.push(this.formatSection('SYSTEM COMMANDS'));
		lines.push('');
		lines.push('  ' + colorAdapter.gray('🔧 System'));
		lines.push(
			'     ' + colorAdapter.cyan('config') + '      ' + colorAdapter.gray('Manage configuration and providers')
		);
		lines.push(
			'     ' + colorAdapter.cyan('session') + '     ' + colorAdapter.gray('Manage sessions (list, resume, cleanup)')
		);
		lines.push(
			'     ' + colorAdapter.cyan('monitoring') + '  ' + colorAdapter.gray('Performance metrics and resource usage')
		);
		lines.push('     ' + colorAdapter.cyan('dashboard') + '   ' + colorAdapter.gray('Real-time TUI dashboard'));
		lines.push('     ' + colorAdapter.cyan('doctor') + '      ' + colorAdapter.gray('Run diagnostic checks'));
		lines.push('     ' + colorAdapter.cyan('rollout') + '     ' + colorAdapter.gray('Monitor feature rollout status'));
		lines.push('     ' + colorAdapter.cyan('list') + '        ' + colorAdapter.gray('List all available commands'));
		lines.push('     ' + colorAdapter.cyan('exec') + '        ' + colorAdapter.gray('Execute command with options'));
		lines.push('     ' + colorAdapter.cyan('help') + '        ' + colorAdapter.gray('Display help information'));
		lines.push('');

		lines.push(this.formatSection('QUICK START'));
		lines.push('');
		lines.push('  ' + colorAdapter.green('$ valora plan "Add user authentication"'));
		lines.push('  ' + colorAdapter.gray('  └─ Create an implementation plan'));
		lines.push('');
		lines.push('  ' + colorAdapter.green('$ valora implement'));
		lines.push('  ' + colorAdapter.gray('  └─ Execute the plan'));
		lines.push('');
		lines.push('  ' + colorAdapter.green('$ valora test'));
		lines.push('  ' + colorAdapter.gray('  └─ Run tests'));
		lines.push('');
		lines.push('  ' + colorAdapter.green('$ valora commit'));
		lines.push('  ' + colorAdapter.gray('  └─ Create conventional commit'));
		lines.push('');

		lines.push(this.formatSection('GETTING HELP'));
		lines.push('');
		lines.push(
			'  ' + colorAdapter.cyan('valora help <command>') + '     ' + colorAdapter.gray('Detailed help for a command')
		);
		lines.push('  ' + colorAdapter.cyan('valora list') + '                ' + colorAdapter.gray('List all commands'));
		lines.push(
			'  ' + colorAdapter.cyan('valora config setup') + '        ' + colorAdapter.gray('Configure API providers')
		);
		lines.push('  ' + colorAdapter.cyan('valora doctor') + '              ' + colorAdapter.gray('Check system health'));
		lines.push('');

		lines.push(this.formatSection('GLOBAL FLAGS'));
		lines.push('');
		lines.push('  ' + colorAdapter.gray('Use --help on any command for specific options. Common flags:'));
		lines.push('');
		lines.push('  ' + colorAdapter.cyan('-v, --verbose') + '          ' + colorAdapter.gray('Enable verbose output'));
		lines.push(
			'  ' + colorAdapter.cyan('-q, --quiet') + '            ' + colorAdapter.gray('Suppress non-essential output')
		);
		lines.push(
			'  ' +
				colorAdapter.cyan('-n, --dry-run') +
				'          ' +
				colorAdapter.gray('Preview changes with diffs (no execution)')
		);
		lines.push('  ' + colorAdapter.cyan('--session-id <id>') + '      ' + colorAdapter.gray('Use specific session'));
		lines.push('  ' + colorAdapter.cyan('--model <name>') + '         ' + colorAdapter.gray('Override AI model'));
		lines.push('  ' + colorAdapter.cyan('--provider <name>') + '      ' + colorAdapter.gray('Override LLM provider'));
		lines.push(
			'  ' + colorAdapter.cyan('--no-interactive') + '       ' + colorAdapter.gray('Disable interactive prompts')
		);
		lines.push('');

		lines.push(colorAdapter.gray('  📚 Documentation: https://docs.ai-orchestration.dev'));
		lines.push(colorAdapter.gray('  💬 Support: https://github.com/valora/issues'));
		lines.push('');

		return lines.join('\n');
	}
}

/**
 * Get singleton help formatter instance
 */
let formatterInstance: HelpFormatter | null = null;

export function getHelpFormatter(): HelpFormatter {
	formatterInstance ??= new HelpFormatter();
	return formatterInstance;
}
