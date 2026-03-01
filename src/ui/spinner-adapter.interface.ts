/**
 * Spinner Adapter Interface
 *
 * Library-agnostic spinner/loading indicator interface.
 * Implementations can use ora, cli-spinners, nanospinner, or any other spinner library.
 *
 * This separation allows:
 * - Multiple adapter implementations without coupling
 * - Easy testing with mock adapters
 * - Library migration without changing consumer code
 */

import { createDefaultSpinnerAdapter } from './spinner-adapter';

/**
 * Spinner color options
 */
export type SpinnerColor = 'black' | 'blue' | 'cyan' | 'gray' | 'green' | 'magenta' | 'red' | 'white' | 'yellow';

/**
 * Spinner configuration options
 */
export interface SpinnerOptions {
	/**
	 * Color of the spinner
	 */
	color?: SpinnerColor;

	/**
	 * Text to display with the spinner
	 */
	text?: string;

	/**
	 * Prefix text before the spinner
	 */
	prefixText?: string;

	/**
	 * Spinner type/style
	 */
	spinner?: string;

	/**
	 * Hide cursor while spinning
	 */
	hideCursor?: boolean;

	/**
	 * Indent level
	 */
	indent?: number;

	/**
	 * Stream to write to (stdout/stderr)
	 */
	stream?: NodeJS.WritableStream;

	/**
	 * Disable spinner (show text only)
	 */
	isEnabled?: boolean;

	/**
	 * Enable/disable interactive features
	 */
	isSilent?: boolean;

	/**
	 * Discard stdin input while spinner is running
	 * Set to false to prevent terminal manipulation issues
	 */
	discardStdin?: boolean;
}

/**
 * Spinner instance interface
 */
export interface Spinner {
	/**
	 * Text displayed with the spinner
	 */
	text: string;

	/**
	 * Prefix text before the spinner
	 */
	prefixText: string;

	/**
	 * Spinner color
	 */
	color: SpinnerColor;

	/**
	 * Whether the spinner is currently spinning
	 */
	isSpinning: boolean;

	/**
	 * Indent level
	 */
	indent: number;

	/**
	 * Start the spinner
	 *
	 * @param text - Optional text to display
	 * @returns This spinner instance
	 */
	start(text?: string): Spinner;

	/**
	 * Stop the spinner
	 *
	 * @returns This spinner instance
	 */
	stop(): Spinner;

	/**
	 * Mark spinner as successful with checkmark
	 *
	 * @param text - Optional success message
	 * @returns This spinner instance
	 */
	succeed(text?: string): Spinner;

	/**
	 * Mark spinner as failed with cross mark
	 *
	 * @param text - Optional failure message
	 * @returns This spinner instance
	 */
	fail(text?: string): Spinner;

	/**
	 * Mark spinner as warning with warning icon
	 *
	 * @param text - Optional warning message
	 * @returns This spinner instance
	 */
	warn(text?: string): Spinner;

	/**
	 * Mark spinner as info with info icon
	 *
	 * @param text - Optional info message
	 * @returns This spinner instance
	 */
	info(text?: string): Spinner;

	/**
	 * Stop and clear the spinner
	 *
	 * @returns This spinner instance
	 */
	clear(): Spinner;

	/**
	 * Render a frame (for manual control)
	 *
	 * @returns This spinner instance
	 */
	render(): Spinner;

	/**
	 * Stop and remove the spinner
	 */
	stopAndPersist(options?: { prefixText?: string; symbol?: string; text?: string }): Spinner;
}

/**
 * Spinner Adapter Interface
 *
 * Defines the contract for spinner/loading indicator implementations.
 * All spinner operations should go through this interface.
 */
export interface SpinnerAdapter {
	/**
	 * Create and return a spinner instance
	 *
	 * @param options - Spinner configuration options
	 * @returns Spinner instance
	 *
	 * @example
	 * const spinner = adapter.create({ text: 'Loading...', color: 'cyan' });
	 * spinner.start();
	 * // ... do work
	 * spinner.succeed('Done!');
	 */
	create(options?: SpinnerOptions | string): Spinner;
}

/**
 * Singleton instance
 */
let adapterInstance: null | SpinnerAdapter = null;

/**
 * Get the singleton SpinnerAdapter instance
 *
 * @returns SpinnerAdapter instance
 *
 * @example
 * import { getSpinnerAdapter } from 'ui/spinner-adapter.interface';
 *
 * const spinner = getSpinnerAdapter();
 * const loading = spinner.create('Loading data...');
 * loading.start();
 *
 * // ... do work
 *
 * loading.succeed('Data loaded!');
 */
export function getSpinnerAdapter(): SpinnerAdapter {
	adapterInstance ??= createDefaultSpinnerAdapter();
	return adapterInstance!;
}

/**
 * Set a custom SpinnerAdapter implementation
 * Useful for testing or switching to different spinner libraries
 *
 * @param adapter - The adapter instance to use
 *
 * @example
 * // In tests
 * import { setSpinnerAdapter } from 'ui/spinner-adapter.interface';
 *
 * const mockAdapter = new MockSpinnerAdapter();
 * setSpinnerAdapter(mockAdapter);
 */
export function setSpinnerAdapter(adapter: SpinnerAdapter): void {
	adapterInstance = adapter;
}
