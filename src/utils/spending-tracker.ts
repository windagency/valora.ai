/**
 * Spending Tracker - Persistent per-request cost ledger
 *
 * Appends each request's cost data to .valora/spending.jsonl
 * (one JSON record per line for easy streaming and appending).
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { getRuntimeDataDir } from 'utils/paths';

export interface EndpointSummary {
	avgCostUsd: number;
	cacheSavingsUsd: number;
	command: string;
	requestCount: number;
	totalCostUsd: number;
	totalTokens: number;
}

export interface GetRecordsOptions {
	command?: string;
	since?: string;
}

export interface SpendingRecord {
	batchDiscounted: boolean;
	cacheReadTokens: number;
	cacheSavingsUsd: number;
	cacheWriteTokens: number;
	command: string;
	completionTokens: number;
	costUsd: number;
	durationMs: number;
	id: string;
	model: string;
	promptTokens: number;
	stage: string;
	timestamp: string;
	totalTokens: number;
}

export interface SpendingTotals {
	cacheSavingsUsd: number;
	requestCount: number;
	totalCostUsd: number;
	totalTokens: number;
}

const getSpendingFile = (): string => join(getRuntimeDataDir(), 'spending.jsonl');

export class SpendingTracker {
	/**
	 * Append a spending record to the JSONL file
	 */
	record(r: SpendingRecord): void {
		try {
			ensureDir();
			appendFileSync(getSpendingFile(), JSON.stringify(r) + '\n', 'utf8');
		} catch {
			// Non-fatal: spending tracking should not break the main flow
		}
	}

	/**
	 * Read all records, optionally filtered by command and/or date
	 */
	getRecords(opts?: GetRecordsOptions): SpendingRecord[] {
		const file = getSpendingFile();
		if (!existsSync(file)) return [];

		try {
			const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
			let records = lines.map((line) => JSON.parse(line) as SpendingRecord);

			if (opts?.command) {
				records = records.filter((r) => r.command === opts.command);
			}
			if (opts?.since) {
				const since = new Date(opts.since).getTime();
				records = records.filter((r) => new Date(r.timestamp).getTime() >= since);
			}

			return records;
		} catch {
			return [];
		}
	}

	/**
	 * Group records by command (endpoint), sorted by total cost descending
	 */
	getByEndpoint(opts?: GetRecordsOptions): EndpointSummary[] {
		const records = this.getRecords(opts);
		const byCommand = new Map<string, EndpointSummary>();

		for (const r of records) {
			const existing = byCommand.get(r.command);
			if (existing) {
				existing.totalCostUsd += r.costUsd;
				existing.totalTokens += r.totalTokens;
				existing.requestCount += 1;
				existing.cacheSavingsUsd += r.cacheSavingsUsd;
				existing.avgCostUsd = existing.totalCostUsd / existing.requestCount;
			} else {
				byCommand.set(r.command, {
					avgCostUsd: r.costUsd,
					cacheSavingsUsd: r.cacheSavingsUsd,
					command: r.command,
					requestCount: 1,
					totalCostUsd: r.costUsd,
					totalTokens: r.totalTokens
				});
			}
		}

		return Array.from(byCommand.values()).sort((a, b) => b.totalCostUsd - a.totalCostUsd);
	}

	/**
	 * Return the top N most expensive records
	 */
	getExpensive(limit: number, opts?: GetRecordsOptions): SpendingRecord[] {
		return this.getRecords(opts)
			.sort((a, b) => b.costUsd - a.costUsd)
			.slice(0, limit);
	}

	/**
	 * Return aggregate totals across all (optionally filtered) records
	 */
	getTotals(opts?: GetRecordsOptions): SpendingTotals {
		const records = this.getRecords(opts);
		return records.reduce(
			(acc, r) => ({
				cacheSavingsUsd: acc.cacheSavingsUsd + r.cacheSavingsUsd,
				requestCount: acc.requestCount + 1,
				totalCostUsd: acc.totalCostUsd + r.costUsd,
				totalTokens: acc.totalTokens + r.totalTokens
			}),
			{ cacheSavingsUsd: 0, requestCount: 0, totalCostUsd: 0, totalTokens: 0 }
		);
	}
}

function ensureDir(): void {
	const dir = getRuntimeDataDir();
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
}

let instance: null | SpendingTracker = null;

export function getSpendingTracker(): SpendingTracker {
	instance ??= new SpendingTracker();
	return instance;
}
