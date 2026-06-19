/**
 * Tests for the message-compression module.
 * Verifies djb2, compressMessageHistory, and deduplicateLines in isolation.
 */

import { describe, expect, it } from 'vitest';

import type { LLMMessage } from 'types/llm.types';

import { compressMessageHistory, deduplicateLines, djb2 } from './message-compression';

// ── djb2 ──────────────────────────────────────────────────────────────────────

describe('djb2', () => {
	it('returns a non-negative integer', () => {
		expect(djb2('hello')).toBeGreaterThanOrEqual(0);
		expect(Number.isInteger(djb2('hello'))).toBe(true);
	});

	it('is deterministic — same input always yields the same hash', () => {
		expect(djb2('same input')).toBe(djb2('same input'));
	});

	it('produces different hashes for different inputs', () => {
		expect(djb2('input-a')).not.toBe(djb2('input-b'));
	});

	it('returns a numeric hash for an empty string', () => {
		expect(typeof djb2('')).toBe('number');
	});

	it('matches a known fixture — djb2("hello") equals 178056679', () => {
		// Verified by running the algorithm against the string "hello"
		expect(djb2('hello')).toBe(178056679);
	});
});

// ── compressMessageHistory ────────────────────────────────────────────────────

describe('compressMessageHistory', () => {
	function toolMsg(content: string): LLMMessage {
		return { content, role: 'tool' };
	}
	function userMsg(content: string): LLMMessage {
		return { content, role: 'user' };
	}
	const PLACEHOLDER = '[Tool result omitted to reduce context length]';

	it('returns zero and leaves messages unchanged for an empty array', () => {
		const messages: LLMMessage[] = [];
		const count = compressMessageHistory(messages);
		expect(count).toBe(0);
		expect(messages).toHaveLength(0);
	});

	it('leaves a single short message unchanged', () => {
		const messages: LLMMessage[] = [toolMsg('short result')];
		const count = compressMessageHistory(messages);
		expect(count).toBe(0);
		expect(messages[0]?.content).toBe('short result');
	});

	it('replaces tool messages older than keepRecent with the placeholder', () => {
		const messages: LLMMessage[] = [
			userMsg('task'),
			toolMsg('result-1'),
			toolMsg('result-2'),
			toolMsg('result-3'),
			toolMsg('result-4'),
			toolMsg('result-5')
		];
		compressMessageHistory(messages);
		// default keepRecent=4: only index 1 (result-1) is old enough to be pruned
		expect(messages[1]?.content).toBe(PLACEHOLDER);
		// The last 4 tool messages are preserved
		expect(messages[2]?.content).toBe('result-2');
		expect(messages[5]?.content).toBe('result-5');
	});

	it('returns the count of pruned messages', () => {
		const messages: LLMMessage[] = [
			userMsg('task'),
			toolMsg('old-1'),
			toolMsg('old-2'),
			toolMsg('recent-1'),
			toolMsg('recent-2'),
			toolMsg('recent-3'),
			toolMsg('recent-4')
		];
		const count = compressMessageHistory(messages);
		expect(count).toBe(2);
	});

	it('does not replace non-tool messages', () => {
		const messages: LLMMessage[] = [
			userMsg('user message'),
			{ content: 'assistant reply', role: 'assistant' },
			toolMsg('tool result'),
			toolMsg('recent-1'),
			toolMsg('recent-2'),
			toolMsg('recent-3'),
			toolMsg('recent-4')
		];
		compressMessageHistory(messages);
		expect(messages[0]?.content).toBe('user message');
		expect(messages[1]?.content).toBe('assistant reply');
	});

	it('is idempotent — already-pruned messages are not double-counted', () => {
		const messages: LLMMessage[] = [
			userMsg('task'),
			toolMsg(PLACEHOLDER),
			toolMsg('recent-1'),
			toolMsg('recent-2'),
			toolMsg('recent-3'),
			toolMsg('recent-4')
		];
		const count = compressMessageHistory(messages);
		expect(count).toBe(0);
	});

	it('does nothing when message count is within keepRecent', () => {
		const messages: LLMMessage[] = [userMsg('task'), toolMsg('result-1'), toolMsg('result-2')];
		const count = compressMessageHistory(messages);
		expect(count).toBe(0);
		expect(messages[1]?.content).toBe('result-1');
	});

	it('respects a custom keepRecent value', () => {
		const messages: LLMMessage[] = [
			userMsg('task'),
			toolMsg('old-1'),
			toolMsg('old-2'),
			toolMsg('old-3'),
			toolMsg('recent-1'),
			toolMsg('recent-2')
		];
		const count = compressMessageHistory(messages, 2);
		expect(count).toBe(3);
		expect(messages[1]?.content).toBe(PLACEHOLDER);
		expect(messages[4]?.content).toBe('recent-1');
	});
});

// ── deduplicateLines ──────────────────────────────────────────────────────────

describe('deduplicateLines', () => {
	it('returns an empty string for empty input', () => {
		expect(deduplicateLines('')).toBe('');
	});

	it('leaves text with no consecutive duplicates unchanged', () => {
		const input = 'alpha\nbeta\ngamma';
		expect(deduplicateLines(input)).toBe(input);
	});

	it('collapses consecutive identical lines into a count annotation', () => {
		const input = 'line\nline\nline';
		expect(deduplicateLines(input)).toBe('line (×3)');
	});

	it('preserves the first occurrence and annotates the run count', () => {
		const input = 'a\na\nb\nb\nb';
		expect(deduplicateLines(input)).toBe('a (×2)\nb (×3)');
	});

	it('preserves non-adjacent repeats separately', () => {
		const input = 'foo\nbar\nfoo';
		expect(deduplicateLines(input)).toBe('foo\nbar\nfoo');
	});

	it('leaves blank lines untouched regardless of repetition', () => {
		const input = 'a\n\n\nb';
		// blank lines are preserved as-is, not collapsed
		expect(deduplicateLines(input)).toBe('a\n\n\nb');
	});

	it('preserves overall line order after deduplication', () => {
		const input = 'x\nx\ny\nz\nz';
		const result = deduplicateLines(input);
		const lines = result.split('\n');
		expect(lines[0]).toMatch(/^x/);
		expect(lines[1]).toMatch(/^y/);
		expect(lines[2]).toMatch(/^z/);
	});
});
