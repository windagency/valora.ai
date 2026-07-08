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

import {
	type PromptAdapter,
	type PromptAnswers,
	PromptCancelledError,
	type PromptQuestion,
	type PromptSeparator,
	type QuestionType
} from './prompt-adapter.interface';

/**
 * Question types that render as a scrollable choice list. Inquirer wraps
 * navigation from the last choice back to the first by default, which reads
 * as an endless list to users; these types default to `loop: false` unless
 * a caller sets `loop` explicitly.
 */
const LOOPABLE_QUESTION_TYPES: ReadonlySet<QuestionType> = new Set(['checkbox', 'expand', 'list', 'rawlist']);

function withLoopDefault<T>(question: PromptQuestion<T>): PromptQuestion<T> {
	if (question.loop !== undefined || typeof question.type !== 'string' || !LOOPABLE_QUESTION_TYPES.has(question.type)) {
		return question;
	}
	return { ...question, loop: false };
}

function withLoopDefaults<T>(
	questions: Array<PromptQuestion<T>> | PromptQuestion<T>
): Array<PromptQuestion<T>> | PromptQuestion<T> {
	return Array.isArray(questions) ? questions.map(withLoopDefault) : withLoopDefault(questions);
}

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
			withLoopDefaults(questions) as Parameters<typeof inquirer.prompt>[0],
			initialAnswers as Record<string, unknown>
		) as Promise<T>;
	}

	/**
	 * Prompt user with questions, returning a handle that can cancel the
	 * in-flight prompt from outside.
	 */
	promptCancellable<T = PromptAnswers>(
		questions: Array<PromptQuestion<T>> | PromptQuestion<T>,
		initialAnswers?: Partial<T>
	): { cancel: () => void; promise: Promise<T> } {
		const runningPrompt = inquirer.prompt(
			withLoopDefaults(questions) as Parameters<typeof inquirer.prompt>[0],
			initialAnswers as Record<string, unknown>
		);

		const promise = runningPrompt.then(
			(answer) => answer as T,
			(error: unknown) => {
				if (error instanceof Error && error.name === 'AbortPromptError') {
					throw new PromptCancelledError();
				}
				throw error;
			}
		);

		return {
			cancel: () => runningPrompt.ui.close(),
			promise
		};
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
