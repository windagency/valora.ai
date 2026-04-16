/**
 * Commander Adapter - Commander.js implementation of the CLI framework adapter
 *
 * This is a concrete implementation of CommandAdapter using the Commander.js library.
 * The interfaces are defined separately to allow for other implementations (Yargs, Caporal, etc.)
 *
 * Benefits:
 * - Implements library-agnostic CommandAdapter interface
 * - Can be swapped with other implementations without changing consumers
 * - Provides compatibility methods for edge cases
 */

import { Command as CommanderCommand, Option as CommanderOption } from 'commander';

import type { CommandAdapter, OptionAdapter } from './command-adapter.interface';

/**
 * Commander-specific Command Adapter interface (for edge cases requiring direct access)
 * This interface is defined in the implementation file to keep the base interface library-agnostic
 */
export interface CommanderCommandContract extends CommandAdapter {
	/**
	 * Get underlying commander instance (for compatibility)
	 * @deprecated Use CommandAdapter interface methods when possible
	 */
	getUnderlyingCommand(): CommanderCommand;
}

/**
 * Commander-specific Option Adapter interface (for edge cases requiring direct access)
 * This interface is defined in the implementation file to keep the base interface library-agnostic
 */
export interface CommanderOptionContract extends OptionAdapter {
	/**
	 * Get underlying option instance (for compatibility)
	 * @deprecated Use OptionAdapter interface methods when possible
	 */
	getUnderlyingOption(): CommanderOption;
}

/**
 * Commander Command Adapter Implementation
 *
 * Concrete implementation of CommandAdapter using Commander.js
 */
export class CommanderCommandAdapter implements CommanderCommandContract {
	private cmd: CommanderCommand;

	constructor(nameAndArgs?: string) {
		this.cmd = nameAndArgs ? new CommanderCommand(nameAndArgs) : new CommanderCommand();
	}

	action(fn: (...args: Array<Record<string, unknown>>) => Promise<void> | void): CommandAdapter {
		this.cmd.action(fn);
		return this;
	}

	addOption(option: OptionAdapter): CommandAdapter {
		this.cmd.addOption((option as CommanderOptionContract).getUnderlyingOption());
		return this;
	}

	alias(aliasName: string): CommandAdapter {
		this.cmd.alias(aliasName);
		return this;
	}

	allowUnknownOption(arg?: boolean): CommandAdapter {
		this.cmd.allowUnknownOption(arg);
		return this;
	}

	argument<T>(
		name: string,
		description?: string,
		fn?: (value: string, previous: T) => T,
		defaultValue?: T
	): CommandAdapter {
		const variant = fn ? 'fn' : description !== undefined || defaultValue !== undefined ? 'extra' : 'simple';
		const INVOKERS = {
			extra: () => this.cmd.argument(name, description ?? '', defaultValue),
			fn: () => this.cmd.argument(name, description ?? '', fn!, defaultValue),
			simple: () => this.cmd.argument(name)
		};
		INVOKERS[variant]();
		return this;
	}

	command(nameAndArgs: string, opts?: { hidden?: boolean; isDefault?: boolean }): CommandAdapter {
		const subCmd = this.cmd.command(nameAndArgs, opts);
		return new CommanderCommandAdapter().withUnderlyingCommand(subCmd);
	}

	description(str: string): CommandAdapter {
		this.cmd.description(str);
		return this;
	}

	getUnderlyingCommand(): CommanderCommand {
		return this.cmd;
	}

	name(str: string): CommandAdapter {
		this.cmd.name(str);
		return this;
	}

	option<T>(
		flags: string,
		description?: string,
		fn?: ((value: string, previous: T) => T) | T,
		defaultValue?: T
	): CommandAdapter {
		const variant =
			typeof fn === 'function' ? 'fn' : fn !== undefined ? 'value' : description !== undefined ? 'desc' : 'flags';
		const INVOKERS = {
			desc: () => this.cmd.option(flags, description!),
			flags: () => this.cmd.option(flags),
			fn: () => this.cmd.option(flags, description ?? '', fn as (value: string, previous: T) => T, defaultValue),
			value: () => this.cmd.option(flags, description ?? '', fn as boolean | string | string[])
		};
		INVOKERS[variant]();
		return this;
	}

	opts<T extends Record<string, unknown> = Record<string, unknown>>(): T {
		return this.cmd.opts<T>();
	}

	parse(argv?: readonly string[], options?: { from: 'node' | 'user' }): CommandAdapter {
		this.cmd.parse(argv, options);
		return this;
	}

	parseAsync(argv?: readonly string[], options?: { from: 'node' | 'user' }): Promise<CommandAdapter> {
		return this.cmd.parseAsync(argv, options).then(() => this);
	}

	version(str: string, flags?: string, description?: string): CommandAdapter {
		this.cmd.version(str, flags, description);
		return this;
	}

	/**
	 * Internal method to wrap an existing commander instance
	 */
	private withUnderlyingCommand(cmd: CommanderCommand): CommandAdapter {
		this.cmd = cmd;
		return this;
	}
}

/**
 * Commander Option Adapter Implementation
 *
 * Concrete implementation of OptionAdapter using Commander.js
 */
export class CommanderOptionAdapter implements CommanderOptionContract {
	private opt: CommanderOption;

	constructor(flags: string, description?: string) {
		this.opt = new CommanderOption(flags, description);
	}

	argParser<T>(fn: (value: string, previous: T) => T): OptionAdapter {
		this.opt.argParser(fn);
		return this;
	}

	choices(values: readonly string[]): OptionAdapter {
		this.opt.choices(values as string[]);
		return this;
	}

	default(value: unknown, description?: string): OptionAdapter {
		this.opt.default(value, description);
		return this;
	}

	getUnderlyingOption(): CommanderOption {
		return this.opt;
	}
}

/**
 * Factory function to create a new Command adapter
 */
export function createCommand(nameAndArgs?: string): CommandAdapter {
	return new CommanderCommandAdapter(nameAndArgs);
}

/**
 * Factory function to create a new Option adapter
 */
export function createOption(flags: string, description?: string): OptionAdapter {
	return new CommanderOptionAdapter(flags, description);
}
