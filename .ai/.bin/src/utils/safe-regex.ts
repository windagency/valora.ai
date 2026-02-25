/**
 * Safe Regex Utilities
 *
 * Mitigates ReDoS (Regular Expression Denial of Service) risks when
 * constructing RegExp from user-provided patterns (e.g. hook matchers
 * in config). Since patterns are user-authored and local, the risk is
 * low, but these guards prevent accidental catastrophic backtracking.
 *
 * Provides:
 * - Static detection of patterns prone to catastrophic backtracking
 * - Bounded regex test that limits input length
 * - Regex-special-character escaping for safe interpolation
 */

/**
 * Maximum input length for safeRegexTest.
 * Tool names and similar identifiers should never approach this limit.
 */
const DEFAULT_MAX_INPUT_LENGTH = 1024;

/**
 * Heuristic patterns that indicate a regex may be vulnerable to
 * catastrophic backtracking (ReDoS). These detect the most common
 * problematic structures:
 *
 * 1. Nested quantifiers: (a+)+, (a*)+, (a+)*, (a*)*, (a+)?, (a*)?
 * 2. Overlapping alternation with quantifier: (a|a)+
 * 3. Quantified groups containing quantified alternations
 */
const REDOS_HEURISTICS: Array<{ name: string; pattern: RegExp }> = [
	{
		name: 'nested_quantifier',
		// A quantifier (+, *, {n,}) immediately after a group close that itself
		// contains a quantifier. Catches (x+)+, (x*)+, (x+)*, etc.
		pattern: /([+*]|\{\d+,\d*\})\)([+*?]|\{\d+,\d*\})/
	},
	{
		name: 'nested_quantifier_noncapturing',
		// Same but for non-capturing groups: (?:x+)+
		pattern: /([+*]|\{\d+,\d*\})\)([+*?]|\{\d+,\d*\})/
	},
	{
		name: 'overlapping_alternation_quantified',
		// Alternation of overlapping patterns inside a quantified group:
		// (a|a)+, (\w|\d)+, (.|x)+ etc.
		pattern: /\((?:[^)]*\|[^)]*)\)[+*]/
	}
];

/**
 * Check whether a regex pattern string is likely vulnerable to ReDoS
 * via catastrophic backtracking.
 *
 * This is a heuristic check — it will not catch every possible ReDoS
 * pattern, but it reliably detects the most common dangerous structures
 * (nested quantifiers, overlapping alternations with quantifiers).
 *
 * @param pattern - The regex source string to analyse
 * @returns Object with `safe` boolean and optional `reason` string
 */
export function checkReDoSRisk(pattern: string): { reason?: string; safe: boolean } {
	for (const { name, pattern: heuristic } of REDOS_HEURISTICS) {
		if (heuristic.test(pattern)) {
			return {
				reason: `Pattern may cause catastrophic backtracking (${name}): "${pattern}"`,
				safe: false
			};
		}
	}
	return { safe: true };
}

/**
 * Test a regex against an input string with ReDoS safeguards:
 * 1. Input length is capped to prevent long-input amplification.
 * 2. Returns false (no match) if input exceeds the cap — tool names
 *    and similar identifiers should always be short.
 *
 * @param regex   - The compiled RegExp to test
 * @param input   - The string to test against
 * @param maxLen  - Maximum allowed input length (default 1024)
 * @returns true if the regex matches the (bounded) input
 */
export function safeRegexTest(regex: RegExp, input: string, maxLen: number = DEFAULT_MAX_INPUT_LENGTH): boolean {
	if (input.length > maxLen) {
		return false;
	}
	return regex.test(input);
}

/**
 * Escape all regex-special characters in a string so it can be safely
 * interpolated into a RegExp pattern as a literal.
 *
 * @param str - The string to escape
 * @returns The escaped string safe for `new RegExp(...)` interpolation
 */
export function escapeRegExp(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
