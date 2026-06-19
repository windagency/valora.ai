import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SpendingRecord, SpendingTracker } from 'utils/spending-tracker';

function minimalRecord(overrides: Partial<SpendingRecord> = {}): SpendingRecord {
	return {
		batchDiscounted: false,
		cacheReadCostUsd: 0,
		cacheReadTokens: 0,
		cacheSavingsUsd: 0,
		cacheWriteCostUsd: 0,
		cacheWriteTokens: 0,
		command: 'plan',
		completionTokens: 100,
		costUsd: 0.001,
		durationMs: 500,
		id: 'test-id',
		inputCostUsd: 0.001,
		model: 'claude-3-5-sonnet-20241022',
		outputCostUsd: 0,
		promptTokens: 500,
		stage: 'analyse+generate',
		timestamp: new Date().toISOString(),
		totalTokens: 600,
		unknownModelPricing: false,
		...overrides
	};
}

describe('SpendingTracker enrichment fields', () => {
	let tmpDir: string;
	let tracker: SpendingTracker;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), 'valora-spending-test-'));
		tracker = new SpendingTracker(tmpDir);
	});

	afterEach(() => {
		rmSync(tmpDir, { force: true, recursive: true });
	});

	it('persists and round-trips sessionId when provided', () => {
		tracker.record(minimalRecord({ sessionId: 'sess-abc-123' }));
		const records = tracker.getRecords();
		expect(records).toHaveLength(1);
		expect(records[0]!.sessionId).toBe('sess-abc-123');
	});

	it('persists and round-trips agent when provided', () => {
		tracker.record(minimalRecord({ agent: 'lead' }));
		expect(tracker.getRecords()[0]!.agent).toBe('lead');
	});

	it('persists and round-trips plugin when provided', () => {
		tracker.record(minimalRecord({ plugin: 'valora-plugin-engineering' }));
		expect(tracker.getRecords()[0]!.plugin).toBe('valora-plugin-engineering');
	});

	it('persists and round-trips activity when provided', () => {
		tracker.record(minimalRecord({ activity: 'Coding' }));
		expect(tracker.getRecords()[0]!.activity).toBe('Coding');
	});

	it('persists and round-trips projectPath when provided', () => {
		tracker.record(minimalRecord({ projectPath: '/workspaces/valora' }));
		expect(tracker.getRecords()[0]!.projectPath).toBe('/workspaces/valora');
	});

	it('persists and round-trips success flag when provided', () => {
		tracker.record(minimalRecord({ success: true }));
		expect(tracker.getRecords()[0]!.success).toBe(true);
	});

	it('persists and round-trips iterations count when provided', () => {
		tracker.record(minimalRecord({ iterations: 3 }));
		expect(tracker.getRecords()[0]!.iterations).toBe(3);
	});

	it('leaves all enrichment fields absent when not provided, and the record remains readable', () => {
		tracker.record(minimalRecord());
		const [rec] = tracker.getRecords();
		expect(rec!.sessionId).toBeUndefined();
		expect(rec!.agent).toBeUndefined();
		expect(rec!.plugin).toBeUndefined();
		expect(rec!.activity).toBeUndefined();
		expect(rec!.projectPath).toBeUndefined();
		expect(rec!.success).toBeUndefined();
		expect(rec!.iterations).toBeUndefined();
	});

	it('reads legacy JSONL records that predate the enrichment fields without error', () => {
		const legacyLine = JSON.stringify({
			batchDiscounted: false,
			cacheReadCostUsd: 0,
			cacheReadTokens: 0,
			cacheSavingsUsd: 0,
			cacheWriteCostUsd: 0,
			cacheWriteTokens: 0,
			command: 'review-code',
			completionTokens: 200,
			costUsd: 0.002,
			durationMs: 800,
			id: 'legacy-id',
			inputCostUsd: 0.002,
			model: 'claude-3-opus-20240229',
			outputCostUsd: 0,
			promptTokens: 1000,
			stage: 'review',
			timestamp: '2024-01-15T10:00:00.000Z',
			totalTokens: 1200,
			unknownModelPricing: false
		});
		writeFileSync(join(tmpDir, 'spending.jsonl'), legacyLine + '\n', 'utf-8');

		const records = tracker.getRecords();
		expect(records).toHaveLength(1);
		expect(records[0]!.command).toBe('review-code');
		expect(records[0]!.sessionId).toBeUndefined();
		expect(records[0]!.activity).toBeUndefined();
	});
});
