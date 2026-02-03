/**
 * Inquirer Prompt Adapter - Inquirer.js implementation of the prompt adapter
 *
 * This is a concrete implementation of PromptAdapter using the Inquirer library.
 * The interfaces are defined separately to allow for other implementations (prompts, enquirer, etc.)
 *
 * Benefits:
 * - Implements library-agnostic PromptAdapter interface
 * - Can be swapped with other implementations without changing consumers
 * - Provides the familiar Inquirer API through the adapter
 */

import inquirer from 'inquirer';

import type { PromptAdapter, PromptAnswers, PromptQuestion, PromptSeparator } from './prompt-adapter.interface';

/**
 * Inquirer Adapter Implementation
 *
 * Concrete implementation of PromptAdapter using the Inquirer library.
 */
export class InquirerAdapter implements PromptAdapter {
	/**
	 * Separator class reference
	 */
	Separator: new (line?: string) => PromptSeparator = inquirer.Separator as unknown as new (
		line?: string
	) => PromptSeparator;

	/**
	 * Prompt user with questions
	 */
	async prompt<T = PromptAnswers>(
		questions: Array<PromptQuestion<T>> | PromptQuestion<T>,
		initialAnswers?: Partial<T>
	): Promise<T> {
		// Inquirer's prompt accepts both single question and array
		// Type assertion needed due to incompatible generic constraints between our interface and Inquirer's
		return inquirer.prompt(
			questions as Parameters<typeof inquirer.prompt>[0],
			initialAnswers as Record<string, unknown>
		) as Promise<T>;
	}

	/**
	 * Create a separator for list/checkbox questions
	 */
	createSeparator(line?: string): PromptSeparator {
		return new inquirer.Separator(line) as PromptSeparator;
	}
}

/**
 * Default adapter instance factory
 * This is used by the getPromptAdapter function in the interface
 */
export function createDefaultPromptAdapter(): PromptAdapter {
	return new InquirerAdapter();
}
