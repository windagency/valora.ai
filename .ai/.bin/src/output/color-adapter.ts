/**
 * Chalk Color Adapter - Chalk.js implementation of the color styling adapter
 *
 * This is a concrete implementation of ColorAdapter using the Chalk library.
 * The interfaces are defined separately to allow for other implementations (colors, kleur, etc.)
 *
 * Benefits:
 * - Implements library-agnostic ColorAdapter interface
 * - Can be swapped with other implementations without changing consumers
 * - Provides the familiar Chalk API through the adapter
 */

import chalk from 'chalk';

import type { ChainableColorFn, Color, ColorAdapter, Modifier } from './color-adapter.interface';

/**
 * Chalk Adapter Implementation
 *
 * Concrete implementation of ColorAdapter using the Chalk library.
 */
export class ChalkAdapter implements ColorAdapter {
	/**
	 * Color mapping to chalk functions
	 */
	private readonly colorMap: Record<Color, typeof chalk.blue> = {
		blue: chalk.blue,
		cyan: chalk.cyan,
		gray: chalk.gray,
		green: chalk.green,
		magenta: chalk.magenta,
		red: chalk.red,
		white: chalk.white,
		yellow: chalk.yellow
	};

	/**
	 * Modifier mapping to chalk functions
	 */
	private readonly modifierMap: Record<Modifier, typeof chalk.bold> = {
		bold: chalk.bold,
		dim: chalk.dim,
		inverse: chalk.inverse,
		italic: chalk.italic,
		underline: chalk.underline
	};

	/**
	 * Whether colors are disabled (NO_COLOR environment variable)
	 */
	private readonly noColor: boolean;

	constructor() {
		this.noColor = process.env['NO_COLOR'] !== undefined;
	}

	color(color: Color, text: string): string {
		if (this.noColor) return text;
		const colorFn = this.colorMap[color];
		return colorFn(text);
	}

	colorModifier(color: Color, modifier: Modifier, text: string): string {
		if (this.noColor) return text;
		const colorFn = this.colorMap[color];
		// Chain the functions: chalk.blue.bold is same as chalk.bold(chalk.blue())
		// but chalk supports chaining, so we use the fluent API
		const chainable = colorFn as unknown as Record<string, (text: string) => string>;
		const modifierFn = chainable[modifier];
		if (!modifierFn) {
			throw new Error(`Modifier '${modifier}' not found on color '${color}'`);
		}
		return modifierFn(text);
	}

	getColorFn(color: Color): ChainableColorFn {
		return this.colorMap[color] as unknown as ChainableColorFn;
	}

	getRawFn(path: string): (text: string) => string {
		const parts = path.split('.');
		let fn: unknown = chalk;

		for (const part of parts) {
			const record = fn as Record<string, unknown>;
			fn = record[part];
			if (!fn) {
				throw new Error(`Invalid chalk path: ${path}`);
			}
		}

		return fn as (text: string) => string;
	}

	modifier(modifier: Modifier, text: string): string {
		if (this.noColor) return text;
		const modifierFn = this.modifierMap[modifier];
		return modifierFn(text);
	}

	// Convenience methods
	blue(text: string): string {
		if (this.noColor) return text;
		return chalk.blue(text);
	}

	bold(text: string): string {
		if (this.noColor) return text;
		return chalk.bold(text);
	}

	cyan(text: string): string {
		if (this.noColor) return text;
		return chalk.cyan(text);
	}

	dim(text: string): string {
		if (this.noColor) return text;
		return chalk.dim(text);
	}

	gray(text: string): string {
		if (this.noColor) return text;
		return chalk.gray(text);
	}

	green(text: string): string {
		if (this.noColor) return text;
		return chalk.green(text);
	}

	inverse(text: string): string {
		if (this.noColor) return text;
		return chalk.inverse(text);
	}

	italic(text: string): string {
		if (this.noColor) return text;
		return chalk.italic(text);
	}

	magenta(text: string): string {
		if (this.noColor) return text;
		return chalk.magenta(text);
	}

	red(text: string): string {
		if (this.noColor) return text;
		return chalk.red(text);
	}

	underline(text: string): string {
		if (this.noColor) return text;
		return chalk.underline(text);
	}

	white(text: string): string {
		if (this.noColor) return text;
		return chalk.white(text);
	}

	yellow(text: string): string {
		if (this.noColor) return text;
		return chalk.yellow(text);
	}
}

/**
 * Default adapter instance factory
 * This is used by the getColorAdapter function in the interface
 */
export function createDefaultColorAdapter(): ColorAdapter {
	return new ChalkAdapter();
}
