/**
 * CLI UI Adapter - Concrete implementation using prompt and color adapters
 *
 * This adapter implements the UIAdapter interface using CLI libraries,
 * isolating the session layer from direct dependency on presentation libraries.
 */

import type { DisplayOptions, UIAdapter, UIQuestion } from 'types/ui.types';

import { getColorAdapter } from 'output/color-adapter.interface';
import { getConsoleOutput } from 'output/console-output';
import { getHeaderFormatter } from 'output/header-formatter';
import { getPromptAdapter } from 'ui/prompt-adapter.interface';

const prompt = getPromptAdapter();

/**
 * CLI-based implementation of UIAdapter
 * Uses prompt adapter for interactive prompts and color adapter for styled output
 */
export class CLIUIAdapter implements UIAdapter {
	display(message: string, options?: DisplayOptions): void {
		const formatted = options ? this.format(message, options) : message;
		getConsoleOutput().print(formatted);
	}

	displayError(message: string, error?: Error): void {
		const consoleOut = getConsoleOutput();
		consoleOut.error(message);
		if (error) {
			consoleOut.print(`  ${error.message}`);
		}
	}

	displayHeader(title: string, options?: { width?: number }): void {
		const headerFormatter = getHeaderFormatter();
		getConsoleOutput().print(headerFormatter.formatHeader(title, { centered: false, width: options?.width }));
	}

	displaySeparator(width: number = 60, options?: DisplayOptions): void {
		const color = getColorAdapter();
		const separator = '─'.repeat(width);
		const formatted = options ? this.format(separator, options) : color.gray(separator);
		getConsoleOutput().print(formatted);
	}

	displaySuccess(message: string): void {
		getConsoleOutput().success(message);
	}

	displayWarning(message: string): void {
		getConsoleOutput().warn(message);
	}

	format(text: string, options: DisplayOptions): string {
		const color = getColorAdapter();
		let result = text;

		// Apply color
		if (options.color) {
			const colorMap: Record<string, (text: string) => string> = {
				cyan: color.cyan.bind(color),
				gray: color.gray.bind(color),
				green: color.green.bind(color),
				red: color.red.bind(color),
				yellow: color.yellow.bind(color)
			};
			const colorFn = colorMap[options.color];
			if (colorFn) {
				result = colorFn(result);
			}
		}

		// Apply bold
		if (options.bold) {
			result = color.bold(result);
		}

		return result;
	}

	formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
	}

	async prompt(questions: UIQuestion[]): Promise<null | Record<string, unknown>> {
		try {
			// Convert our UIQuestion format to inquirer format
			const inquirerQuestions = questions.map((q) => ({
				choices: q.choices,
				default: q.default,
				message: q.message,
				name: q.name,
				type: q.type,
				validate: q.validate
			}));

			const answers = await prompt.prompt(inquirerQuestions);
			return answers;
		} catch {
			// User cancelled (Ctrl+C)
			return null;
		}
	}
}
