/**
 * Prompt Handler - Utilities for handling interactive prompt cancellations
 */

import { getColorAdapter } from 'output/color-adapter.interface';

/**
 * Cancellation message patterns to detect user-initiated prompt exits
 */
const CANCELLATION_PATTERNS = ['user force closed', 'prompt was canceled', 'user canceled'] as const;

/**
 * Check if error name indicates prompt cancellation
 */
function isExitPromptError(err: Error): boolean {
	return err.name === 'ExitPromptError' || err.constructor?.name === 'ExitPromptError';
}

/**
 * Check if error message contains cancellation patterns
 */
function hasCancellationMessage(message: string): boolean {
	const lowerMessage = message.toLowerCase();
	return CANCELLATION_PATTERNS.some((pattern) => lowerMessage.includes(pattern));
}

/**
 * Check if an error is a prompt cancellation (user pressed Ctrl+C)
 * Handles inquirer's ExitPromptError and similar cancellation scenarios
 */
export function isPromptCancellation(error: unknown): boolean {
	if (!error || typeof error !== 'object') {
		return false;
	}

	const err = error as Error;

	// Check for inquirer's ExitPromptError
	if (isExitPromptError(err)) {
		return true;
	}

	// Check for cancellation message patterns
	if (err.message && typeof err.message === 'string') {
		return hasCancellationMessage(err.message);
	}

	return false;
}

/**
 * Handle prompt cancellation with a friendly message
 * Shows a clean exit message and exits with code 0 (success)
 */
export function handlePromptCancellation(silent = false): never {
	if (!silent) {
		const color = getColorAdapter();
		console.log(color.yellow('\n\n⚠️  Setup cancelled by user.\n'));
	}
	process.exit(0);
}

/**
 * Wrapper for prompt operations that handles cancellation gracefully
 */
export async function withPromptCancellation<T>(operation: () => Promise<T>, silent = false): Promise<T> {
	try {
		return await operation();
	} catch (error) {
		if (isPromptCancellation(error)) {
			handlePromptCancellation(silent);
		}
		throw error;
	}
}
