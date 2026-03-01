/**
 * Color Adapter Interface
 *
 * Library-agnostic terminal styling interface.
 * Implementations can use Chalk, Colors, Kleur, or any other styling library.
 *
 * This separation allows:
 * - Multiple adapter implementations without coupling
 * - Easy testing with mock adapters
 * - Library migration without changing consumer code
 */

import { createDefaultColorAdapter } from './color-adapter';

/**
 * Color options available for styling
 */
export type Color = 'blue' | 'cyan' | 'gray' | 'green' | 'magenta' | 'red' | 'white' | 'yellow';

/**
 * Modifier options for text styling
 */
export type Modifier = 'bold' | 'dim' | 'inverse' | 'italic' | 'underline';

/**
 * Chainable color function that supports modifiers
 */
export interface ChainableColorFn {
	(text: string): string;
	bold: ChainableColorFn;
	dim: ChainableColorFn;
	inverse: ChainableColorFn;
	italic: ChainableColorFn;
	underline: ChainableColorFn;
}

/**
 * Color Adapter Interface
 *
 * Defines the contract for terminal color/styling implementations.
 * All styling operations should go through this interface.
 */
export interface ColorAdapter {
	/**
	 * Apply a color to text
	 *
	 * @param color - The color to apply
	 * @param text - The text to colorize
	 * @returns Colored text
	 *
	 * @example
	 * adapter.color('blue', 'Hello'); // Returns blue text
	 */
	color(color: Color, text: string): string;

	/**
	 * Apply a modifier to text
	 *
	 * @param modifier - The modifier to apply
	 * @param text - The text to modify
	 * @returns Modified text
	 *
	 * @example
	 * adapter.modifier('bold', 'Hello'); // Returns bold text
	 */
	modifier(modifier: Modifier, text: string): string;

	/**
	 * Apply both color and modifier to text
	 *
	 * @param color - The color to apply
	 * @param modifier - The modifier to apply
	 * @param text - The text to style
	 * @returns Styled text
	 *
	 * @example
	 * adapter.colorModifier('blue', 'bold', 'Hello'); // Returns bold blue text
	 */
	colorModifier(color: Color, modifier: Modifier, text: string): string;

	/**
	 * Get a chainable color function for advanced usage
	 *
	 * @param color - The color to use
	 * @returns Chainable color function
	 *
	 * @example
	 * const blueFn = adapter.getColorFn('blue');
	 * blueFn.bold('Hello'); // Returns bold blue text
	 */
	getColorFn(color: Color): ChainableColorFn;

	/**
	 * Get a raw styling function (for direct chalk-like usage)
	 *
	 * @param path - Dot-notation path to the styling function (e.g., 'blue.bold', 'red')
	 * @returns Styling function
	 *
	 * @example
	 * const styleFn = adapter.getRawFn('blue.bold');
	 * styleFn('Hello'); // Returns bold blue text
	 */
	getRawFn(path: string): (text: string) => string;

	// Convenience methods for common colors
	blue(text: string): string;
	cyan(text: string): string;
	gray(text: string): string;
	green(text: string): string;
	magenta(text: string): string;
	red(text: string): string;
	white(text: string): string;
	yellow(text: string): string;

	// Convenience methods for common modifiers
	bold(text: string): string;
	dim(text: string): string;
	inverse(text: string): string;
	italic(text: string): string;
	underline(text: string): string;
}

/**
 * Factory function type for creating ColorAdapter instances
 */
export type ColorAdapterFactory = () => ColorAdapter;

/**
 * Singleton instance
 */
let adapterInstance: ColorAdapter | null = null;

/**
 * Get the singleton ColorAdapter instance
 *
 * @returns ColorAdapter instance
 *
 * @example
 * import { getColorAdapter } from 'output/color-adapter.interface';
 *
 * const color = getColorAdapter();
 * console.log(color.blue('Hello World'));
 * console.log(color.colorModifier('green', 'bold', 'Success!'));
 */
export function getColorAdapter(): ColorAdapter {
	adapterInstance ??= createDefaultColorAdapter();
	return adapterInstance!;
}

/**
 * Set a custom ColorAdapter implementation
 * Useful for testing or switching to different styling libraries
 *
 * @param adapter - The adapter instance to use
 *
 * @example
 * // In tests
 * import { setColorAdapter } from 'output/color-adapter.interface';
 *
 * const mockAdapter = new MockColorAdapter();
 * setColorAdapter(mockAdapter);
 */
export function setColorAdapter(adapter: ColorAdapter): void {
	adapterInstance = adapter;
}
