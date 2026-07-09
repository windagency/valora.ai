import { describe, expect, it, vi } from 'vitest';

import type { EscalationLedger, EscalationLedgerRecord } from './escalation-ledger';
import { ConfidenceCalibrationAnalytics } from './confidence-calibration-analytics';

const makeRecord = (overrides: Partial<EscalationLedgerRecord> = {}): EscalationLedgerRecord => ({
	confidence: 65,
	confidenceSource: 'reported',
	decision: 'proceed',
	riskLevel: 'medium',
	stage: 'plan.assess-risks',
	timestamp: '2026-01-01T00:00:00.000Z',
	triggeredCriteria: [],
	...overrides
});

function makeLedger(records: EscalationLedgerRecord[]): EscalationLedger {
	return { getRecords: vi.fn().mockReturnValue(records) } as unknown as EscalationLedger;
}

describe('ConfidenceCalibrationAnalytics', () => {
	describe('analyze', () => {
		it('buckets records by confidence range', () => {
			const ledger = makeLedger([
				makeRecord({ confidence: 30 }),
				makeRecord({ confidence: 55 }),
				makeRecord({ confidence: 74 }),
				makeRecord({ confidence: 85 }),
				makeRecord({ confidence: 95 })
			]);
			const analytics = new ConfidenceCalibrationAnalytics(ledger);

			const summary = analytics.analyze();
			const labels = summary.byConfidenceBucket.map((b) => b.label);
			expect(labels).toEqual(['<50', '50-69', '70-79', '80-89', '90-100']);
			expect(summary.byConfidenceBucket.map((b) => b.totalCount)).toEqual([1, 1, 1, 1, 1]);
		});

		it('breaks down decisions within each bucket — the direct evidence of overconfidence or underconfidence', () => {
			const ledger = makeLedger([
				makeRecord({ confidence: 92, decision: 'abort' }),
				makeRecord({ confidence: 95, decision: 'proceed' }),
				makeRecord({ confidence: 91, decision: 'proceed' })
			]);
			const analytics = new ConfidenceCalibrationAnalytics(ledger);

			const summary = analytics.analyze();
			const highBucket = summary.byConfidenceBucket.find((b) => b.label === '90-100');
			expect(highBucket).toMatchObject({ abortCount: 1, modifyCount: 0, proceedCount: 2, totalCount: 3 });
		});

		it('reports zero-count buckets rather than omitting them, so the shape is stable across reports', () => {
			const ledger = makeLedger([makeRecord({ confidence: 95 })]);
			const analytics = new ConfidenceCalibrationAnalytics(ledger);

			const summary = analytics.analyze();
			expect(summary.byConfidenceBucket).toHaveLength(5);
			expect(summary.byConfidenceBucket.find((b) => b.label === '<50')?.totalCount).toBe(0);
		});

		it('tallies triggered_criteria across records, showing which mechanism is doing the work', () => {
			const ledger = makeLedger([
				makeRecord({ triggeredCriteria: ['self_consistency_disagreement'] }),
				makeRecord({ triggeredCriteria: ['self_consistency_disagreement'] }),
				makeRecord({ triggeredCriteria: ['execution_telemetry_mismatch'] }),
				makeRecord({ triggeredCriteria: [] })
			]);
			const analytics = new ConfidenceCalibrationAnalytics(ledger);

			const summary = analytics.analyze();
			const byCriterion = new Map(summary.byTriggeredCriterion.map((c) => [c.criterion, c.count]));
			expect(byCriterion.get('self_consistency_disagreement')).toBe(2);
			expect(byCriterion.get('execution_telemetry_mismatch')).toBe(1);
			expect(byCriterion.get('(none — plain confidence/risk threshold)')).toBe(1);
		});

		it('reports the total escalation count and period bounds', () => {
			const ledger = makeLedger([
				makeRecord({ timestamp: '2026-01-01T00:00:00.000Z' }),
				makeRecord({ timestamp: '2026-01-05T00:00:00.000Z' })
			]);
			const analytics = new ConfidenceCalibrationAnalytics(ledger);

			const summary = analytics.analyze();
			expect(summary.totalEscalations).toBe(2);
			expect(summary.period.from).toBe('2026-01-01T00:00:00.000Z');
			expect(summary.period.to).toBe('2026-01-05T00:00:00.000Z');
		});

		it('handles an empty ledger without throwing', () => {
			const analytics = new ConfidenceCalibrationAnalytics(makeLedger([]));
			expect(() => analytics.analyze()).not.toThrow();
			expect(analytics.analyze().totalEscalations).toBe(0);
		});
	});

	describe('report generation', () => {
		it('generateJsonReport produces valid, parseable JSON matching analyze()', () => {
			const ledger = makeLedger([makeRecord()]);
			const analytics = new ConfidenceCalibrationAnalytics(ledger);

			const json = JSON.parse(analytics.generateJsonReport()) as { totalEscalations: number };
			expect(json.totalEscalations).toBe(1);
		});

		it('generateMarkdownReport includes a title and the bucket table', () => {
			const ledger = makeLedger([makeRecord({ confidence: 82 })]);
			const analytics = new ConfidenceCalibrationAnalytics(ledger);

			const markdown = analytics.generateMarkdownReport();
			expect(markdown).toContain('# Confidence Calibration Report');
			expect(markdown).toContain('80-89');
		});
	});
});
