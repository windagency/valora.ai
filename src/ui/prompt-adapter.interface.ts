/**
 * Prompt Adapter Interface
 *
 * Library-agnostic interactive prompting interface.
 * Implementations can use Inquirer, Prompts, Enquirer, or any other prompting library.
 *
 * This separation allows:
 * - Multiple adapter implementations without coupling
 * - Easy testing with mock adapters
 * - Library migration without changing consumer code
 */

import { createDefaultPromptAdapter } from './prompt-adapter';

/**
 * Question types supported by the prompt adapter
 */
export type QuestionType =
	| 'checkbox'
	| 'confirm'
	| 'editor'
	| 'expand'
	| 'input'
	| 'list'
	| 'number'
	| 'password'
	| 'rawlist';

/**
 * Choice for list/checkbox questions
 */
export interface PromptChoice<T = unknown> {
	checked?: boolean;
	disabled?: boolean | string;
	name?: string;
	short?: string;
	type?: 'choice' | 'separator';
	value?: T;
}

/**
 * Separator for list/checkbox questions
 */
export interface PromptSeparator {
	line?: string;
	type: 'separator';
}

/**
 * Question configuration
 */
export interface PromptQuestion<T = unknown> {
	/**
	 * Default value
	 */
	default?: ((answers: T) => unknown) | unknown;

	/**
	 * Choices for list/checkbox questions
	 */
	choices?:
		| ((
				answers: T
		  ) => Array<PromptChoice | PromptSeparator | string> | Promise<Array<PromptChoice | PromptSeparator | string>>)
		| Array<PromptChoice | PromptSeparator | string>;

	/**
	 * Filter function to transform the answer
	 */
	filter?: (input: unknown, answers: T) => Promise<unknown> | unknown;

	/**
	 * Message to display
	 */
	message: ((answers: T) => Promise<string> | string) | string;

	/**
	 * Property name for the answer
	 */
	name: string;

	/**
	 * Prefix for the prompt
	 */
	prefix?: string;

	/**
	 * Suffix for the prompt
	 */
	suffix?: string;

	/**
	 * Transformer function to display the value
	 */
	transformer?: (input: unknown, answers: T, flags: { isFinal: boolean }) => Promise<string> | string;

	/**
	 * Question type
	 */
	type?: ((answers: T) => Promise<QuestionType> | QuestionType) | QuestionType;

	/**
	 * Validation function
	 */
	validate?: (input: unknown, answers?: T) => boolean | Promise<boolean | string> | string;

	/**
	 * When function to conditionally show question
	 */
	when?: ((answers: T) => boolean | Promise<boolean>) | boolean;

	/**
	 * Page size for list questions
	 */
	pageSize?: number;

	/**
	 * Loop for list questions
	 */
	loop?: boolean;
}

/**
 * Prompt answers type
 */
export type PromptAnswers = Record<string, unknown>;

/**
 * Prompt Adapter Interface
 *
 * Defines the contract for interactive prompting implementations.
 * All prompting operations should go through this interface.
 */
export interface PromptAdapter {
	/**
	 * Prompt user with questions
	 *
	 * @param questions - Question or array of questions
	 * @param initialAnswers - Initial answers to pre-fill
	 * @returns Promise with answers
	 *
	 * @example
	 * const answers = await adapter.prompt([
	 *   {
	 *     type: 'input',
	 *     name: 'name',
	 *     message: 'What is your name?'
	 *   },
	 *   {
	 *     type: 'confirm',
	 *     name: 'continue',
	 *     message: 'Continue?',
	 *     default: true
	 *   }
	 * ]);
	 */
	prompt<T = PromptAnswers>(
		questions: Array<PromptQuestion<T>> | PromptQuestion<T>,
		initialAnswers?: Partial<T>
	): Promise<T>;

	/**
	 * Create a separator for list/checkbox questions
	 *
	 * @param line - Optional separator text
	 * @returns Separator object
	 *
	 * @example
	 * const separator = adapter.createSeparator('--- Options ---');
	 */
	createSeparator(line?: string): PromptSeparator;

	/**
	 * Get the underlying Separator class (for compatibility)
	 * @deprecated Use createSeparator() instead
	 */
	Separator: new (line?: string) => PromptSeparator;
}

/**
 * Singleton instance
 */
let adapterInstance: null | PromptAdapter = null;

/**
 * Get the singleton PromptAdapter instance
 *
 * @returns PromptAdapter instance
 *
 * @example
 * import { getPromptAdapter } from 'ui/prompt-adapter.interface';
 *
 * const prompt = getPromptAdapter();
 * const answers = await prompt.prompt([
 *   {
 *     type: 'input',
 *     name: 'username',
 *     message: 'Enter your username:'
 *   }
 * ]);
 */
export function getPromptAdapter(): PromptAdapter {
	adapterInstance ??= createDefaultPromptAdapter();
	return adapterInstance!;
}

/**
 * Set a custom PromptAdapter implementation
 * Useful for testing or switching to different prompting libraries
 *
 * @param adapter - The adapter instance to use
 *
 * @example
 * // In tests
 * import { setPromptAdapter } from 'ui/prompt-adapter.interface';
 *
 * const mockAdapter = new MockPromptAdapter();
 * setPromptAdapter(mockAdapter);
 */
export function setPromptAdapter(adapter: PromptAdapter): void {
	adapterInstance = adapter;
}
