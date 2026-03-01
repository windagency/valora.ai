/**
 * Terminal Utilities
 *
 * Shared utilities for terminal output manipulation including
 * ANSI escape codes and text formatting.
 */

/**
 * ANSI escape codes for terminal control
 */
export const ANSI = {
	CLEAR_LINE: '\x1b[2K',
	CLEAR_TO_END: '\x1b[K',
	cursorDown: (n: number): string => `\x1b[${n}B`,
	cursorUp: (n: number): string => `\x1b[${n}A`,
	HIDE_CURSOR: '\x1b[?25l',
	moveToCol: (n: number): string => `\x1b[${n}G`,
	RESET: '\x1b[0m',
	RESTORE_CURSOR: '\x1b[u',
	SAVE_CURSOR: '\x1b[s',
	SHOW_CURSOR: '\x1b[?25h'
} as const;

/**
 * Strip ANSI escape codes to get visible text
 */
export function stripAnsi(str: string): string {
	// eslint-disable-next-line no-control-regex
	return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Get visible length of text (excluding ANSI codes)
 */
export function getVisibleLength(str: string): number {
	return stripAnsi(str).length;
}

/**
 * Truncate text to fit terminal width, preserving ANSI codes
 */
export function truncateToWidth(text: string, maxWidth: number): string {
	const visibleLength = stripAnsi(text).length;
	if (visibleLength <= maxWidth) {
		return text;
	}

	// Count visible chars and cut, preserving ANSI sequences
	let visibleCount = 0;
	let result = '';
	let inEscape = false;

	for (let i = 0; i < text.length; i++) {
		const char = text[i];

		if (char === '\x1b') {
			inEscape = true;
			result += char;
			continue;
		}

		if (inEscape) {
			result += char;
			if (char === 'm') {
				inEscape = false;
			}
			continue;
		}

		if (visibleCount >= maxWidth - 3) {
			result += '...';
			break;
		}

		result += char;
		visibleCount++;
	}

	// Reset any open ANSI codes
	return result + ANSI.RESET;
}

/**
 * Pad text to a specific visible width
 */
export function padToWidth(text: string, width: number, padChar = ' '): string {
	const visibleLength = getVisibleLength(text);
	if (visibleLength >= width) {
		return text;
	}
	return text + padChar.repeat(width - visibleLength);
}

/**
 * Center text within a specific width
 */
export function centerText(text: string, width: number): string {
	const visibleLength = getVisibleLength(text);
	if (visibleLength >= width) {
		return text;
	}
	const leftPad = Math.floor((width - visibleLength) / 2);
	const rightPad = width - visibleLength - leftPad;
	return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
}

/**
 * Spinner frames for animated indicators
 */
export const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;

/**
 * Get next spinner frame
 */
export function getSpinnerFrame(index: number): string {
	return SPINNER_FRAMES[index % SPINNER_FRAMES.length] ?? '⠋';
}
