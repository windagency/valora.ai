/**
 * UI Adapter Types - Interface for decoupling UI from domain logic
 *
 * These types define the contract between domain/application layers and presentation layer,
 * allowing the session layer to remain independent of specific UI frameworks (inquirer, chalk, etc.)
 */

/**
 * Represents a question to ask the user
 */
export interface UIQuestion {
	/** Validation function for user input */
	validate?: (value: unknown) => boolean | string;
	/** Possible choices for checkbox/list questions */
	choices?: Array<{
		/** Whether choice is selected by default */
		checked?: boolean;
		/** Display name for the choice */
		name: string;
		/** Value to return when selected */
		value: string;
	}>;
	/** Default value */
	default?: unknown;
	/** Question message to display */
	message: string;
	/** Property name for the answer */
	name: string;
	/** Type of question */
	type: 'checkbox' | 'confirm' | 'input' | 'number';
}

/**
 * Display formatting options
 */
export interface DisplayOptions {
	/** Color to use for text */
	color?: 'cyan' | 'gray' | 'green' | 'red' | 'yellow';
	/** Whether to bold the text */
	bold?: boolean;
}

/**
 * UI Adapter interface - abstracts UI interactions
 *
 * This interface allows domain logic to perform UI operations without depending
 * on specific UI libraries. Concrete implementations in CLI layer handle the
 * actual rendering using inquirer, chalk, etc.
 */
export interface UIAdapter {
	/**
	 * Display a message to the user
	 */
	display(message: string, options?: DisplayOptions): void;

	/**
	 * Display a formatted header/section
	 */
	displayHeader(title: string, options?: { width?: number }): void;

	/**
	 * Display a separator line
	 */
	displaySeparator(width?: number, options?: DisplayOptions): void;

	/**
	 * Display an error message
	 */
	displayError(message: string, error?: Error): void;

	/**
	 * Display a success message
	 */
	displaySuccess(message: string): void;

	/**
	 * Display a warning message
	 */
	displayWarning(message: string): void;

	/**
	 * Prompt user with questions
	 * @returns Answers to the questions, or null if user cancelled
	 */
	prompt(questions: UIQuestion[]): Promise<null | Record<string, unknown>>;

	/**
	 * Format text with color and styling
	 */
	format(text: string, options: DisplayOptions): string;

	/**
	 * Format bytes to human-readable string
	 */
	formatBytes(bytes: number): string;
}
