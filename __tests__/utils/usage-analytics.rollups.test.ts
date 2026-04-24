import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { UsageAnalytics } from 'utils/usage-analytics';
import { SpendingRecord, SpendingTracker } from 'utils/spending-tracker';

function record(overrides: Partial<SpendingRecord>): SpendingRecord {
	return {
		activity: 'Other',
		agent: 'lead',
		batchDiscounted: false,
		cacheReadCostUsd: 0,
		cacheReadTokens: 0,
		cacheSavingsUsd: 0,
		cacheWriteCostUsd: 0,
		cacheWriteTokens: 0,
		command: 'plan',
		completionTokens: 100,
		costUsd: 0.01,
		durationMs: 500,
		id: `id-${Math.random()}`,
		inputCostUsd: 0.01,
		iterations: 1,
		model: 'claude-sonnet',
		outputCostUsd: 0,
		plugin: 'valora-core-engineering',
		projectPath: '/projects/alpha',
		promptTokens: 500,
		sessionId: 'sess-A',
		stage: 'plan',
		success: true,
		timestamp: '2026-04-20T10:00:00.000Z',
		totalTokens: 600,
		unknownModelPricing: false,
		...overrides
	};
}

describe('UsageAnalytics rollups', () => {
	let tmpDir: string;
	let tracker: SpendingTracker;
	let analytics: UsageAnalytics;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), 'valora-analytics-test-'));
		tracker = new SpendingTracker(tmpDir);
		analytics = new UsageAnalytics(tracker);
	});

	afterEach(() => {
		rmSync(tmpDir, { force: true, recursive: true });
	});

	describe('bySession', () => {
		it('produces a top-5 ranking of sessions by total cost when spending records span multiple sessions', () => {
			tracker.record(record({ sessionId: 'sess-A', costUsd: 0.05, command: 'plan' }));
			tracker.record(record({ sessionId: 'sess-A', costUsd: 0.03, command: 'review-code' }));
			tracker.record(record({ sessionId: 'sess-B', costUsd: 0.1, command: 'test' }));
			tracker.record(record({ sessionId: 'sess-C', costUsd: 0.01, command: 'commit' }));

			const summary = analytics.analyze();
			const sessions = summary.bySession;

			expect(sessions).toHaveLength(3);
			expect(sessions[0]!.sessionId).toBe('sess-B');
			expect(sessions[0]!.totalCostUsd).toBeCloseTo(0.1);
			expect(sessions[1]!.sessionId).toBe('sess-A');
			expect(sessions[1]!.totalCostUsd).toBeCloseTo(0.08);
			expect(sessions[1]!.requestCount).toBe(2);
		});

		it('groups records without a sessionId into an "(unknown)" bucket', () => {
			tracker.record(record({ sessionId: undefined, costUsd: 0.02 }));
			const summary = analytics.analyze();
			expect(summary.bySession[0]!.sessionId).toBe('(unknown)');
		});

		it('reports the earliest and latest timestamps for each session', () => {
			tracker.record(record({ sessionId: 'sess-A', timestamp: '2026-04-20T08:00:00.000Z', costUsd: 0.01 }));
			tracker.record(record({ sessionId: 'sess-A', timestamp: '2026-04-20T12:00:00.000Z', costUsd: 0.01 }));

			const [sess] = analytics.analyze().bySession;
			expect(sess!.from).toBe('2026-04-20T08:00:00.000Z');
			expect(sess!.to).toBe('2026-04-20T12:00:00.000Z');
		});
	});

	describe('byActivity', () => {
		it('groups records by activity and counts requests per activity', () => {
			tracker.record(record({ activity: 'Coding', command: 'plan', costUsd: 0.05 }));
			tracker.record(record({ activity: 'Coding', command: 'review-code', costUsd: 0.03 }));
			tracker.record(record({ activity: 'Testing', command: 'test', costUsd: 0.02 }));

			const summary = analytics.analyze();
			const coding = summary.byActivity.find((a) => a.activity === 'Coding');
			const testing = summary.byActivity.find((a) => a.activity === 'Testing');

			expect(coding).toBeDefined();
			expect(coding!.requestCount).toBe(2);
			expect(coding!.totalCostUsd).toBeCloseTo(0.08);
			expect(testing!.requestCount).toBe(1);
		});

		it('computes one-shot success rate as the fraction of records where iterations equals 1', () => {
			tracker.record(record({ activity: 'Coding', iterations: 1, success: true }));
			tracker.record(record({ activity: 'Coding', iterations: 1, success: true }));
			tracker.record(record({ activity: 'Coding', iterations: 3, success: true }));

			const [coding] = analytics.analyze().byActivity;
			expect(coding!.oneShotRate).toBeCloseTo(2 / 3);
		});

		it('reports oneShotRate as null when no records have iterations defined', () => {
			tracker.record(record({ activity: 'Review', iterations: undefined }));
			const [review] = analytics.analyze().byActivity;
			expect(review!.oneShotRate).toBeNull();
		});

		it('computes avgIterations across records that have iterations defined', () => {
			tracker.record(record({ activity: 'Testing', iterations: 1 }));
			tracker.record(record({ activity: 'Testing', iterations: 3 }));
			const [testing] = analytics.analyze().byActivity;
			expect(testing!.avgIterations).toBeCloseTo(2);
		});
	});

	describe('byProject', () => {
		it('groups spending records by projectPath', () => {
			tracker.record(record({ projectPath: '/projects/alpha', costUsd: 0.05 }));
			tracker.record(record({ projectPath: '/projects/alpha', costUsd: 0.03 }));
			tracker.record(record({ projectPath: '/projects/beta', costUsd: 0.02 }));

			const summary = analytics.analyze();
			const alpha = summary.byProject.find((p) => p.projectPath === '/projects/alpha');
			const beta = summary.byProject.find((p) => p.projectPath === '/projects/beta');

			expect(alpha!.requestCount).toBe(2);
			expect(alpha!.totalCostUsd).toBeCloseTo(0.08);
			expect(beta!.requestCount).toBe(1);
		});

		it('groups records without a projectPath into an "(unknown)" bucket', () => {
			tracker.record(record({ projectPath: undefined, costUsd: 0.01 }));
			expect(analytics.analyze().byProject[0]!.projectPath).toBe('(unknown)');
		});
	});

	describe('cacheHitRatio', () => {
		it('returns the fraction of input tokens served from cache', () => {
			tracker.record(record({ promptTokens: 900, cacheReadTokens: 100, totalTokens: 1000 }));
			const summary = analytics.analyze();
			expect(summary.cacheHitRatio).toBeCloseTo(100 / (900 + 100));
		});

		it('returns 0 when there are no cache read tokens', () => {
			tracker.record(record({ promptTokens: 500, cacheReadTokens: 0 }));
			expect(analytics.analyze().cacheHitRatio).toBe(0);
		});

		it('returns 0 when there are no records', () => {
			expect(analytics.analyze().cacheHitRatio).toBe(0);
		});
	});

	describe('sessionsCount', () => {
		it('returns the number of distinct session ids across all records', () => {
			tracker.record(record({ sessionId: 'sess-A' }));
			tracker.record(record({ sessionId: 'sess-A' }));
			tracker.record(record({ sessionId: 'sess-B' }));
			expect(analytics.analyze().sessionsCount).toBe(2);
		});

		it('counts records without a sessionId as one extra bucket', () => {
			tracker.record(record({ sessionId: undefined }));
			tracker.record(record({ sessionId: 'sess-A' }));
			expect(analytics.analyze().sessionsCount).toBe(2);
		});
	});

	describe('byAgent', () => {
		it('groups spending records by agent name', () => {
			tracker.record(record({ agent: 'lead', costUsd: 0.05 }));
			tracker.record(record({ agent: 'lead', costUsd: 0.03 }));
			tracker.record(record({ agent: 'qa', costUsd: 0.02 }));

			const summary = analytics.analyze();
			const lead = summary.byAgent.find((a) => a.agent === 'lead');
			expect(lead!.requestCount).toBe(2);
			expect(lead!.totalCostUsd).toBeCloseTo(0.08);
		});
	});

	describe('filter options', () => {
		it('filters byActivity results when activity option is specified', () => {
			tracker.record(record({ activity: 'Coding' }));
			tracker.record(record({ activity: 'Testing' }));

			const summary = analytics.analyze({ activity: 'Coding' });
			expect(summary.byActivity).toHaveLength(1);
			expect(summary.byActivity[0]!.activity).toBe('Coding');
		});

		it('filters bySession results when session option is specified', () => {
			tracker.record(record({ sessionId: 'sess-A', costUsd: 0.05 }));
			tracker.record(record({ sessionId: 'sess-B', costUsd: 0.03 }));

			const summary = analytics.analyze({ session: 'sess-A' });
			expect(summary.bySession).toHaveLength(1);
			expect(summary.bySession[0]!.sessionId).toBe('sess-A');
		});

		it('filters byProject results when project option is specified', () => {
			tracker.record(record({ projectPath: '/projects/alpha' }));
			tracker.record(record({ projectPath: '/projects/beta' }));

			const summary = analytics.analyze({ project: '/projects/alpha' });
			expect(summary.byProject).toHaveLength(1);
			expect(summary.byProject[0]!.projectPath).toBe('/projects/alpha');
		});
	});
});
