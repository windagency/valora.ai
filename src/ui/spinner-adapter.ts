/**
 * Ora Spinner Adapter - Ora implementation of the spinner adapter
 *
 * This is a concrete implementation of SpinnerAdapter using the ora library.
 * The interfaces are defined separately to allow for other implementations (cli-spinners, nanospinner, etc.)
 *
 * Benefits:
 * - Implements library-agnostic SpinnerAdapter interface
 * - Can be swapped with other implementations without changing consumers
 * - Provides the familiar ora API through the adapter
 */

import ora, { type Ora } from 'ora';

import type { Spinner, SpinnerAdapter, SpinnerOptions } from './spinner-adapter.interface';

/**
 * Ora Adapter Implementation
 *
 * Concrete implementation of SpinnerAdapter using the ora library.
 */
export class OraAdapter implements SpinnerAdapter {
	/**
	 * Create and return a spinner instance
	 */
	create(options?: SpinnerOptions | string): Spinner {
		// Handle string shorthand for text
		const oraOptions = typeof options === 'string' ? { text: options } : (options ?? {});

		// Create ora spinner - type assertion needed due to adapter pattern
		// Our SpinnerOptions uses string for spinner, ora uses SpinnerName | Spinner
		const oraSpinner = ora(oraOptions as Parameters<typeof ora>[0]) as Ora;

		// Return as our Spinner interface
		// Ora already implements most of our interface, just cast it
		return oraSpinner as unknown as Spinner;
	}
}

/**
 * Default adapter instance factory
 * This is used by the getSpinnerAdapter function in the interface
 */
export function createDefaultSpinnerAdapter(): SpinnerAdapter {
	return new OraAdapter();
}
