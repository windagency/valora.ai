import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SpendingRecord } from 'utils/spending-tracker';
import { SessionBudgetService } from './session-budget.service';

const makeRecord = (overrides: Partial<SpendingRecord> = {}): SpendingRecord => ({
	batchDiscounted: false,
	cacheReadCostUsd: 0,
	cacheReadTokens: 0,
	cacheSavingsUsd: 0,
	cacheWriteCostUsd: 0,
	cacheWriteTokens: 0,
	command: 'test',
	completionTokens: 100,
	costUsd: 0.01,
	durationMs: 500,
	id: 'r1',
	inputCostUsd: 0.005,
	model: 'claude-opus-4-7',
	outputCostUsd: 0.005,
	promptTokens: 500,
	sessionId: 'session-abc',
	stage: 'analyse',
	timestamp: new Date().toISOString(),
	totalTokens: 600,
	unknownModelPricing: false,
	...overrides
});

describe('SessionBudgetService', () => {
	let tracker: { getRecords: ReturnType<typeof vi.fn> };
	let service: SessionBudgetService;

	beforeEach(() => {
		tracker = { getRecords: vi.fn().mockReturnValue([]) };
		service = new SessionBudgetService(tracker as never, {
			per_session_usd: 1.0,
			per_command_usd: 0.5,
			per_stage_tokens: 10_000,
			policy: 'strict'
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('getSessionTotal', () => {
		it('returns zero when no records exist for session', () => {
			tracker.getRecords.mockReturnValue([]);
			const total = service.getSessionTotal('session-abc');
			expect(total.totalCostUsd).toBe(0);
			expect(total.totalTokens).toBe(0);
		});

		it('aggregates cost and tokens for the given session', () => {
			tracker.getRecords.mockReturnValue([
				makeRecord({ sessionId: 'session-abc', costUsd: 0.02, totalTokens: 800 }),
				makeRecord({ sessionId: 'session-abc', costUsd: 0.03, totalTokens: 600, id: 'r2' }),
				makeRecord({ sessionId: 'other-session', costUsd: 0.99, totalTokens: 9000, id: 'r3' })
			]);
			const total = service.getSessionTotal('session-abc');
			expect(total.totalCostUsd).toBeCloseTo(0.05);
			expect(total.totalTokens).toBe(1400);
		});

		it('ignores records from other sessions', () => {
			tracker.getRecords.mockReturnValue([makeRecord({ sessionId: 'other', costUsd: 0.5, totalTokens: 5000 })]);
			const total = service.getSessionTotal('session-abc');
			expect(total.totalCostUsd).toBe(0);
		});
	});

	describe('wouldExceed', () => {
		it('returns false when session is under budget', () => {
			tracker.getRecords.mockReturnValue([makeRecord({ costUsd: 0.1, totalTokens: 1000 })]);
			expect(service.wouldExceed('session-abc', { estimatedCostUsd: 0.1 })).toBe(false);
		});

		it('returns true when projected cost would exceed per_session_usd limit', () => {
			tracker.getRecords.mockReturnValue([makeRecord({ costUsd: 0.9, totalTokens: 1000 })]);
			expect(service.wouldExceed('session-abc', { estimatedCostUsd: 0.2 })).toBe(true);
		});

		it('returns true when projected tokens would exceed per_stage_tokens limit', () => {
			tracker.getRecords.mockReturnValue([]);
			expect(service.wouldExceed('session-abc', { estimatedTokens: 11_000 })).toBe(true);
		});

		it('returns false when stage token estimate is within limit', () => {
			tracker.getRecords.mockReturnValue([]);
			expect(service.wouldExceed('session-abc', { estimatedTokens: 5_000 })).toBe(false);
		});

		it('returns false when no limits configured', () => {
			const unbounded = new SessionBudgetService(tracker as never, undefined);
			expect(unbounded.wouldExceed('session-abc', { estimatedCostUsd: 999 })).toBe(false);
		});
	});

	describe('buildBudgetEscalationSignal', () => {
		it('returns an escalation signal with high risk and budget_exhausted criterion', () => {
			const signal = service.buildBudgetEscalationSignal(0.9, 1.0, 'stage-x');
			expect(signal.risk_level).toBe('high');
			expect(signal.requires_escalation).toBe(true);
			expect(signal.triggered_criteria).toContain('budget_exhausted');
			expect(signal.proposed_action).toContain('stage-x');
		});

		it('reports a synthetic (not model-reported) full-confidence value, since this is a deterministic system halt', () => {
			const signal = service.buildBudgetEscalationSignal(0.9, 1.0, 'stage-x');
			expect(signal.confidence).toBe(100);
			expect(signal.confidenceSource).toBe('defaulted');
		});
	});
});
