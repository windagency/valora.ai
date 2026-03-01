/**
 * Terminal Utilities Tests
 */

import { describe, expect, it } from 'vitest';

import {
	ANSI,
	centerText,
	getSpinnerFrame,
	getVisibleLength,
	padToWidth,
	SPINNER_FRAMES,
	stripAnsi,
	truncateToWidth
} from '../terminal-utils';

describe('ANSI constants', () => {
	it('should have standard escape codes', () => {
		expect(ANSI.CLEAR_LINE).toBe('\x1b[2K');
		expect(ANSI.HIDE_CURSOR).toBe('\x1b[?25l');
		expect(ANSI.SHOW_CURSOR).toBe('\x1b[?25h');
		expect(ANSI.RESET).toBe('\x1b[0m');
	});

	it('should have cursor movement functions', () => {
		expect(ANSI.cursorUp(3)).toBe('\x1b[3A');
		expect(ANSI.cursorDown(5)).toBe('\x1b[5B');
		expect(ANSI.moveToCol(10)).toBe('\x1b[10G');
	});
});

describe('stripAnsi', () => {
	it('should strip color codes', () => {
		const colored = '\x1b[31mRed Text\x1b[0m';
		expect(stripAnsi(colored)).toBe('Red Text');
	});

	it('should strip multiple codes', () => {
		const text = '\x1b[1m\x1b[32mBold Green\x1b[0m';
		expect(stripAnsi(text)).toBe('Bold Green');
	});

	it('should return plain text unchanged', () => {
		expect(stripAnsi('Plain text')).toBe('Plain text');
	});

	it('should handle empty string', () => {
		expect(stripAnsi('')).toBe('');
	});
});

describe('getVisibleLength', () => {
	it('should return length of plain text', () => {
		expect(getVisibleLength('Hello')).toBe(5);
	});

	it('should ignore ANSI codes in length calculation', () => {
		const colored = '\x1b[31mHello\x1b[0m';
		expect(getVisibleLength(colored)).toBe(5);
	});
});

describe('truncateToWidth', () => {
	it('should not truncate text shorter than width', () => {
		expect(truncateToWidth('Short', 10)).toBe('Short');
	});

	it('should truncate long text with ellipsis', () => {
		const result = truncateToWidth('This is a very long text', 10);
		expect(getVisibleLength(result)).toBeLessThanOrEqual(10);
		expect(result).toContain('...');
	});

	it('should preserve ANSI codes while truncating', () => {
		const colored = '\x1b[31mThis is a very long red text\x1b[0m';
		const result = truncateToWidth(colored, 15);
		// Result should still contain the color code
		expect(result).toContain('\x1b[31m');
		// And should have reset at the end
		expect(result).toContain('\x1b[0m');
	});
});

describe('padToWidth', () => {
	it('should pad text with spaces', () => {
		const result = padToWidth('Hi', 5);
		expect(result).toBe('Hi   ');
	});

	it('should use custom pad character', () => {
		const result = padToWidth('Hi', 5, '-');
		expect(result).toBe('Hi---');
	});

	it('should not pad text already at width', () => {
		const result = padToWidth('Hello', 5);
		expect(result).toBe('Hello');
	});

	it('should not truncate text longer than width', () => {
		const result = padToWidth('Hello World', 5);
		expect(result).toBe('Hello World');
	});
});

describe('centerText', () => {
	it('should center text within width', () => {
		const result = centerText('Hi', 6);
		expect(result).toBe('  Hi  ');
	});

	it('should handle odd widths', () => {
		const result = centerText('Hi', 7);
		expect(result.length).toBe(7);
		expect(result.trim()).toBe('Hi');
	});

	it('should not modify text longer than width', () => {
		const result = centerText('Hello World', 5);
		expect(result).toBe('Hello World');
	});
});

describe('SPINNER_FRAMES', () => {
	it('should have 10 frames', () => {
		expect(SPINNER_FRAMES.length).toBe(10);
	});

	it('should contain braille characters', () => {
		expect(SPINNER_FRAMES[0]).toBe('⠋');
	});
});

describe('getSpinnerFrame', () => {
	it('should return first frame for index 0', () => {
		expect(getSpinnerFrame(0)).toBe('⠋');
	});

	it('should cycle through frames', () => {
		expect(getSpinnerFrame(0)).toBe(SPINNER_FRAMES[0]);
		expect(getSpinnerFrame(5)).toBe(SPINNER_FRAMES[5]);
		expect(getSpinnerFrame(10)).toBe(SPINNER_FRAMES[0]); // Wraps around
	});

	it('should handle large indices', () => {
		const result = getSpinnerFrame(1000);
		expect(SPINNER_FRAMES).toContain(result);
	});
});
