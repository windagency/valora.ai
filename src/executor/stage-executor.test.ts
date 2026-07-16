import { describe, expect, it } from 'vitest';
import type { LLMMessage, LLMUsage } from 'types/llm.types';
import {
	accumulateLLMUsage,
	buildDedupKey,
	compressMessageHistory,
	DEFAULT_FAILURE_POLICY,
	djb2,
	estimateStageCallCostUsd,
	isToolBlockedResult,
	isToolLoopSpinning,
	resolveModelOverride
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

// ── resolveModelOverride ──────────────────────────────────────────────────────

// ── estimateStageCallCostUsd ──────────────────────────────────────────────────

describe('estimateStageCallCostUsd', () => {
	it("returns a non-zero estimate for a non-trivial prompt — the budget circuit-breaker must predict the imminent call's cost, not just detect spend already exceeded from prior calls", () => {
		const cost = estimateStageCallCostUsd('a'.repeat(4000), 'b'.repeat(4000), 'unknown-model');
		expect(cost).toBeGreaterThan(0);
	});

	it('scales with prompt length', () => {
		const small = estimateStageCallCostUsd('short', 'short', 'unknown-model');
		const large = estimateStageCallCostUsd('a'.repeat(40_000), 'b'.repeat(40_000), 'unknown-model');
		expect(large).toBeGreaterThan(small);
	});
});

describe('resolveModelOverride', () => {
	it('returns the stage model when set, ignoring the flag model', () => {
		expect(resolveModelOverride('claude-haiku-4-5-20251001', 'claude-sonnet-4-6')).toBe('claude-haiku-4-5-20251001');
	});

	it('falls back to the flag model when stage model is absent', () => {
		expect(resolveModelOverride(undefined, 'claude-sonnet-4-6')).toBe('claude-sonnet-4-6');
	});

	it('returns undefined when both stage model and flag model are absent', () => {
		expect(resolveModelOverride(undefined, undefined)).toBeUndefined();
	});
});

// ── accumulateLLMUsage ────────────────────────────────────────────────────────

describe('accumulateLLMUsage', () => {
	function usage(overrides: Partial<LLMUsage> = {}): LLMUsage {
		return { completion_tokens: 0, prompt_tokens: 0, total_tokens: 0, ...overrides };
	}

	it('sums all three token counts', () => {
		const a = usage({ completion_tokens: 10, prompt_tokens: 100, total_tokens: 110 });
		const b = usage({ completion_tokens: 20, prompt_tokens: 200, total_tokens: 220 });
		const result = accumulateLLMUsage(a, b);
		expect(result.completion_tokens).toBe(30);
		expect(result.prompt_tokens).toBe(300);
		expect(result.total_tokens).toBe(330);
	});

	it('sums cache_creation_input_tokens when both sides are present', () => {
		const a = usage({ cache_creation_input_tokens: 50 });
		const b = usage({ cache_creation_input_tokens: 75 });
		expect(accumulateLLMUsage(a, b).cache_creation_input_tokens).toBe(125);
	});

	it('sums cache_read_input_tokens when both sides are present', () => {
		const a = usage({ cache_read_input_tokens: 30 });
		const b = usage({ cache_read_input_tokens: 40 });
		expect(accumulateLLMUsage(a, b).cache_read_input_tokens).toBe(70);
	});

	it('returns undefined for cache tokens when both sides are absent', () => {
		const result = accumulateLLMUsage(usage(), usage());
		expect(result.cache_creation_input_tokens).toBeUndefined();
		expect(result.cache_read_input_tokens).toBeUndefined();
	});

	it('carries batch_discount_applied from the second argument', () => {
		const a = usage({ batch_discount_applied: false });
		const b = usage({ batch_discount_applied: true });
		expect(accumulateLLMUsage(a, b).batch_discount_applied).toBe(true);
	});

	it('handles one side missing cache tokens by treating the absent side as zero', () => {
		const a = usage({ cache_creation_input_tokens: 100 });
		const b = usage(); // no cache_creation_input_tokens
		expect(accumulateLLMUsage(a, b).cache_creation_input_tokens).toBe(100);
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
