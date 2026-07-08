/**
 * ESC-to-quit wrapper for Setup Wizard prompts.
 *
 * Wraps a wizard prompt so pressing ESC shows a confirm-before-quit dialog
 * instead of silently discarding input. Declining the dialog re-asks the
 * original question(s).
 */

import { getColorAdapter } from 'output/color-adapter.interface';
// eslint-disable-next-line valora-local/import-layer-remedy
import {
	type PromptAdapter,
	type PromptAnswers,
	PromptCancelledError,
	type PromptQuestion
} from 'ui/prompt-adapter.interface';
import { handlePromptCancellation } from 'utils/prompt-handler';

export async function promptWithEscToQuit<T = PromptAnswers>(
	prompt: PromptAdapter,
	questions: Array<PromptQuestion<T>> | PromptQuestion<T>,
	initialAnswers?: Partial<T>,
	stdin: NodeJS.ReadableStream = process.stdin
): Promise<T> {
	const { cancel, promise } = prompt.promptCancellable(questions, initialAnswers);

	const onKeypress = (_input: string, key?: { name?: string }): void => {
		if (key?.name === 'escape') {
			cancel();
		}
	};

	stdin.on('keypress', onKeypress);

	try {
		return await promise;
	} catch (error) {
		if (!(error instanceof PromptCancelledError)) {
			throw error;
		}

		const color = getColorAdapter();
		const { confirmQuit } = await prompt.prompt<{ confirmQuit: boolean }>([
			{
				default: false,
				message: color.yellow('Quit setup? Progress will be discarded.'),
				name: 'confirmQuit',
				type: 'confirm'
			}
		]);

		if (confirmQuit) {
			handlePromptCancellation();
		}

		return await promptWithEscToQuit(prompt, questions, initialAnswers, stdin);
	} finally {
		stdin.removeListener('keypress', onKeypress);
	}
}
