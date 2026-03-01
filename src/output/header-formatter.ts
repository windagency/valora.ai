/**
 * Header Formatter Service
 *
 * Centralized service for creating consistent, formatted headers throughout the CLI.
 * Follows dependency injection pattern and separation of concerns.
 *
 * Provides:
 * - Box-drawing headers with customizable width and styling
 * - Single or multi-line headers (title, subtitle, etc.)
 * - Consistent padding and alignment
 * - Color theming support
 */

import { type Color, getColorAdapter } from './color-adapter.interface';
import { getConsoleOutput } from './console-output';

/**
 * Color options for header styling
 * Re-export from ColorAdapter for backward compatibility
 */
export type HeaderColor = Color;

/**
 * Options for header formatting
 */
export interface HeaderOptions {
	/**
	 * Primary color for box borders and title
	 * @default 'cyan'
	 */
	color?: HeaderColor;

	/**
	 * Maximum width of the header box
	 * If not specified, auto-calculates based on content
	 * @default auto-calculated from content
	 */
	width?: number;

	/**
	 * Minimum width of the header box
	 * @default 40
	 */
	minWidth?: number;

	/**
	 * Maximum width of the header box
	 * @default 70
	 */
	maxWidth?: number;

	/**
	 * Padding on each side of content
	 * @default 4
	 */
	padding?: number;

	/**
	 * Whether to make the title bold
	 * @default true
	 */
	bold?: boolean;

	/**
	 * Whether to center-align text
	 * @default true
	 */
	centered?: boolean;
}

/**
 * Header Formatter Service
 *
 * Provides consistent header formatting across the CLI application.
 */
export class HeaderFormatter {
	private readonly defaultOptions: Required<HeaderOptions> = {
		bold: true,
		centered: true,
		color: 'cyan',
		maxWidth: 70,
		minWidth: 40,
		padding: 4,
		width: 0 // 0 means auto-calculate
	};

	/**
	 * Format a simple header with a single title
	 *
	 * @param title - The main header text
	 * @param options - Formatting options
	 * @returns Formatted header string ready for console output
	 *
	 * @example
	 * const header = formatter.formatHeader('My App');
	 * console.log(header);
	 * // ╔════════════════╗
	 * // ║    My App      ║
	 * // ╚════════════════╝
	 */
	formatHeader(title: string, options?: HeaderOptions): string {
		return this.formatMultiLineHeader([title], options);
	}

	/**
	 * Format a header with multiple lines of text
	 *
	 * @param lines - Array of text lines to display
	 * @param options - Formatting options
	 * @returns Formatted header string ready for console output
	 *
	 * @example
	 * const header = formatter.formatMultiLineHeader(['Title', 'Line 2', 'Line 3']);
	 * console.log(header);
	 */
	formatMultiLineHeader(lines: string[], options?: HeaderOptions): string {
		const opts = { ...this.defaultOptions, ...options };
		const colorAdapter = getColorAdapter();

		// Determine styling function based on options
		const styleFn = opts.bold ? (text: string) => colorAdapter.bold(text) : (text: string) => text;

		// ENFORCE: First line uses cyan color only when no color option is explicitly passed
		const shouldEnforceCyan = !options?.color && lines.length > 0;

		// Prepare styled content lines with uniform styling
		const styledLines = lines.map((text, index) => ({
			colorFn:
				index === 0 && shouldEnforceCyan
					? opts.bold
						? (text: string) => colorAdapter.cyan(colorAdapter.bold(text))
						: (text: string) => colorAdapter.cyan(text)
					: styleFn,
			text
		}));

		return this.buildHeaderBox(styledLines, opts);
	}

	/**
	 * Format a simple separator line
	 *
	 * @param width - Width of the separator
	 * @param options - Formatting options
	 * @returns Formatted separator string
	 */
	formatSeparator(width: number = 60, options?: Pick<HeaderOptions, 'color'>): string {
		const colorFn = this.getColorFunction(options?.color ?? 'gray');
		return colorFn('─'.repeat(width));
	}

	/**
	 * Display a header directly to console
	 *
	 * @param title - The main header text
	 * @param options - Formatting options
	 */
	displayHeader(title: string, options?: HeaderOptions): void {
		getConsoleOutput().print(this.formatHeader(title, options));
	}

	/**
	 * Wrap text to fit within a maximum width
	 */
	private wrapText(text: string, maxWidth: number): string[] {
		if (text.length <= maxWidth) {
			return [text];
		}

		const words = text.split(' ');
		const lines: string[] = [];
		let currentLine = '';

		for (const word of words) {
			if (currentLine.length === 0) {
				currentLine = word;
			} else if (currentLine.length + 1 + word.length <= maxWidth) {
				currentLine += ' ' + word;
			} else {
				lines.push(currentLine);
				currentLine = word;
			}
		}

		if (currentLine.length > 0) {
			lines.push(currentLine);
		}

		return lines;
	}

	/**
	 * Build a header box with styled content lines
	 * Core method that handles box-drawing logic for all header types
	 *
	 * @param styledLines - Array of lines with their styling functions
	 * @param opts - Merged header options
	 * @returns Formatted header string
	 */
	private buildHeaderBox(
		styledLines: Array<{ colorFn: (text: string) => string; text: string }>,
		opts: Required<HeaderOptions>
	): string {
		// Calculate available content width (inner box width minus padding)
		const innerContentWidth = opts.maxWidth - opts.padding * 2;

		// Wrap lines that exceed the inner content width
		const wrappedLines: Array<{ colorFn: (text: string) => string; text: string }> = [];
		for (const line of styledLines) {
			const wrapped = this.wrapText(line.text, innerContentWidth);
			for (const wrappedText of wrapped) {
				wrappedLines.push({ colorFn: line.colorFn, text: wrappedText });
			}
		}

		// Calculate width based on longest wrapped line
		const contentWidth = Math.max(...wrappedLines.map((line) => line.text.length));
		const calculatedWidth = contentWidth + opts.padding * 2;
		// Ensure box fits content - don't cap at maxWidth if content is wider
		const width = opts.width || Math.max(opts.minWidth, calculatedWidth);

		// Get color function for borders
		const borderColorFn = this.getColorFunction(opts.color);

		// Build header using functional composition
		const topBorder = borderColorFn('╔' + '═'.repeat(width) + '╗');
		const bottomBorder = borderColorFn('╚' + '═'.repeat(width) + '╝');

		const contentLines = wrappedLines.map(({ colorFn, text }) => {
			const content = opts.centered
				? this.centerText(text, width, false, colorFn)
				: this.leftAlignText(text, width, false, colorFn);
			return borderColorFn('║') + content + borderColorFn('║');
		});

		return '\n' + [topBorder, ...contentLines, bottomBorder].join('\n') + '\n';
	}

	/**
	 * Center-align text within a given width
	 */
	private centerText(text: string, width: number, bold: boolean, colorFn?: (text: string) => string): string {
		const padding = Math.max(0, Math.round((width - text.length) / 2));
		const paddingStr = ' '.repeat(padding);
		const remainingPadding = width - text.length - padding;
		const remainingPaddingStr = ' '.repeat(Math.max(0, remainingPadding));
		const colorAdapter = getColorAdapter();

		const styleStrategies: Record<string, () => string> = {
			default: () => text,
			withBold: () => colorAdapter.bold(text),
			withColor: () => colorFn!(text)
		};

		const strategy = colorFn ? 'withColor' : bold ? 'withBold' : 'default';
		const styleFn = styleStrategies[strategy];
		const styledText = styleFn ? styleFn() : text;

		return paddingStr + styledText + remainingPaddingStr;
	}

	/**
	 * Left-align text with padding
	 */
	private leftAlignText(text: string, width: number, bold: boolean, colorFn?: (text: string) => string): string {
		const colorAdapter = getColorAdapter();

		const styleStrategies: Record<string, () => string> = {
			default: () => text,
			withBold: () => colorAdapter.bold(text),
			withColor: () => colorFn!(text)
		};

		const strategy = colorFn ? 'withColor' : bold ? 'withBold' : 'default';
		const styleFn = styleStrategies[strategy];
		const styledText = styleFn ? styleFn() : text;

		const padding = ' '.repeat(Math.max(0, width - text.length - 2));
		return '  ' + styledText + padding;
	}

	/**
	 * Get color function by name using the ColorAdapter
	 */
	private getColorFunction(color: HeaderColor): (text: string) => string {
		const colorAdapter = getColorAdapter();
		const colorMap: Record<HeaderColor, (text: string) => string> = {
			blue: (text) => colorAdapter.blue(text),
			cyan: (text) => colorAdapter.cyan(text),
			gray: (text) => colorAdapter.gray(text),
			green: (text) => colorAdapter.green(text),
			magenta: (text) => colorAdapter.magenta(text),
			red: (text) => colorAdapter.red(text),
			white: (text) => colorAdapter.white(text),
			yellow: (text) => colorAdapter.yellow(text)
		};

		return colorMap[color] || ((text) => colorAdapter.cyan(text));
	}
}

/**
 * Singleton instance
 */
let instance: HeaderFormatter | null = null;

/**
 * Get singleton header formatter instance
 *
 * @returns HeaderFormatter instance
 *
 * @example
 * import { getHeaderFormatter } from 'output/header-formatter';
 *
 * const formatter = getHeaderFormatter();
 * console.log(formatter.formatHeader('My Title'));
 */
export function getHeaderFormatter(): HeaderFormatter {
	instance ??= new HeaderFormatter();
	return instance;
}
