/**
 * Shell Autocomplete Generator
 *
 * Generates completion scripts for bash, zsh, and fish shells
 */

import { CommandLoader } from 'executor/command-loader';
import * as fs from 'fs/promises';
import * as os from 'os';
import { getColorAdapter } from 'output/color-adapter.interface';
import { getConsoleOutput } from 'output/console-output';
import * as path from 'path';

import type { CommandAdapter } from './command-adapter.interface';

export type ShellType = 'bash' | 'fish' | 'zsh';

export class AutocompleteGenerator {
	private commandLoader: CommandLoader;

	constructor(commandLoader?: CommandLoader) {
		this.commandLoader = commandLoader ?? new CommandLoader();
	}

	/**
	 * Detect current shell
	 */
	detectShell(): null | ShellType {
		const shellEnv = process.env['SHELL'] ?? '';
		const shells: ShellType[] = ['zsh', 'bash', 'fish'];

		return shells.find((shell) => shellEnv.includes(shell)) ?? null;
	}

	/**
	 * Get all available commands
	 */
	private async getCommands(): Promise<string[]> {
		const commandNames = await this.commandLoader.listCommands();
		return commandNames;
	}

	/**
	 * Generate bash completion script
	 */
	private async generateBashCompletion(): Promise<string> {
		const commands = await this.getCommands();

		return `#!/bin/bash
# VALORA completion script for Bash
# Generated automatically - do not edit manually

_valora_completion() {
    local cur prev opts
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev="\${COMP_WORDS[COMP_CWORD-1]}"

    # Commands
    local commands="${commands.join(' ')}"

    # Global options
    local opts="--help --version --verbose --quiet --dry-run --interactive --no-interactive"
    opts="$opts --session --model --provider --mode --agent --output --log-level"

    # Command-specific completion
    case "\${COMP_CWORD}" in
        1)
            # First argument: complete commands
            COMPREPLY=( $(compgen -W "$commands" -- "$cur") )
            return 0
            ;;
        *)
            # Subsequent arguments: complete options
            case "$prev" in
                --session)
                    # Complete session IDs
                    local sessions=$(ls -1 ~/.valora/sessions 2>/dev/null | tr '\\n' ' ')
                    COMPREPLY=( $(compgen -W "$sessions" -- "$cur") )
                    return 0
                    ;;
                --model)
                    # Complete model names
                    local models="gpt-5-thinking-high claude-opus-4.5 claude-sonnet-4.5 claude-haiku-4.5 auto"
                    COMPREPLY=( $(compgen -W "$models" -- "$cur") )
                    return 0
                    ;;
                --provider)
                    # Complete provider names
                    local providers="cursor anthropic openai google"
                    COMPREPLY=( $(compgen -W "$providers" -- "$cur") )
                    return 0
                    ;;
                --output)
                    # Complete output formats
                    local formats="text json yaml markdown interactive"
                    COMPREPLY=( $(compgen -W "$formats" -- "$cur") )
                    return 0
                    ;;
                *)
                    # Default: complete options
                    COMPREPLY=( $(compgen -W "$opts" -- "$cur") )
                    return 0
                    ;;
            esac
            ;;
    esac
}

complete -F _valora_completion valora
`;
	}

	/**
	 * Generate zsh completion script
	 */
	private async generateZshCompletion(): Promise<string> {
		const commands = await this.getCommands();

		const commandsList = commands.map((cmd) => `    '${cmd}:${cmd} command'`).join('\n');

		return `#compdef valora
# VALORA completion script for Zsh
# Generated automatically - do not edit manually

_valora() {
    local -a commands
    commands=(
${commandsList}
    )

    local -a opts
    opts=(
        '(-h --help)'{-h,--help}'[Show help information]'
        '(-v --version)'{-v,--version}'[Show version information]'
        '--verbose[Enable verbose output]'
        '--quiet[Suppress non-essential output]'
        '--dry-run[Preview without executing]'
        '--interactive[Enable interactive prompts]'
        '--no-interactive[Disable interactive prompts]'
        '--session[Session ID]:session:_valora_sessions'
        '--model[AI model]:model:(gpt-5-thinking-high claude-opus-4.5 claude-sonnet-4.5 claude-haiku-4.5 auto)'
        '--provider[AI provider]:provider:(cursor anthropic openai google)'
        '--output[Output format]:format:(text json yaml markdown interactive)'
        '--log-level[Log level]:level:(error warn info debug)'
    )

    _arguments -C \\
        '1: :->command' \\
        '*:: :->args'

    case $state in
        command)
            _describe 'valora commands' commands
            ;;
        args)
            _arguments $opts
            ;;
    esac
}

_valora_sessions() {
    local sessions
    sessions=($(/bin/ls -1 ~/.valora/sessions 2>/dev/null))
    _describe 'sessions' sessions
}

_valora
`;
	}

	/**
	 * Generate fish completion script
	 */
	private async generateFishCompletion(): Promise<string> {
		const commands = await this.getCommands();

		const globalOptions = [
			{ desc: 'Show help information', long: 'help', short: 'h' },
			{ desc: 'Show version information', long: 'version', short: 'v' },
			{ desc: 'Enable verbose output', long: 'verbose' },
			{ desc: 'Suppress non-essential output', long: 'quiet' },
			{ desc: 'Preview without executing', long: 'dry-run' },
			{ desc: 'Enable interactive prompts', long: 'interactive' },
			{ desc: 'Disable interactive prompts', long: 'no-interactive' }
		];

		const optionsWithArgs = [
			{ desc: 'Session ID', long: 'session', values: '(ls ~/.valora/sessions 2>/dev/null)' },
			{
				desc: 'AI model',
				long: 'model',
				values: 'gpt-5-thinking-high claude-opus-4.5 claude-sonnet-4.5 claude-haiku-4.5 auto'
			},
			{ desc: 'AI provider', long: 'provider', values: 'cursor anthropic openai google' },
			{ desc: 'Output format', long: 'output', values: 'text json yaml markdown interactive' },
			{ desc: 'Log level', long: 'log-level', values: 'error warn info debug' }
		];

		const commandsList = commands.map((cmd) => `complete -c valora -f -a '${cmd}' -d '${cmd} command'`).join('\n');

		const globalOptionsList = globalOptions
			.map(({ desc, long, short }) => {
				const shortFlag = short ? ` -s ${short}` : '';
				return `complete -c valora -l ${long}${shortFlag} -d '${desc}'`;
			})
			.join('\n');

		const optionsWithArgsList = optionsWithArgs
			.map(({ desc, long, values }) => `complete -c valora -l ${long} -d '${desc}' -f -a '${values}'`)
			.join('\n');

		return `# VALORA completion script for Fish
# Generated automatically - do not edit manually

# Clear existing completions
complete -c valora -e

# Commands
${commandsList}

# Global options
${globalOptionsList}

# Options with arguments
${optionsWithArgsList}
`;
	}

	/**
	 * Generate completion script for shell
	 */
	async generate(shell: ShellType): Promise<string> {
		const generators: Record<ShellType, () => Promise<string>> = {
			bash: () => this.generateBashCompletion(),
			fish: () => this.generateFishCompletion(),
			zsh: () => this.generateZshCompletion()
		};

		const generator = generators[shell];
		if (!generator) {
			throw new Error(`Unsupported shell: ${shell}`);
		}

		return generator();
	}

	/**
	 * Get installation path for shell
	 */
	private getInstallPath(shell: ShellType): string {
		const homeDir = os.homedir();

		const installPaths: Record<ShellType, string> = {
			bash: path.join(homeDir, '.bash_completion.d', 'valora'),
			fish: path.join(homeDir, '.config', 'fish', 'completions', 'valora.fish'),
			zsh: path.join(homeDir, '.zsh', 'completions', '_valora')
		};

		const installPath = installPaths[shell];
		if (!installPath) {
			throw new Error(`Unsupported shell: ${shell}`);
		}

		return installPath;
	}

	/**
	 * Install completion script
	 */
	async install(shell?: ShellType): Promise<void> {
		const console = getConsoleOutput();
		const targetShell = shell ?? this.detectShell();

		if (!targetShell) {
			throw new Error(
				'Could not detect shell. Please specify shell explicitly: valora completion install --shell=bash|zsh|fish'
			);
		}

		console.blank();
		console.info(`Installing ${targetShell} completion...`);

		// Generate completion script
		const script = await this.generate(targetShell);

		// Get installation path
		const installPath = this.getInstallPath(targetShell);
		const installDir = path.dirname(installPath);

		// Create directory if it doesn't exist
		await fs.mkdir(installDir, { recursive: true });

		// Write completion script
		await fs.writeFile(installPath, script, { mode: 0o755 });

		console.success(`Completion script installed to: ${installPath}`);
		console.blank();

		// Show post-install instructions
		this.showPostInstallInstructions(targetShell, installPath);
	}

	/**
	 * Show post-installation instructions
	 */
	private showPostInstallInstructions(shell: ShellType, installPath: string): void {
		const color = getColorAdapter();
		const consoleOut = getConsoleOutput();

		consoleOut.bold('📝 POST-INSTALLATION STEPS');
		consoleOut.blank();

		const instructions: Record<ShellType, (installPath: string) => void> = {
			bash: (installPath: string) => {
				consoleOut.print(`  Add this line to your ~/.bashrc:`);
				consoleOut.print(`  ${color.cyan(`source ${installPath}`)}`);
				consoleOut.blank();
				consoleOut.print(`  Then reload your shell:`);
				consoleOut.print(`  ${color.cyan('source ~/.bashrc')}`);
			},
			fish: (installPath: string) => {
				consoleOut.print(`  Fish automatically loads completions from:`);
				consoleOut.dim(`  ${path.dirname(installPath)}`);
				consoleOut.blank();
				consoleOut.print(`  Reload completions:`);
				consoleOut.print(`  ${color.cyan('fish_update_completions')}`);
			},
			zsh: (installPath: string) => {
				consoleOut.print(`  Make sure fpath includes the completion directory.`);
				consoleOut.print(`  Add these lines to your ~/.zshrc:`);
				consoleOut.print(`  ${color.cyan(`fpath=(${path.dirname(installPath)} $fpath)`)}`);
				consoleOut.print(`  ${color.cyan('autoload -Uz compinit && compinit')}`);
				consoleOut.blank();
				consoleOut.print(`  Then reload your shell:`);
				consoleOut.print(`  ${color.cyan('source ~/.zshrc')}`);
			}
		};

		const showInstructions = instructions[shell];
		if (showInstructions) {
			showInstructions(installPath);
		}

		consoleOut.blank();
		consoleOut.success('All set! Try typing: valora <TAB>');
		consoleOut.blank();
	}

	/**
	 * Uninstall completion script
	 */
	async uninstall(shell?: ShellType): Promise<void> {
		const console = getConsoleOutput();
		const targetShell = shell ?? this.detectShell();

		if (!targetShell) {
			throw new Error('Could not detect shell. Please specify shell explicitly: --shell=bash|zsh|fish');
		}

		console.blank();
		console.info(`Uninstalling ${targetShell} completion...`);

		const installPath = this.getInstallPath(targetShell);

		try {
			await fs.unlink(installPath);
			console.success(`Completion script removed from: ${installPath}`);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				console.warn('Completion script not found (already uninstalled)');
			} else {
				throw error;
			}
		}

		console.blank();
	}

	/**
	 * Check if completion is installed
	 */
	async isInstalled(shell?: ShellType): Promise<boolean> {
		const targetShell = shell ?? this.detectShell();

		if (!targetShell) {
			return false;
		}

		const installPath = this.getInstallPath(targetShell);

		try {
			await fs.access(installPath);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Show status of completion installation
	 */
	async status(): Promise<void> {
		const color = getColorAdapter();
		const consoleOut = getConsoleOutput();

		consoleOut.blank();
		consoleOut.info('Autocomplete Status');
		consoleOut.blank();

		const shells: ShellType[] = ['bash', 'zsh', 'fish'];

		// Use Promise.all to check all shells in parallel
		const shellStatuses = await Promise.all(
			shells.map(async (shell) => ({
				installed: await this.isInstalled(shell),
				installPath: this.getInstallPath(shell),
				shell
			}))
		);

		// Display results
		shellStatuses.forEach(({ installed, installPath, shell }) => {
			const status = installed ? color.green('✓ Installed') : color.gray('Not installed');
			consoleOut.print(`  ${shell.padEnd(6)} ${status}`);
			if (installed) {
				consoleOut.dim(`         ${installPath}`);
			}
		});

		consoleOut.blank();

		const currentShell = this.detectShell();
		if (currentShell) {
			const isCurrentInstalled = await this.isInstalled(currentShell);
			if (!isCurrentInstalled) {
				consoleOut.warn(`Tip: Install completion for your shell (${currentShell})`);
				consoleOut.print(color.cyan('   $ valora completion install'));
				consoleOut.blank();
			}
		}
	}
}

/**
 * Configure completion command
 */
export function configureCompletionCommand(program: CommandAdapter): void {
	const completion = program.command('completion').description('Manage shell autocompletion');

	completion
		.command('install')
		.description('Install shell completion')
		.option('--shell <type>', 'Shell type (bash, zsh, fish)')
		.action(async (options: { shell?: string }) => {
			const generator = new AutocompleteGenerator();
			await generator.install(options.shell as ShellType);
		});

	completion
		.command('uninstall')
		.description('Uninstall shell completion')
		.option('--shell <type>', 'Shell type (bash, zsh, fish)')
		.action(async (options: { shell?: string }) => {
			const generator = new AutocompleteGenerator();
			await generator.uninstall(options.shell as ShellType);
		});

	completion
		.command('status')
		.description('Show completion installation status')
		.action(async () => {
			const generator = new AutocompleteGenerator();
			await generator.status();
		});

	completion
		.command('generate')
		.description('Generate completion script')
		.option('--shell <type>', 'Shell type (bash, zsh, fish)', 'bash')
		.action(async (...args: Array<Record<string, unknown>>) => {
			const options = args[0] as unknown as { shell: string };
			const generator = new AutocompleteGenerator();
			const script = await generator.generate(options.shell as ShellType);
			console.log(script);
		});
}
