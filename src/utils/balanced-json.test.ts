import { describe, expect, it } from 'vitest';

import { findEnclosingBraceStart, findMatchingBracketEnd } from './balanced-json';

describe('findMatchingBracketEnd', () => {
	it('finds the matching close brace for a flat object', () => {
		const content = '{"a": 1}';
		expect(findMatchingBracketEnd(content, 0)).toBe(content.length - 1);
	});

	it("finds the outer close brace rather than an inner nested object's close", () => {
		const content = '{"a": {"b": 1}, "c": 2}';
		expect(findMatchingBracketEnd(content, 0)).toBe(content.length - 1);
	});

	it('finds the matching close bracket for a nested array', () => {
		const content = '[["a","b"], ["c"]]';
		expect(findMatchingBracketEnd(content, 0)).toBe(content.length - 1);
	});

	it('does not miscount a brace that appears inside a string literal', () => {
		const content = '{"reasoning": "the config uses a {placeholder} pattern"}';
		expect(findMatchingBracketEnd(content, 0)).toBe(content.length - 1);
	});

	it('does not miscount a brace escaped-quote boundary inside a string literal', () => {
		const content = String.raw`{"note": "quoted \"value\" with a } inside"}`;
		expect(findMatchingBracketEnd(content, 0)).toBe(content.length - 1);
	});

	it('returns null when there is no closing bracket before the end of the string', () => {
		const content = '{"a": 1';
		expect(findMatchingBracketEnd(content, 0)).toBeNull();
	});

	it('returns null when the index given is not an opening bracket', () => {
		const content = '"a": 1}';
		expect(findMatchingBracketEnd(content, 0)).toBeNull();
	});
});

describe('findEnclosingBraceStart', () => {
	it('finds the brace that directly encloses the given index', () => {
		const content = '{"_escalation": {"a": 1}}';
		const keyIndex = content.indexOf('"_escalation"');
		expect(findEnclosingBraceStart(content, keyIndex)).toBe(0);
	});

	it('returns null when there is no enclosing brace before the given index', () => {
		const content = 'no braces here at all, just "_escalation" as a word';
		const keyIndex = content.indexOf('"_escalation"');
		expect(findEnclosingBraceStart(content, keyIndex)).toBeNull();
	});
});
