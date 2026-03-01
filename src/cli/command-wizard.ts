/**
 * Interactive Command Wizard
 *
 * Step-by-step command builder for complex commands with --wizard flag
 */

import { getColorAdapter } from 'output/color-adapter.interface';
import { getHeaderFormatter } from 'output/header-formatter';
import { getPromptAdapter } from 'ui/prompt-adapter.interface';

import type {
	BaseWizardAnswers,
	CustomWizardAnswers,
	ExecuteWizardAnswers,
	GenericWizardAnswers,
	ImplementWizardAnswers,
	PlanWizardAnswers
} from './types/wizard.types';

const prompt = getPromptAdapter();

export interface WizardConfig<T extends BaseWizardAnswers = BaseWizardAnswers> {
	command: string;
	preview: (answers: T) => string;
	steps: WizardStep[];
}

export interface WizardStep {
	choices?: Array<{ name: string; value: string }>;
	default?: boolean | number | string;
	message: string;
	name: string;
	type: 'confirm' | 'input' | 'list' | 'number';
	validate?: (value: string) => boolean | string;
}

export class CommandWizard {
	constructor() {
		// No initialization needed
	}

	/**
	 * Get wizard configuration for a command
	 */
	private getWizardConfig(commandName: string): WizardConfig<BaseWizardAnswers> {
		// Define wizard configurations for common commands
		const configs: Record<string, WizardConfig<BaseWizardAnswers>> = {
			implement: {
				command: 'implement',
				preview: (answers: BaseWizardAnswers) => {
					const implementAnswers = answers as ImplementWizardAnswers;
					const options = [
						implementAnswers.session && `--session=${implementAnswers.session}`,
						implementAnswers.dryRun === 'yes' && '--dry-run'
					].filter(Boolean);

					return ['valora implement', ...options].join(' ');
				},
				steps: [
					{
						default: '',
						message: 'Session ID (leave empty for current):',
						name: 'session',
						type: 'input'
					},
					{
						choices: [
							{ name: 'No, execute immediately', value: 'no' },
							{ name: 'Yes, preview first (dry-run)', value: 'yes' }
						],
						default: 'no',
						message: 'Preview before execution?',
						name: 'dryRun',
						type: 'list'
					}
				]
			},
			plan: {
				command: 'plan',
				preview: (answers: BaseWizardAnswers) => {
					const planAnswers = answers as PlanWizardAnswers;
					const options = [
						planAnswers.session && planAnswers.session !== 'new' && `--session=${planAnswers.session}`,
						planAnswers.model && planAnswers.model !== 'auto' && `--model=${planAnswers.model}`,
						planAnswers.provider && planAnswers.provider !== 'cursor' && `--provider=${planAnswers.provider}`
					].filter(Boolean);

					return ['valora plan', `"${planAnswers.description}"`, ...options].join(' ');
				},
				steps: [
					{
						message: 'What would you like to plan?',
						name: 'description',
						type: 'input',
						validate: (value: string) => {
							if (!value || value.trim().length === 0) {
								return 'Please provide a description';
							}
							if (value.length < 10) {
								return 'Please be more specific (at least 10 characters)';
							}
							return true;
						}
					},
					{
						choices: [
							{ name: 'Create new session', value: 'new' },
							{ name: 'Use existing session', value: 'existing' }
						],
						message: 'Session management:',
						name: 'sessionChoice',
						type: 'list'
					},
					{
						message: 'Enter session ID:',
						name: 'session',
						type: 'input',
						validate: (value: string) => {
							if (!value || value.trim().length === 0) {
								return 'Please provide a session ID';
							}
							return true;
						}
					},
					{
						choices: [
							{ name: 'Auto-select (recommended)', value: 'auto' },
							{ name: 'gpt-5-thinking-high', value: 'gpt-5-thinking-high' },
							{ name: 'claude-opus-4.5', value: 'claude-opus-4.5' },
							{ name: 'claude-sonnet-4.5', value: 'claude-sonnet-4.5' },
							{ name: 'claude-haiku-4.5', value: 'claude-haiku-4.5' }
						],
						default: 'auto',
						message: 'Model preference:',
						name: 'model',
						type: 'list'
					},
					{
						choices: [
							{ name: 'Cursor (recommended)', value: 'cursor' },
							{ name: 'Anthropic', value: 'anthropic' },
							{ name: 'OpenAI', value: 'openai' },
							{ name: 'Google', value: 'google' }
						],
						default: 'cursor',
						message: 'AI Provider:',
						name: 'provider',
						type: 'list'
					}
				]
			},
			test: {
				command: 'test',
				preview: (answers: BaseWizardAnswers) => {
					const executeAnswers = answers as ExecuteWizardAnswers;
					const options = [
						executeAnswers.session && `--session=${executeAnswers.session}`,
						executeAnswers.watch === 'yes' && '--watch'
					].filter(Boolean);

					return ['valora test', ...options].join(' ');
				},
				steps: [
					{
						default: '',
						message: 'Session ID (leave empty for current):',
						name: 'session',
						type: 'input'
					},
					{
						choices: [
							{ name: 'No, run once', value: 'no' },
							{ name: 'Yes, watch for changes', value: 'yes' }
						],
						default: 'no',
						message: 'Enable watch mode?',
						name: 'watch',
						type: 'list'
					}
				]
			}
		};

		return (
			configs[commandName] ?? {
				command: commandName,
				preview: () => `valora ${commandName}`,
				steps: []
			}
		);
	}

	/**
	 * Run the wizard for a command
	 */
	async run(commandName: string): Promise<null | string> {
		const color = getColorAdapter();
		const headerFormatter = getHeaderFormatter();
		const title = `🧙 ${commandName.toUpperCase()} COMMAND WIZARD`;
		console.log(headerFormatter.formatHeader(title, { centered: false, width: 58 }));

		const config = this.getWizardConfig(commandName);

		if (config.steps.length === 0) {
			console.log(color.yellow(`  No wizard configuration available for '${commandName}'`));
			console.log(color.gray(`  Try: valora ${commandName} --help`));
			return null;
		}

		const answers: GenericWizardAnswers = {};

		/**
		 * Check if a step should be shown based on current answers
		 */
		const shouldShowStep = (step: WizardStep): boolean => {
			// Skip session ID input if not using existing session
			if (step.name === 'session' && answers['sessionChoice'] !== 'existing') {
				return false;
			}
			return true;
		};

		// Execute steps sequentially using reduce
		const stepResult = await config.steps.reduce(
			async (previousPromise, step, index) => {
				const accumulated = await previousPromise;
				if (accumulated === null) return null; // Early exit if cancelled

				if (!shouldShowStep(step)) {
					return accumulated;
				}

				console.log(color.bold(`\n  Step ${index + 1} of ${config.steps.length}: ${step.message}`));

				try {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const answer = await prompt.prompt([step as any]);
					const answerRecord = answer as Record<string, unknown>;
					answers[step.name] = answerRecord[step.name];
					return answers;
				} catch {
					// User cancelled
					console.log(color.yellow('\n  Wizard cancelled.'));
					return null;
				}
			},
			Promise.resolve(answers as GenericWizardAnswers | null)
		);

		if (stepResult === null) {
			return null;
		}

		// Show preview
		const stepNum = config.steps.length + 1;
		console.log(`
${color.bold(`  Step ${stepNum} of ${stepNum}: Review & Execute`)}

${color.gray('  Command preview:')}
${color.green('  $ ' + config.preview(answers))}
`);

		try {
			const confirm = await prompt.prompt<{ execute: boolean }>([
				{
					default: true,
					message: 'Execute this command?',
					name: 'execute',
					type: 'confirm'
				}
			]);

			if (confirm['execute']) {
				return config.preview(answers);
			}

			return null;
		} catch {
			return null;
		}
	}

	/**
	 * Run generic wizard for any command
	 */
	async runGeneric(commandName: string): Promise<null | string> {
		const color = getColorAdapter();
		const headerFormatter = getHeaderFormatter();
		console.log(headerFormatter.formatHeader('🧙 COMMAND WIZARD', { centered: false, width: 58 }));

		try {
			const answers = await prompt.prompt<CustomWizardAnswers>([
				{
					default: commandName,
					message: 'Command to execute:',
					name: 'command',
					type: 'input'
				},
				{
					default: '',
					message: 'Arguments (optional):',
					name: 'args',
					type: 'input'
				},
				{
					default: '',
					message: 'Session ID (optional):',
					name: 'session',
					type: 'input'
				},
				{
					choices: [
						{ name: 'Auto-select', value: '' },
						{ name: 'gpt-5-thinking-high', value: 'gpt-5-thinking-high' },
						{ name: 'claude-opus-4.5', value: 'claude-opus-4.5' },
						{ name: 'claude-sonnet-4.5', value: 'claude-sonnet-4.5' }
					],
					default: '',
					message: 'Model override (optional):',
					name: 'model',
					type: 'list'
				},
				{
					choices: [
						{ name: 'Default', value: '' },
						{ name: 'Cursor', value: 'cursor' },
						{ name: 'Anthropic', value: 'anthropic' },
						{ name: 'OpenAI', value: 'openai' }
					],
					default: '',
					message: 'Provider override (optional):',
					name: 'provider',
					type: 'list'
				}
			]);

			// Build command
			const parts = [
				'ai',
				answers.command,
				answers.args,
				answers.session && `--session=${answers.session}`,
				answers.model && `--model=${answers.model}`,
				answers.provider && `--provider=${answers.provider}`
			].filter(Boolean);

			const cmd = parts.join(' ');

			console.log(`
${color.gray('  Command preview:')}
${color.green('  $ ' + cmd)}
`);

			const confirm = await prompt.prompt<{ execute: boolean }>([
				{
					default: true,
					message: 'Execute this command?',
					name: 'execute',
					type: 'confirm'
				}
			]);

			if (confirm['execute']) {
				return cmd;
			}

			return null;
		} catch {
			return null;
		}
	}
}

/**
 * Run command wizard
 */
export async function runCommandWizard(commandName?: string): Promise<null | string> {
	const wizard = new CommandWizard();

	if (commandName) {
		return wizard.run(commandName);
	}
	return wizard.runGeneric('');
}
