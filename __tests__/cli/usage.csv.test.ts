import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { UsageAnalytics } from 'utils/usage-analytics';
import { SpendingRecord, SpendingTracker } from 'utils/spending-tracker';

function record(overrides: Partial<SpendingRecord> = {}): SpendingRecord {
	return {
		activity: 'Coding',
		agent: 'lead',
		batchDiscounted: false,
		cacheReadCostUsd: 0.0001,
		cacheReadTokens: 50,
		cacheSavingsUsd: 0.001,
		cacheWriteCostUsd: 0,
		cacheWriteTokens: 0,
		command: 'plan',
		completionTokens: 100,
		costUsd: 0.01,
		durationMs: 500,
		id: 'test-id',
		inputCostUsd: 0.009,
		iterations: 1,
		model: 'claude-sonnet',
		outputCostUsd: 0.001,
		plugin: 'valora-core-engineering',
		projectPath: '/projects/my-app',
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

describe('UsageAnalytics CSV generation', () => {
	let tmpDir: string;
	let tracker: SpendingTracker;
	let analytics: UsageAnalytics;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), 'valora-csv-test-'));
		tracker = new SpendingTracker(tmpDir);
		analytics = new UsageAnalytics(tracker);
	});

	afterEach(() => {
		rmSync(tmpDir, { force: true, recursive: true });
	});

	function parseRows(csv: string): string[][] {
		return csv
			.trim()
			.split('\n')
			.map((line) =>
				line.split(',').map((cell) => {
					const trimmed = cell.trim();
					return trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1) : trimmed;
				})
			);
	}

	it('emits a header row for the byModel section followed by one data row per model', () => {
		tracker.record(record({ model: 'claude-sonnet', costUsd: 0.01 }));
		tracker.record(record({ model: 'claude-opus', costUsd: 0.05 }));

		const csv = analytics.generateCsvReport({ section: 'byModel' });
		const rows = parseRows(csv);

		expect(rows[0]).toContain('model');
		expect(rows[0]).toContain('requestCount');
		expect(rows[0]).toContain('totalCostUsd');
		expect(rows).toHaveLength(3); // header + 2 model rows
	});

	it('emits a header row for the byCommand section with avgCostPerRequest column', () => {
		tracker.record(record({ command: 'plan' }));
		tracker.record(record({ command: 'review-code' }));

		const csv = analytics.generateCsvReport({ section: 'byCommand' });
		const rows = parseRows(csv);

		expect(rows[0]).toContain('command');
		expect(rows[0]).toContain('avgCostPerRequest');
		expect(rows).toHaveLength(3);
	});

	it('emits a header row for the bySession section', () => {
		tracker.record(record({ sessionId: 'sess-A' }));
		tracker.record(record({ sessionId: 'sess-B' }));

		const csv = analytics.generateCsvReport({ section: 'bySession' });
		const rows = parseRows(csv);

		expect(rows[0]).toContain('sessionId');
		expect(rows[0]).toContain('totalCostUsd');
		expect(rows).toHaveLength(3);
	});

	it('emits a header row for the byActivity section including oneShotRate column', () => {
		tracker.record(record({ activity: 'Coding' }));

		const csv = analytics.generateCsvReport({ section: 'byActivity' });
		const rows = parseRows(csv);

		expect(rows[0]).toContain('activity');
		expect(rows[0]).toContain('oneShotRate');
		expect(rows).toHaveLength(2);
	});

	it('emits a header row for the byProject section', () => {
		tracker.record(record({ projectPath: '/projects/my-app' }));

		const csv = analytics.generateCsvReport({ section: 'byProject' });
		const rows = parseRows(csv);

		expect(rows[0]).toContain('projectPath');
		expect(rows).toHaveLength(2);
	});

	it('emits a header row for the daily section', () => {
		tracker.record(record());

		const csv = analytics.generateCsvReport({ section: 'daily' });
		const rows = parseRows(csv);

		expect(rows[0]).toContain('date');
		expect(rows[0]).toContain('totalCostUsd');
		expect(rows).toHaveLength(2);
	});

	it('quotes cell values that contain a comma', () => {
		tracker.record(record({ projectPath: '/projects/alpha,beta' }));

		const csv = analytics.generateCsvReport({ section: 'byProject' });
		expect(csv).toContain('"');
	});

	it('returns an empty header line with no data rows when no records exist', () => {
		const csv = analytics.generateCsvReport({ section: 'byModel' });
		const rows = parseRows(csv);
		expect(rows).toHaveLength(1); // header only
	});
});
