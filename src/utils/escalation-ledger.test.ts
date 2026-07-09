import { appendFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { EscalationLedgerRecord } from './escalation-ledger';
import { EscalationLedger } from './escalation-ledger';

const makeRecord = (overrides: Partial<EscalationLedgerRecord> = {}): EscalationLedgerRecord => ({
	confidence: 65,
	confidenceSource: 'reported',
	riskLevel: 'medium',
	stage: 'plan.assess-risks',
	timestamp: new Date().toISOString(),
	triggeredCriteria: [],
	...overrides
});

describe('EscalationLedger', () => {
	let dataDir: string;
	let ledger: EscalationLedger;

	beforeEach(() => {
		dataDir = mkdtempSync(join(tmpdir(), 'escalation-ledger-test-'));
		ledger = new EscalationLedger(dataDir);
	});

	afterEach(() => {
		rmSync(dataDir, { force: true, recursive: true });
	});

	describe('getRecords', () => {
		it('returns an empty array when no ledger file exists yet', () => {
			expect(ledger.getRecords()).toEqual([]);
		});
	});

	describe('record + getRecords round trip', () => {
		it('persists a record and reads it back with the same fields', () => {
			ledger.record(makeRecord({ confidence: 82, stage: 'review.review-plan' }));

			const records = ledger.getRecords();
			expect(records).toHaveLength(1);
			expect(records[0]).toMatchObject({ confidence: 82, stage: 'review.review-plan' });
		});

		it('appends multiple records across separate calls, in order', () => {
			ledger.record(makeRecord({ stage: 'stage-1' }));
			ledger.record(makeRecord({ stage: 'stage-2' }));
			ledger.record(makeRecord({ stage: 'stage-3' }));

			const records = ledger.getRecords();
			expect(records.map((r) => r.stage)).toEqual(['stage-1', 'stage-2', 'stage-3']);
		});

		it('never throws even if the underlying write fails', () => {
			const brokenLedger = new EscalationLedger('/nonexistent/path/that/cannot/be/created\0');
			expect(() => brokenLedger.record(makeRecord())).not.toThrow();
		});
	});

	describe('filtering', () => {
		it('filters by stage', () => {
			ledger.record(makeRecord({ stage: 'plan.assess-risks' }));
			ledger.record(makeRecord({ stage: 'review.review-plan' }));

			const records = ledger.getRecords({ stage: 'plan.assess-risks' });
			expect(records).toHaveLength(1);
			expect(records[0]?.stage).toBe('plan.assess-risks');
		});

		it('filters by since', () => {
			ledger.record(makeRecord({ timestamp: '2020-01-01T00:00:00.000Z' }));
			ledger.record(makeRecord({ timestamp: '2030-01-01T00:00:00.000Z' }));

			const records = ledger.getRecords({ since: '2025-01-01T00:00:00.000Z' });
			expect(records).toHaveLength(1);
			expect(records[0]?.timestamp).toBe('2030-01-01T00:00:00.000Z');
		});
	});

	describe('resilience to a corrupted ledger file', () => {
		it('skips an unparseable line without losing the good records around it', () => {
			ledger.record(makeRecord({ stage: 'good-record-1' }));
			appendFileSync(join(dataDir, 'escalations.jsonl'), 'not valid json\n', 'utf8');
			ledger.record(makeRecord({ stage: 'good-record-2' }));

			const records = ledger.getRecords();
			expect(records.map((r) => r.stage)).toEqual(['good-record-1', 'good-record-2']);
		});
	});
});
