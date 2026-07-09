/**
 * Confidence Calibration Analytics - empirical evidence for "is confidence trustworthy?"
 *
 * Wraps EscalationLedger (mirroring how UsageAnalytics wraps SpendingTracker) to answer
 * with data, not assumption: within each confidence bucket, what fraction of escalations
 * were aborted/modified vs. proceeded? A well-calibrated system should show aborts/modifies
 * concentrated in low buckets — if a high-confidence bucket shows a meaningful abort rate,
 * that's measured evidence of overconfidence.
 */

import {
	type EscalationLedger,
	type EscalationLedgerRecord,
	getEscalationLedger,
	type GetEscalationRecordsOptions
} from './escalation-ledger';

export interface ConfidenceBucketSummary {
	abortCount: number;
	label: string;
	modifyCount: number;
	proceedCount: number;
	totalCount: number;
}

export interface ConfidenceCalibrationOptions {
	sinceDate?: string;
	stage?: string;
}

export interface ConfidenceCalibrationPeriod {
	from: null | string;
	to: null | string;
}

export interface ConfidenceCalibrationSummary {
	byConfidenceBucket: ConfidenceBucketSummary[];
	byTriggeredCriterion: TriggeredCriterionSummary[];
	period: ConfidenceCalibrationPeriod;
	totalEscalations: number;
}

export interface TriggeredCriterionSummary {
	count: number;
	criterion: string;
}

const NO_CRITERION_LABEL = '(none — plain confidence/risk threshold)';

const BUCKETS: Array<{ label: string; max: number; min: number }> = [
	{ label: '<50', max: 50, min: -Infinity },
	{ label: '50-69', max: 70, min: 50 },
	{ label: '70-79', max: 80, min: 70 },
	{ label: '80-89', max: 90, min: 80 },
	{ label: '90-100', max: Infinity, min: 90 }
];

export class ConfidenceCalibrationAnalytics {
	constructor(private readonly ledger: EscalationLedger) {}

	analyze(options?: ConfidenceCalibrationOptions): ConfidenceCalibrationSummary {
		const records = this.ledger.getRecords(toRecordsOptions(options));

		return {
			byConfidenceBucket: this.bucketByConfidence(records),
			byTriggeredCriterion: this.tallyTriggeredCriteria(records),
			period: this.computePeriod(records),
			totalEscalations: records.length
		};
	}

	generateJsonReport(options?: ConfidenceCalibrationOptions): string {
		return JSON.stringify(this.analyze(options), null, 2);
	}

	generateMarkdownReport(options?: ConfidenceCalibrationOptions): string {
		const summary = this.analyze(options);
		const lines: string[] = [];

		lines.push('# Confidence Calibration Report');
		lines.push('');
		lines.push(`Period: ${summary.period.from ?? 'n/a'} → ${summary.period.to ?? 'n/a'}`);
		lines.push(`Total escalations: ${summary.totalEscalations}`);
		lines.push('');

		lines.push('## By confidence bucket');
		lines.push('');
		lines.push('| Bucket | Total | Aborted | Modified | Proceeded |');
		lines.push('| --- | --- | --- | --- | --- |');
		for (const bucket of summary.byConfidenceBucket) {
			lines.push(
				`| ${bucket.label} | ${bucket.totalCount} | ${bucket.abortCount} | ${bucket.modifyCount} | ${bucket.proceedCount} |`
			);
		}
		lines.push('');

		lines.push('## By triggered criterion');
		lines.push('');
		lines.push('| Criterion | Count |');
		lines.push('| --- | --- |');
		for (const c of summary.byTriggeredCriterion) {
			lines.push(`| ${c.criterion} | ${c.count} |`);
		}
		lines.push('');

		return lines.join('\n');
	}

	private bucketByConfidence(records: EscalationLedgerRecord[]): ConfidenceBucketSummary[] {
		const byLabel = new Map<string, ConfidenceBucketSummary>(
			BUCKETS.map((b) => [b.label, { abortCount: 0, label: b.label, modifyCount: 0, proceedCount: 0, totalCount: 0 }])
		);

		for (const record of records) {
			const bucket = byLabel.get(bucketFor(record.confidence));
			if (!bucket) continue;
			bucket.totalCount++;
			if (record.decision === 'abort') bucket.abortCount++;
			else if (record.decision === 'modify') bucket.modifyCount++;
			else if (record.decision === 'proceed') bucket.proceedCount++;
		}

		return BUCKETS.map((b) => byLabel.get(b.label)!);
	}

	private computePeriod(records: EscalationLedgerRecord[]): ConfidenceCalibrationPeriod {
		if (records.length === 0) {
			return { from: null, to: null };
		}
		const timestamps = records.map((r) => r.timestamp).sort();
		return { from: timestamps[0]!, to: timestamps[timestamps.length - 1]! };
	}

	private tallyTriggeredCriteria(records: EscalationLedgerRecord[]): TriggeredCriterionSummary[] {
		const counts = new Map<string, number>();

		for (const record of records) {
			const criteria = record.triggeredCriteria.length > 0 ? record.triggeredCriteria : [NO_CRITERION_LABEL];
			for (const criterion of criteria) {
				counts.set(criterion, (counts.get(criterion) ?? 0) + 1);
			}
		}

		return Array.from(counts.entries())
			.map(([criterion, count]) => ({ count, criterion }))
			.sort((a, b) => b.count - a.count);
	}
}

function bucketFor(confidence: number): string {
	const bucket = BUCKETS.find((b) => confidence >= b.min && confidence < b.max);
	return bucket?.label ?? BUCKETS[BUCKETS.length - 1]!.label;
}

function toRecordsOptions(options?: ConfidenceCalibrationOptions): GetEscalationRecordsOptions {
	return { since: options?.sinceDate, stage: options?.stage };
}

let instance: ConfidenceCalibrationAnalytics | null = null;

export function getConfidenceCalibrationAnalytics(): ConfidenceCalibrationAnalytics {
	instance ??= new ConfidenceCalibrationAnalytics(getEscalationLedger());
	return instance;
}

export function resetConfidenceCalibrationAnalytics(): void {
	instance = null;
}
