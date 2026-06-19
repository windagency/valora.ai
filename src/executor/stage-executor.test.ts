import { describe, expect, it } from 'vitest';
import type { LLMMessage } from 'types/llm.types';
import {
	buildDedupKey,
	compressMessageHistory,
	DEFAULT_FAILURE_POLICY,
	djb2,
	isToolBlockedResult,
	isToolLoopSpinning
} from './stage-executor';

describe('DEFAULT_FAILURE_POLICY', () => {
	it('assigns tolerant to read-only/exploratory stage types', () => {
		expect(DEFAULT_FAILURE_POLICY.context).toBe('tolerant');
		expect(DEFAULT_FAILURE_POLICY.review).toBe('tolerant');
		expect(DEFAULT_FAILURE_POLICY.plan).toBe('tolerant');
		expect(DEFAULT_FAILURE_POLICY.breakdown).toBe('tolerant');
		expect(DEFAULT_FAILURE_POLICY.onboard).toBe('tolerant');
		expect(DEFAULT_FAILURE_POLICY.documentation).toBe('tolerant');
	});

	it('assigns strict to mutating stage types', () => {
		expect(DEFAULT_FAILURE_POLICY.code).toBe('strict');
		expect(DEFAULT_FAILURE_POLICY.test).toBe('strict');
		expect(DEFAULT_FAILURE_POLICY.refactor).toBe('strict');
		expect(DEFAULT_FAILURE_POLICY.deployment).toBe('strict');
		expect(DEFAULT_FAILURE_POLICY.maintenance).toBe('strict');
	});

	it('covers all stage types', () => {
		const allStageTypes = [
			'breakdown',
			'code',
			'context',
			'deployment',
			'documentation',
			'maintenance',
			'onboard',
			'plan',
			'refactor',
			'review',
			'test'
		];
		for (const stageType of allStageTypes) {
			expect(DEFAULT_FAILURE_POLICY).toHaveProperty(stageType);
		}
	});

	it('only contains valid policy values', () => {
		const validPolicies = ['strict', 'tolerant', 'lenient'];
		for (const policy of Object.values(DEFAULT_FAILURE_POLICY)) {
			expect(validPolicies).toContain(policy);
		}
	});
});

// ── djb2 ──────────────────────────────────────────────────────────────────────

describe('djb2', () => {
	it('returns a non-negative integer', () => {
		expect(djb2('hello')).toBeGreaterThanOrEqual(0);
		expect(Number.isInteger(djb2('hello'))).toBe(true);
	});

	it('returns the same value for the same input', () => {
		expect(djb2('same input')).toBe(djb2('same input'));
	});

	it('returns different values for different inputs', () => {
		expect(djb2('input-a')).not.toBe(djb2('input-b'));
	});

	it('returns a numeric hash for an empty string', () => {
		expect(typeof djb2('')).toBe('number');
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

// ── buildDedupKey ─────────────────────────────────────────────────────────────

describe('buildDedupKey', () => {
	it('returns different keys for the same result when tool arguments differ', () => {
		const key1 = buildDedupKey('run_terminal_cmd', { command: 'ls -la' }, 'Use eza instead');
		const key2 = buildDedupKey('run_terminal_cmd', { command: 'ls src/' }, 'Use eza instead');
		expect(key1).not.toBe(key2);
	});

	it('returns different keys for git log variants that all return empty output on an empty repo', () => {
		const emptyOutput = '';
		const key1 = buildDedupKey('run_terminal_cmd', { command: 'git log --all --oneline 2>/dev/null' }, emptyOutput);
		const key2 = buildDedupKey(
			'run_terminal_cmd',
			{ command: 'git log --all --format="%H|%s" 2>/dev/null' },
			emptyOutput
		);
		expect(key1).not.toBe(key2);
	});

	it('returns the same key for an identical tool call with an identical result (true duplicate)', () => {
		const key1 = buildDedupKey('run_terminal_cmd', { command: 'git status' }, 'nothing to commit');
		const key2 = buildDedupKey('run_terminal_cmd', { command: 'git status' }, 'nothing to commit');
		expect(key1).toBe(key2);
	});

	it('returns different keys when only the result differs', () => {
		const key1 = buildDedupKey('run_terminal_cmd', { command: 'git status' }, 'clean');
		const key2 = buildDedupKey('run_terminal_cmd', { command: 'git status' }, 'modified: src/foo.ts');
		expect(key1).not.toBe(key2);
	});

	it('returns different keys when only the tool name differs', () => {
		const key1 = buildDedupKey('read_file', { path: 'README.md' }, 'content');
		const key2 = buildDedupKey('write_file', { path: 'README.md' }, 'content');
		expect(key1).not.toBe(key2);
	});

	it('returns the same key regardless of argument key insertion order', () => {
		const key1 = buildDedupKey('run_terminal_cmd', { command: 'git status', cwd: '/repo' }, 'clean');
		const key2 = buildDedupKey('run_terminal_cmd', { cwd: '/repo', command: 'git status' }, 'clean');
		expect(key1).toBe(key2);
	});
});

describe('isToolLoopSpinning', () => {
	it('returns true when every tool result in the iteration was a duplicate', () => {
		expect(isToolLoopSpinning(3, 3)).toBe(true);
	});

	it('returns false when only some results were duplicates', () => {
		expect(isToolLoopSpinning(1, 3)).toBe(false);
	});

	it('returns false when no results were duplicates', () => {
		expect(isToolLoopSpinning(0, 3)).toBe(false);
	});

	it('returns false when there were no tool calls at all', () => {
		expect(isToolLoopSpinning(0, 0)).toBe(false);
	});
});

describe('isToolBlockedResult', () => {
	it('returns true for output produced by a PreToolUse hook block', () => {
		expect(isToolBlockedResult("Tool call blocked by hook: Use 'eza' instead of 'ls'.")).toBe(true);
	});

	it('returns true regardless of the specific block reason', () => {
		expect(isToolBlockedResult("Tool call blocked by hook: Use 'jq' instead of 'cat' for JSON files.")).toBe(true);
		expect(isToolBlockedResult('Tool call blocked by hook: No reason provided')).toBe(true);
	});

	it('returns false for a normal tool result', () => {
		expect(isToolBlockedResult('src/foo.ts\nsrc/bar.ts')).toBe(false);
	});

	it('returns false for a tool error result', () => {
		expect(isToolBlockedResult('Error: command not found')).toBe(false);
	});

	it('returns false for an empty result', () => {
		expect(isToolBlockedResult('')).toBe(false);
	});
});
