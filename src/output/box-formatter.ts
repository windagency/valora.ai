/**
 * Box Formatter Service
 *
 * Centralized service for creating consistent box-drawing elements throughout the CLI.
 * Provides single-line boxes for content and double-line boxes for headers.
 * Follows dependency injection pattern and separation of concerns.
 *
 * Provides:
 * - Single-line boxes for content (progress, code blocks, tables)
 * - Double-line boxes for headers (via HeaderFormatter)
 * - Consistent box-drawing characters
 * - Color theming support
 */

import { type Color, getColorAdapter } from './color-adapter.interface';

/**
 * Box style types
 */
export type BoxStyle = 'double' | 'single';

/**
 * Box border characters for different styles
 */
interface BoxChars {
	bottomJunction: string;
	bottomLeft: string;
	bottomRight: string;
	cross: string;
	horizontal: string;
	leftJunction: string;
	rightJunction: string;
	topJunction: string;
	topLeft: string;
	topRight: string;
	vertical: string;
}

/**
 * Options for box formatting
 */
export interface BoxOptions {
	/**
	 * Color for box borders
	 * @default 'gray'
	 */
	color?: Color;

	/**
	 * Box style (single or double line)
	 * @default 'single'
	 */
	style?: BoxStyle;

	/**
	 * Minimum width of the box
	 * @default 40
	 */
	minWidth?: number;

	/**
	 * Maximum width of the box
	 * @default 80
	 */
	maxWidth?: number;

	/**
	 * Fixed width (overrides min/max)
	 */
	width?: number;

	/**
	 * Padding inside the box
	 * @default 1
	 */
	padding?: number;
}

/**
 * Box Formatter Service
 *
 * Provides consistent box-drawing across the CLI application.
 */
export class BoxFormatter {
	private readonly defaultOptions: Required<Omit<BoxOptions, 'width'>> & { width: number } = {
		color: 'gray',
		maxWidth: 80,
		minWidth: 40,
		padding: 1,
		style: 'single',
		width: 0 // 0 means auto-calculate
	};

	/**
	 * Box characters for different styles
	 */
	private readonly boxChars: Record<BoxStyle, BoxChars> = {
		double: {
			bottomJunction: '╩',
			bottomLeft: '╚',
			bottomRight: '╝',
			cross: '╬',
			horizontal: '═',
			leftJunction: '╠',
			rightJunction: '╣',
			topJunction: '╦',
			topLeft: '╔',
			topRight: '╗',
			vertical: '║'
		},
		single: {
			bottomJunction: '┴',
			bottomLeft: '└',
			bottomRight: '┘',
			cross: '┼',
			horizontal: '─',
			leftJunction: '├',
			rightJunction: '┤',
			topJunction: '┬',
			topLeft: '┌',
			topRight: '┐',
			vertical: '│'
		}
	};

	/**
	 * Create a simple box with content
	 *
	 * @param content - Lines of content to display
	 * @param options - Box formatting options
	 * @returns Formatted box string
	 */
	formatBox(content: string[], options?: BoxOptions): string {
		const opts = { ...this.defaultOptions, ...options };
		const chars = this.boxChars[opts.style];
		const colorFn = this.getColorFunction(opts.color);

		// Calculate width
		const maxContentWidth = Math.max(...content.map((line) => line.length));
		const calculatedWidth = maxContentWidth + opts.padding * 2;
		const width = opts.width || Math.max(opts.minWidth, Math.min(opts.maxWidth, calculatedWidth));

		// Build box
		const top = colorFn(chars.topLeft + chars.horizontal.repeat(width) + chars.topRight);
		const bottom = colorFn(chars.bottomLeft + chars.horizontal.repeat(width) + chars.bottomRight);

		const contentLines = content.map((line) => {
			const paddingLeft = ' '.repeat(opts.padding);
			const paddingRight = ' '.repeat(Math.max(0, width - line.length - opts.padding));
			return colorFn(chars.vertical) + paddingLeft + line + paddingRight + colorFn(chars.vertical);
		});

		return [top, ...contentLines, bottom].join('\n');
	}

	/**
	 * Create a box with a title
	 *
	 * @param title - Title text
	 * @param content - Lines of content to display
	 * @param options - Box formatting options
	 * @returns Formatted box string
	 */
	formatBoxWithTitle(title: string, content: string[], options?: BoxOptions): string {
		const opts = { ...this.defaultOptions, ...options };
		const chars = this.boxChars[opts.style];
		const colorAdapter = getColorAdapter();
		const colorFn = this.getColorFunction(opts.color);

		// Calculate width
		// Find the longest line (title or content)
		const maxContentWidth = Math.max(...content.map((line) => line.length), title.length);
		// Add padding on both sides
		const calculatedWidth = maxContentWidth + opts.padding * 2;
		const width = opts.width || Math.max(opts.minWidth, Math.min(opts.maxWidth, calculatedWidth));

		// Build box
		const top = colorFn(chars.topLeft + chars.horizontal.repeat(width) + chars.topRight);

		// Title line with proper padding on both sides
		const titlePaddingLeft = ' '.repeat(opts.padding);
		const titlePaddingRight = ' '.repeat(Math.max(0, width - title.length - opts.padding));
		const titleLine =
			colorFn(chars.vertical) +
			titlePaddingLeft +
			colorAdapter.bold(title) +
			titlePaddingRight +
			colorFn(chars.vertical);

		const separator = colorFn(chars.leftJunction + chars.horizontal.repeat(width) + chars.rightJunction);
		const bottom = colorFn(chars.bottomLeft + chars.horizontal.repeat(width) + chars.bottomRight);

		// Content lines with proper padding on both sides
		const contentLines = content.map((line) => {
			const paddingLeft = ' '.repeat(opts.padding);
			const paddingRight = ' '.repeat(Math.max(0, width - line.length - opts.padding));
			return colorFn(chars.vertical) + paddingLeft + line + paddingRight + colorFn(chars.vertical);
		});

		return [top, titleLine, separator, ...contentLines, bottom].join('\n');
	}

	/**
	 * Create a box border (top, bottom, or separator)
	 *
	 * @param type - Type of border ('top' | 'bottom' | 'separator')
	 * @param width - Width of the border
	 * @param options - Box formatting options
	 * @returns Formatted border string
	 */
	formatBorder(
		type: 'bottom' | 'separator' | 'top',
		width: number,
		options?: Pick<BoxOptions, 'color' | 'style'>
	): string {
		const opts = { ...this.defaultOptions, ...options };
		const chars = this.boxChars[opts.style];
		const colorFn = this.getColorFunction(opts.color);

		const borderMap = {
			bottom: chars.bottomLeft + chars.horizontal.repeat(width) + chars.bottomRight,
			separator: chars.leftJunction + chars.horizontal.repeat(width) + chars.rightJunction,
			top: chars.topLeft + chars.horizontal.repeat(width) + chars.topRight
		};

		return colorFn(borderMap[type]);
	}

	/**
	 * Create table borders
	 *
	 * @param columnWidths - Array of column widths
	 * @param type - Type of border ('top' | 'bottom' | 'separator')
	 * @param options - Box formatting options
	 * @returns Formatted table border string
	 */
	formatTableBorder(
		columnWidths: number[],
		type: 'bottom' | 'separator' | 'top',
		options?: Pick<BoxOptions, 'color' | 'style'>
	): string {
		const opts = { ...this.defaultOptions, ...options };
		const chars = this.boxChars[opts.style];
		const colorFn = this.getColorFunction(opts.color);

		const junctionMap = {
			bottom: {
				left: chars.bottomLeft,
				middle: chars.bottomJunction,
				right: chars.bottomRight
			},
			separator: {
				left: chars.leftJunction,
				middle: chars.cross,
				right: chars.rightJunction
			},
			top: {
				left: chars.topLeft,
				middle: chars.topJunction,
				right: chars.topRight
			}
		};

		const junction = junctionMap[type];
		const segments = columnWidths.map((w) => chars.horizontal.repeat(w + 2));
		const border = junction.left + segments.join(junction.middle) + junction.right;

		return colorFn(border);
	}

	/**
	 * Create a box line (content line with borders)
	 *
	 * @param content - Content string
	 * @param width - Total width
	 * @param options - Box formatting options
	 * @returns Formatted line string
	 */
	formatBoxLine(content: string, width: number, options?: BoxOptions): string {
		const opts = { ...this.defaultOptions, ...options };
		const chars = this.boxChars[opts.style];
		const colorFn = this.getColorFunction(opts.color);

		const paddingLeft = ' '.repeat(opts.padding);
		const paddingRight = ' '.repeat(Math.max(0, width - content.length - opts.padding));

		return colorFn(chars.vertical) + paddingLeft + content + paddingRight + colorFn(chars.vertical);
	}

	/**
	 * Get the box characters for a given style
	 *
	 * @param style - Box style
	 * @returns Box characters
	 */
	getBoxChars(style: BoxStyle = 'single'): BoxChars {
		return { ...this.boxChars[style] };
	}

	/**
	 * Get color function by name using the ColorAdapter
	 */
	private getColorFunction(color: Color): (text: string) => string {
		const colorAdapter = getColorAdapter();
		const colorMap: Record<Color, (text: string) => string> = {
			blue: (text) => colorAdapter.blue(text),
			cyan: (text) => colorAdapter.cyan(text),
			gray: (text) => colorAdapter.gray(text),
			green: (text) => colorAdapter.green(text),
			magenta: (text) => colorAdapter.magenta(text),
			red: (text) => colorAdapter.red(text),
			white: (text) => colorAdapter.white(text),
			yellow: (text) => colorAdapter.yellow(text)
		};

		return colorMap[color] || ((text) => colorAdapter.gray(text));
	}
}

/**
 * Singleton instance
 */
let instance: BoxFormatter | null = null;

/**
 * Get singleton box formatter instance
 *
 * @returns BoxFormatter instance
 *
 * @example
 * import { getBoxFormatter } from 'output/box-formatter';
 *
 * const formatter = getBoxFormatter();
 * console.log(formatter.formatBox(['Line 1', 'Line 2']));
 */
export function getBoxFormatter(): BoxFormatter {
	instance ??= new BoxFormatter();
	return instance;
}
