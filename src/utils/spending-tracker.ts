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
	totalCacheReadTokens: number;
	totalCacheWriteTokens: number;
	totalCostUsd: number;
	totalInputTokens: number;
	totalOutputTokens: number;
	totalTokens: number;
}

export interface GetRecordsOptions {
	command?: string;
	since?: string;
}

export interface SpendingRecord {
	batchDiscounted: boolean;
	cacheReadCostUsd: number;
	cacheReadTokens: number;
	cacheSavingsUsd: number;
	cacheWriteCostUsd: number;
	cacheWriteTokens: number;
	command: string;
	completionTokens: number;
	contextSavingsPercent?: number;
	contextTokensAfter?: number;
	contextTokensBefore?: number;
	costUsd: number;
	durationMs: number;
	id: string;
	inputCostUsd: number;
	model: string;
	outputCostUsd: number;
	progressiveDisclosureCalls?: number;
	promptTokens: number;
	stage: string;
	timestamp: string;
	totalTokens: number;
	unknownModelPricing: boolean;
}

export interface SpendingTotals {
	cacheSavingsUsd: number;
	hasUnknownModelPricing: boolean;
	requestCount: number;
	totalCacheReadCostUsd: number;
	totalCacheReadTokens: number;
	totalCacheWriteCostUsd: number;
	totalCacheWriteTokens: number;
	totalCostUsd: number;
	totalInputCostUsd: number;
	totalInputTokens: number;
	totalOutputCostUsd: number;
	totalOutputTokens: number;
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
				existing.totalInputTokens += r.promptTokens;
				existing.totalOutputTokens += r.completionTokens;
				existing.totalCacheReadTokens += r.cacheReadTokens;
				existing.totalCacheWriteTokens += r.cacheWriteTokens;
				existing.requestCount += 1;
				existing.cacheSavingsUsd += r.cacheSavingsUsd;
				existing.avgCostUsd = existing.totalCostUsd / existing.requestCount;
			} else {
				byCommand.set(r.command, {
					avgCostUsd: r.costUsd,
					cacheSavingsUsd: r.cacheSavingsUsd,
					command: r.command,
					requestCount: 1,
					totalCacheReadTokens: r.cacheReadTokens,
					totalCacheWriteTokens: r.cacheWriteTokens,
					totalCostUsd: r.costUsd,
					totalInputTokens: r.promptTokens,
					totalOutputTokens: r.completionTokens,
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
		const initial: SpendingTotals = {
			cacheSavingsUsd: 0,
			hasUnknownModelPricing: false,
			requestCount: 0,
			totalCacheReadCostUsd: 0,
			totalCacheReadTokens: 0,
			totalCacheWriteCostUsd: 0,
			totalCacheWriteTokens: 0,
			totalCostUsd: 0,
			totalInputCostUsd: 0,
			totalInputTokens: 0,
			totalOutputCostUsd: 0,
			totalOutputTokens: 0,
			totalTokens: 0
		};
		return records.reduce(
			(acc, r) => ({
				cacheSavingsUsd: acc.cacheSavingsUsd + r.cacheSavingsUsd,
				hasUnknownModelPricing: acc.hasUnknownModelPricing || (r.unknownModelPricing ?? false),
				requestCount: acc.requestCount + 1,
				totalCacheReadCostUsd: acc.totalCacheReadCostUsd + (r.cacheReadCostUsd ?? 0),
				totalCacheReadTokens: acc.totalCacheReadTokens + r.cacheReadTokens,
				totalCacheWriteCostUsd: acc.totalCacheWriteCostUsd + (r.cacheWriteCostUsd ?? 0),
				totalCacheWriteTokens: acc.totalCacheWriteTokens + r.cacheWriteTokens,
				totalCostUsd: acc.totalCostUsd + r.costUsd,
				totalInputCostUsd: acc.totalInputCostUsd + (r.inputCostUsd ?? 0),
				totalInputTokens: acc.totalInputTokens + r.promptTokens,
				totalOutputCostUsd: acc.totalOutputCostUsd + (r.outputCostUsd ?? 0),
				totalOutputTokens: acc.totalOutputTokens + r.completionTokens,
				totalTokens: acc.totalTokens + r.totalTokens
			}),
			initial
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
