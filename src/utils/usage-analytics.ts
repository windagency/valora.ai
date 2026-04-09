/**
 * Usage Analytics - Higher-level analytics layer on top of SpendingTracker
 *
 * Provides daily breakdowns, per-model and per-command aggregations,
 * markdown and JSON report generation.
 */

import { formatNumber } from 'utils/number-format';
import {
	type GetRecordsOptions,
	getSpendingTracker,
	type SpendingRecord,
	type SpendingTotals,
	type SpendingTracker
} from 'utils/spending-tracker';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface CommandUsage {
	avgCostPerRequest: number;
	cacheSavingsUsd: number;
	command: string;
	models: string[]; // distinct model names used for this command
	requestCount: number;
	totalCostUsd: number;
	totalTokens: number;
}

export interface DailyUsage {
	cacheReadTokens: number;
	cacheSavingsUsd: number;
	cacheWriteTokens: number;
	date: string; // YYYY-MM-DD
	inputTokens: number;
	outputTokens: number;
	requestCount: number;
	totalCostUsd: number;
	totalTokens: number;
}

export interface ModelUsage {
	avgCostPerRequest: number;
	cacheReadTokens: number;
	cacheSavingsUsd: number;
	cacheWriteTokens: number;
	inputTokens: number;
	model: string;
	outputTokens: number;
	requestCount: number;
	totalCostUsd: number;
	totalTokens: number;
}

export interface UsageAnalyticsOptions {
	command?: string; // filter by command
	model?: string; // filter by model (exact match)
	sinceDate?: string; // ISO 8601 absolute date
	sinceDays?: number; // shorthand: last N days (converted to sinceDate internally)
}

export interface UsagePeriod {
	from: string;
	to: string;
}

export interface UsageSummary {
	avgDailyCost: number;
	avgDailyTokens: number;
	byCommand: CommandUsage[]; // sorted by totalCostUsd desc
	byModel: ModelUsage[]; // sorted by totalCostUsd desc
	costliestRequests: SpendingRecord[]; // top 10 by costUsd
	daily: DailyUsage[]; // sorted oldest-first
	peakDay: DailyUsage | null; // day with highest cost (null if no data)
	period: UsagePeriod;
	totals: SpendingTotals;
}

// ─── Internal helper types ────────────────────────────────────────────────────

interface ResolvedOptions {
	model?: string;
	recordsOpts: GetRecordsOptions;
}

// ─── Class ────────────────────────────────────────────────────────────────────

export class UsageAnalytics {
	constructor(private readonly tracker: SpendingTracker) {}

	// ── Private helpers ────────────────────────────────────────────────────────

	private fetchRecords(options?: UsageAnalyticsOptions): SpendingRecord[] {
		const { model, recordsOpts } = this.resolveOptions(options);
		let records = this.tracker.getRecords(recordsOpts);
		if (model !== undefined) {
			records = records.filter((r) => r.model === model);
		}
		return records;
	}

	private resolveOptions(options?: UsageAnalyticsOptions): ResolvedOptions {
		const recordsOpts: GetRecordsOptions = {};

		// command filter maps directly to GetRecordsOptions
		if (options?.command !== undefined) {
			recordsOpts.command = options.command;
		}

		// sinceDate wins over sinceDays when both are provided
		if (options?.sinceDate !== undefined) {
			recordsOpts.since = options.sinceDate;
		} else if (options?.sinceDays !== undefined) {
			const d = new Date();
			d.setDate(d.getDate() - options.sinceDays);
			recordsOpts.since = d.toISOString();
		}

		return { model: options?.model, recordsOpts };
	}

	// ── Private record-based helpers (avoid redundant fetches) ────────────────

	private byCommandFromRecords(records: SpendingRecord[]): CommandUsage[] {
		const byCommand = new Map<string, CommandUsage & { modelSet: Set<string> }>();

		for (const r of records) {
			const existing = byCommand.get(r.command);
			if (existing) {
				existing.totalCostUsd += r.costUsd;
				existing.totalTokens += r.totalTokens;
				existing.requestCount += 1;
				existing.cacheSavingsUsd += r.cacheSavingsUsd;
				existing.modelSet.add(r.model);
				existing.avgCostPerRequest = existing.totalCostUsd / existing.requestCount;
			} else {
				byCommand.set(r.command, {
					avgCostPerRequest: r.costUsd,
					cacheSavingsUsd: r.cacheSavingsUsd,
					command: r.command,
					models: [r.model],
					modelSet: new Set([r.model]),
					requestCount: 1,
					totalCostUsd: r.costUsd,
					totalTokens: r.totalTokens
				});
			}
		}

		return Array.from(byCommand.values())
			.sort((a, b) => b.totalCostUsd - a.totalCostUsd)
			.map(({ modelSet, ...rest }) => ({
				...rest,
				models: Array.from(modelSet)
			}));
	}

	private byModelFromRecords(records: SpendingRecord[]): ModelUsage[] {
		const byModel = new Map<string, ModelUsage>();

		for (const r of records) {
			const existing = byModel.get(r.model);
			if (existing) {
				existing.totalCostUsd += r.costUsd;
				existing.totalTokens += r.totalTokens;
				existing.requestCount += 1;
				existing.inputTokens += r.promptTokens;
				existing.outputTokens += r.completionTokens;
				existing.cacheReadTokens += r.cacheReadTokens;
				existing.cacheWriteTokens += r.cacheWriteTokens;
				existing.cacheSavingsUsd += r.cacheSavingsUsd;
				existing.avgCostPerRequest = existing.totalCostUsd / existing.requestCount;
			} else {
				byModel.set(r.model, {
					avgCostPerRequest: r.costUsd,
					cacheReadTokens: r.cacheReadTokens,
					cacheSavingsUsd: r.cacheSavingsUsd,
					cacheWriteTokens: r.cacheWriteTokens,
					inputTokens: r.promptTokens,
					model: r.model,
					outputTokens: r.completionTokens,
					requestCount: 1,
					totalCostUsd: r.costUsd,
					totalTokens: r.totalTokens
				});
			}
		}

		return Array.from(byModel.values()).sort((a, b) => b.totalCostUsd - a.totalCostUsd);
	}

	private dailyBreakdownFromRecords(records: SpendingRecord[]): DailyUsage[] {
		const byDate = new Map<string, DailyUsage>();

		for (const r of records) {
			const date = r.timestamp.slice(0, 10);
			const existing = byDate.get(date);
			if (existing) {
				existing.totalCostUsd += r.costUsd;
				existing.totalTokens += r.totalTokens;
				existing.requestCount += 1;
				existing.inputTokens += r.promptTokens;
				existing.outputTokens += r.completionTokens;
				existing.cacheReadTokens += r.cacheReadTokens;
				existing.cacheWriteTokens += r.cacheWriteTokens;
				existing.cacheSavingsUsd += r.cacheSavingsUsd;
			} else {
				byDate.set(date, {
					cacheReadTokens: r.cacheReadTokens,
					cacheSavingsUsd: r.cacheSavingsUsd,
					cacheWriteTokens: r.cacheWriteTokens,
					date,
					inputTokens: r.promptTokens,
					outputTokens: r.completionTokens,
					requestCount: 1,
					totalCostUsd: r.costUsd,
					totalTokens: r.totalTokens
				});
			}
		}

		return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
	}

	// ── Public API ─────────────────────────────────────────────────────────────

	analyze(options?: UsageAnalyticsOptions): UsageSummary {
		const { model, recordsOpts } = this.resolveOptions(options);

		// Fetch records once; pass pre-fetched records to private helpers to avoid
		// redundant JSONL reads (Issue 1).
		const records = this.fetchRecords(options);

		const daily = this.dailyBreakdownFromRecords(records);
		const byModel = this.byModelFromRecords(records);
		const byCommand = this.byCommandFromRecords(records);

		// Only call getTotals when there is no model filter — getTotals doesn't
		// support model filtering and reading the file again would be wasteful
		// (Issue 2). When a model filter is active, compute totals from the
		// already-fetched filtered records instead.
		const effectiveTotals: SpendingTotals =
			model !== undefined
				? records.reduce<SpendingTotals>(
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
						{
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
						}
					)
				: this.tracker.getTotals(recordsOpts);

		const now = new Date().toISOString();
		const from =
			records.length > 0
				? records.reduce((min, r) => (r.timestamp < min ? r.timestamp : min), records[0]!.timestamp)
				: now;

		const costliestRequests = [...records].sort((a, b) => b.costUsd - a.costUsd).slice(0, 10);

		const dayCount = daily.length;
		const avgDailyCost = dayCount > 0 ? effectiveTotals.totalCostUsd / dayCount : 0;
		const avgDailyTokens = dayCount > 0 ? effectiveTotals.totalTokens / dayCount : 0;

		const peakDay =
			daily.length > 0 ? daily.reduce((peak, d) => (d.totalCostUsd > peak.totalCostUsd ? d : peak), daily[0]!) : null;

		return {
			avgDailyCost,
			avgDailyTokens,
			byCommand,
			byModel,
			costliestRequests,
			daily,
			peakDay,
			period: { from, to: now },
			totals: effectiveTotals
		};
	}

	generateJsonReport(options?: UsageAnalyticsOptions): string {
		return JSON.stringify(this.analyze(options), null, 2);
	}

	generateMarkdownReport(options?: UsageAnalyticsOptions): string {
		const summary = this.analyze(options);
		const { avgDailyCost, byCommand, byModel, costliestRequests, daily, peakDay, period, totals } = summary;

		const fmtUsd = (v: number): string => `$${v.toFixed(4)}`;
		const fmtTokens = (v: number): string => formatNumber(v);

		const lines: string[] = [];

		// Title & period
		lines.push(`# Valora Usage Report`);
		lines.push('');
		lines.push(`Period: ${period.from} → ${period.to}`);
		lines.push('');

		// Summary
		lines.push(`## Summary`);
		lines.push('');
		lines.push(`| Metric | Value |`);
		lines.push(`| --- | --- |`);
		lines.push(`| Total cost | ${fmtUsd(totals.totalCostUsd)} |`);
		lines.push(`| Total tokens | ${fmtTokens(totals.totalTokens)} |`);
		lines.push(`| Total requests | ${totals.requestCount} |`);
		lines.push(`| Avg daily cost | ${fmtUsd(avgDailyCost)} |`);
		lines.push(`| Cache savings | ${fmtUsd(totals.cacheSavingsUsd)} |`);
		if (peakDay !== null) {
			lines.push(`| Peak day | ${peakDay.date} (${fmtUsd(peakDay.totalCostUsd)}) |`);
		}
		lines.push('');

		// By Model
		lines.push(`## By Model`);
		lines.push('');
		lines.push(`| Model | Requests | Tokens | Cost | Avg/req | Cache Saved |`);
		lines.push(`| --- | --- | --- | --- | --- | --- |`);
		lines.push(
			...byModel.map(
				(m) =>
					`| ${m.model} | ${m.requestCount} | ${fmtTokens(m.totalTokens)} | ${fmtUsd(m.totalCostUsd)} | ${fmtUsd(m.avgCostPerRequest)} | ${fmtUsd(m.cacheSavingsUsd)} |`
			)
		);
		lines.push('');

		// By Command
		lines.push(`## By Command`);
		lines.push('');
		lines.push(`| Command | Requests | Tokens | Cost | Avg/req | Models |`);
		lines.push(`| --- | --- | --- | --- | --- | --- |`);
		lines.push(
			...byCommand.map(
				(c) =>
					`| ${c.command} | ${c.requestCount} | ${fmtTokens(c.totalTokens)} | ${fmtUsd(c.totalCostUsd)} | ${fmtUsd(c.avgCostPerRequest)} | ${c.models.join(', ')} |`
			)
		);
		lines.push('');

		// Daily Breakdown
		lines.push(`## Daily Breakdown`);
		lines.push('');
		lines.push(`| Date | Requests | Tokens | Cost | Cache Saved |`);
		lines.push(`| --- | --- | --- | --- | --- |`);
		lines.push(
			...daily.map(
				(d) =>
					`| ${d.date} | ${d.requestCount} | ${fmtTokens(d.totalTokens)} | ${fmtUsd(d.totalCostUsd)} | ${fmtUsd(d.cacheSavingsUsd)} |`
			)
		);
		lines.push('');

		// Top 10 Costliest Requests
		lines.push(`## Top 10 Costliest Requests`);
		lines.push('');
		lines.push(`| Timestamp | Command | Model | Tokens | Cost |`);
		lines.push(`| --- | --- | --- | --- | --- |`);
		lines.push(
			...costliestRequests.map(
				(r) => `| ${r.timestamp} | ${r.command} | ${r.model} | ${fmtTokens(r.totalTokens)} | ${fmtUsd(r.costUsd)} |`
			)
		);
		lines.push('');

		return lines.join('\n');
	}

	getByCommand(options?: UsageAnalyticsOptions): CommandUsage[] {
		return this.byCommandFromRecords(this.fetchRecords(options));
	}

	getByModel(options?: UsageAnalyticsOptions): ModelUsage[] {
		return this.byModelFromRecords(this.fetchRecords(options));
	}

	getDailyBreakdown(options?: UsageAnalyticsOptions): DailyUsage[] {
		return this.dailyBreakdownFromRecords(this.fetchRecords(options));
	}
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let instance: null | UsageAnalytics = null;

export function getUsageAnalytics(): UsageAnalytics {
	instance ??= new UsageAnalytics(getSpendingTracker());
	return instance;
}
