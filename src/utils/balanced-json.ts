/**
 * Balanced-Bracket JSON Scanning
 *
 * LLM responses often embed JSON with nested objects/arrays. Regex-based extraction
 * that stops at the first closing bracket it meets truncates on any inner nesting
 * (e.g. `{"a": {"b": 1}, "c": 2}` truncates to `{"a": {"b": 1}` — unbalanced). These
 * helpers instead walk the string tracking bracket depth and skip over string-literal
 * contents (including escaped quotes), so braces/brackets inside free-text field
 * values don't miscount depth.
 */

function closingBracketFor(char: string | undefined): null | string {
	if (char === '{') return '}';
	if (char === '[') return ']';
	return null;
}

/**
 * Given the index of a string literal's opening `"`, returns the index of its matching
 * closing `"`, skipping escaped-quote sequences. Falls back to the end of `content` if
 * the string is never closed (malformed/truncated input).
 */
function skipStringLiteral(content: string, quoteIndex: number): number {
	let i = quoteIndex + 1;
	while (i < content.length) {
		if (content[i] === '\\') {
			i += 2;
			continue;
		}
		if (content[i] === '"') {
			return i;
		}
		i++;
	}
	return content.length - 1;
}

/**
 * Finds the index of the bracket matching the one at `openIndex` (must be `{` or `[`
 * in `content`), skipping over string-literal contents. Returns null if `openIndex`
 * isn't an opening bracket or no match is found before the end of the string.
 */
export function findMatchingBracketEnd(content: string, openIndex: number): null | number {
	const openChar = content[openIndex];
	const closeChar = closingBracketFor(openChar);
	if (!closeChar) return null;

	let depth = 0;

	for (let i = openIndex; i < content.length; i++) {
		const char = content[i];

		if (char === '"') {
			i = skipStringLiteral(content, i);
			continue;
		}
		if (char === openChar) {
			depth++;
		} else if (char === closeChar) {
			depth--;
			if (depth === 0) return i;
		}
	}

	return null;
}

/**
 * Walks backward from `fromIndex` to find the `{` that encloses it, balancing any
 * `}`/`{` pairs met along the way. Returns null if no enclosing brace is found.
 */
export function findEnclosingBraceStart(content: string, fromIndex: number): null | number {
	let depth = 0;
	for (let i = fromIndex; i >= 0; i--) {
		const char = content[i];
		if (char === '}') {
			depth++;
		} else if (char === '{') {
			if (depth === 0) return i;
			depth--;
		}
	}
	return null;
}
