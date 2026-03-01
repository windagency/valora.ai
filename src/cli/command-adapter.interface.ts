/**
 * Command Adapter Interface
 *
 * Library-agnostic CLI framework interface.
 * Implementations can use Commander, Yargs, Caporal, or any other CLI library.
 *
 * This separation allows:
 * - Multiple adapter implementations without coupling
 * - Easy testing with mock adapters
 * - Framework migration without changing consumer code
 */

/**
 * Command Adapter Interface
 *
 * Defines the contract for CLI command implementations.
 * All command operations should go through this interface.
 */
export interface CommandAdapter {
	/**
	 * Add a subcommand
	 */
	command(nameAndArgs: string, opts?: { hidden?: boolean; isDefault?: boolean }): CommandAdapter;

	/**
	 * Set command description
	 */
	description(str: string): CommandAdapter;

	/**
	 * Add a command argument
	 */
	argument<T>(
		name: string,
		description?: string,
		fn?: (value: string, previous: T) => T,
		defaultValue?: T
	): CommandAdapter;

	/**
	 * Set command alias
	 */
	alias(alias: string): CommandAdapter;

	/**
	 * Allow unknown options
	 */
	allowUnknownOption(arg?: boolean): CommandAdapter;

	/**
	 * Add an option
	 */
	option<T>(
		flags: string,
		description?: string,
		fn?: ((value: string, previous: T) => T) | T,
		defaultValue?: T
	): CommandAdapter;

	/**
	 * Add an Option object
	 */
	addOption(option: OptionAdapter): CommandAdapter;

	/**
	 * Set action handler
	 */
	action(fn: (...args: Array<Record<string, unknown>>) => Promise<void> | void): CommandAdapter;

	/**
	 * Set program name
	 */
	name(str: string): CommandAdapter;

	/**
	 * Set program version
	 */
	version(str: string, flags?: string, description?: string): CommandAdapter;

	/**
	 * Parse arguments
	 */
	parse(argv?: readonly string[], options?: { from: 'node' | 'user' }): CommandAdapter;

	/**
	 * Parse arguments asynchronously
	 */
	parseAsync(argv?: readonly string[], options?: { from: 'node' | 'user' }): Promise<CommandAdapter>;

	/**
	 * Get parsed options
	 */
	opts<T extends Record<string, unknown> = Record<string, unknown>>(): T;
}

/**
 * Option Adapter Interface
 *
 * Defines the contract for CLI option implementations.
 */
export interface OptionAdapter {
	/**
	 * Set allowed choices for option value
	 */
	choices(values: readonly string[]): OptionAdapter;

	/**
	 * Set custom argument parser
	 */
	argParser<T>(fn: (value: string, previous: T) => T): OptionAdapter;

	/**
	 * Set default value
	 */
	default(value: unknown, description?: string): OptionAdapter;
}
