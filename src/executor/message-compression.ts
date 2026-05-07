/**
 * Message Compression Utilities
 *
 * Pure, stateless helpers for compressing and deduplicating LLM message
 * histories. Extracted from `stage-executor.ts` to keep that module focused
 * on orchestration concerns.
 */

import type { LLMMessage } from 'types/llm.types';

/**
 * Simple djb2 hash — used to detect duplicate tool results across iterations.
 * Pure arithmetic, no imports needed.
 *
 * Exported for unit testing.
 */
export function djb2(s: string): number {
	let h = 5381;
	for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
	return h >>> 0;
}

/**
 * Compress a message array in-place by replacing old tool results with a
 * placeholder, keeping the most recent `keepRecent` messages intact.
 * Returns the number of messages replaced.
 *
 * Extracted from `StageExecutor.compressToolResults` for unit testing.
 */
export function compressMessageHistory(messages: LLMMessage[], keepRecent = 4): number {
	const cutoff = messages.length - keepRecent;
	let pruned = 0;
	for (let i = 0; i < cutoff; i++) {
		const msg = messages[i];
		if (msg?.role === 'tool' && msg.content !== '[Tool result omitted to reduce context length]') {
			messages[i] = { ...msg, content: '[Tool result omitted to reduce context length]' };
			pruned++;
		}
	}
	return pruned;
}

/**
 * Collapse consecutive repeated lines in tool output to `"<line> (×N)"`.
 * Only exact-match consecutive duplicates are collapsed — non-adjacent repeats
 * and blank lines are left untouched to preserve structural context.
 */
export function deduplicateLines(text: string): string {
	const lines = text.split('\n');
	const result: string[] = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i] ?? '';
		// Don't collapse blank lines — they carry structural meaning
		if (!line.trim()) {
			result.push(line);
			i++;
			continue;
		}

		let count = 1;
		while (i + count < lines.length && (lines[i + count] ?? '') === line) {
			count++;
		}

		result.push(count > 1 ? `${line} (×${count})` : line);
		i += count;
	}

	return result.join('\n');
}
