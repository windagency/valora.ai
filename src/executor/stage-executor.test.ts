import { describe, expect, it } from 'vitest';
import type { LLMMessage } from 'types/llm.types';
import { compressMessageHistory, DEFAULT_FAILURE_POLICY, djb2 } from './stage-executor';

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

	it('handles empty string without throwing', () => {
		expect(() => djb2('')).not.toThrow();
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
