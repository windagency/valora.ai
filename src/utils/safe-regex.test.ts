/**
 * Unit tests for safe-regex utilities
 *
 * Tests ReDoS detection heuristics, bounded regex testing,
 * and regex-special-character escaping.
 */

import { checkReDoSRisk, escapeRegExp, safeRegexTest } from 'utils/safe-regex';
import { describe, expect, it } from 'vitest';

describe('checkReDoSRisk', () => {
	it('should accept simple patterns', () => {
		expect(checkReDoSRisk('write')).toEqual({ safe: true });
		expect(checkReDoSRisk('write|read')).toEqual({ safe: true });
		expect(checkReDoSRisk('.*')).toEqual({ safe: true });
		expect(checkReDoSRisk('^tool_\\w+$')).toEqual({ safe: true });
		expect(checkReDoSRisk('file_(read|write)')).toEqual({ safe: true });
	});

	it('should reject nested quantifiers like (a+)+', () => {
		const result = checkReDoSRisk('(a+)+');
		expect(result.safe).toBe(false);
		expect(result.reason).toContain('nested_quantifier');
	});

	it('should reject nested quantifiers like (a*)*', () => {
		const result = checkReDoSRisk('(a*)*');
		expect(result.safe).toBe(false);
	});

	it('should reject nested quantifiers like (a+)*', () => {
		const result = checkReDoSRisk('(a+)*');
		expect(result.safe).toBe(false);
	});

	it('should reject nested quantifiers like (a*)?', () => {
		const result = checkReDoSRisk('(a*)?');
		expect(result.safe).toBe(false);
	});

	it('should reject nested quantifiers with bounded repetition', () => {
		const result = checkReDoSRisk('(a{1,10})+');
		expect(result.safe).toBe(false);
	});

	it('should reject overlapping alternation with quantifier like (a|a)+', () => {
		const result = checkReDoSRisk('(a|a)+');
		expect(result.safe).toBe(false);
		expect(result.reason).toContain('overlapping_alternation');
	});

	it('should reject quantified alternation groups', () => {
		const result = checkReDoSRisk('(\\w|\\d)+');
		expect(result.safe).toBe(false);
	});

	it('should accept alternation without outer quantifier', () => {
		expect(checkReDoSRisk('(a|b)')).toEqual({ safe: true });
	});
});

describe('safeRegexTest', () => {
	it('should return true for matching input within bounds', () => {
		const regex = /^write$/;
		expect(safeRegexTest(regex, 'write')).toBe(true);
	});

	it('should return false for non-matching input', () => {
		const regex = /^write$/;
		expect(safeRegexTest(regex, 'read')).toBe(false);
	});

	it('should return false when input exceeds max length', () => {
		const regex = /a/;
		const longInput = 'a'.repeat(2000);
		expect(safeRegexTest(regex, longInput)).toBe(false);
	});

	it('should respect custom max length', () => {
		const regex = /a/;
		const input = 'a'.repeat(50);
		expect(safeRegexTest(regex, input, 100)).toBe(true);
		expect(safeRegexTest(regex, input, 10)).toBe(false);
	});

	it('should handle default max length of 1024', () => {
		const regex = /./;
		expect(safeRegexTest(regex, 'x'.repeat(1024))).toBe(true);
		expect(safeRegexTest(regex, 'x'.repeat(1025))).toBe(false);
	});
});

describe('escapeRegExp', () => {
	it('should escape dots', () => {
		expect(escapeRegExp('file.txt')).toBe('file\\.txt');
	});

	it('should escape all special characters', () => {
		expect(escapeRegExp('a.*+?^${}()|[]\\b')).toBe('a\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\b');
	});

	it('should leave alphanumeric characters untouched', () => {
		expect(escapeRegExp('abc123')).toBe('abc123');
	});

	it('should produce a string safe for RegExp interpolation', () => {
		const name = 'test[0]';
		const pattern = new RegExp(`"${escapeRegExp(name)}"\\s*:`);
		expect(pattern.test('"test[0]" : value')).toBe(true);
		expect(pattern.test('"test0" : value')).toBe(false);
	});
});
