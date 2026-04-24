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

export interface ActivityUsage {
	activity: string;
	avgCostPerRequest: number;
	avgIterations: null | number;
	cacheSavingsUsd: number;
	oneShotRate: null | number; // fraction of records where iterations === 1; null if no iterations data
	requestCount: number;
	totalCostUsd: number;
	totalTokens: number;
}

export interface AgentUsage {
	agent: string;
	avgCostPerRequest: number;
	cacheSavingsUsd: number;
	requestCount: number;
	totalCostUsd: number;
	totalTokens: number;
}

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

export interface ProjectUsage {
	avgCostPerRequest: number;
	cacheSavingsUsd: number;
	projectPath: string;
	requestCount: number;
	totalCostUsd: number;
	totalTokens: number;
}

export interface SessionUsage {
	avgCostPerRequest: number;
	cacheSavingsUsd: number;
	from: string;
	requestCount: number;
	sessionId: string;
	to: string;
	totalCostUsd: number;
	totalTokens: number;
}

export interface UsageAnalyticsOptions {
	activity?: string; // filter by activity
	agent?: string; // filter by agent
	command?: string; // filter by command
	model?: string; // filter by model (exact match)
	project?: string; // filter by projectPath
	session?: string; // filter by sessionId
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
	byActivity: ActivityUsage[]; // sorted by totalCostUsd desc
	byAgent: AgentUsage[]; // sorted by totalCostUsd desc
	byCommand: CommandUsage[]; // sorted by totalCostUsd desc
	byModel: ModelUsage[]; // sorted by totalCostUsd desc
	byProject: ProjectUsage[]; // sorted by totalCostUsd desc
	bySession: SessionUsage[]; // sorted by totalCostUsd desc
	cacheHitRatio: number; // sum(cacheReadTokens) / sum(cacheReadTokens + promptTokens)
	costliestRequests: SpendingRecord[]; // top 10 by costUsd
	daily: DailyUsage[]; // sorted oldest-first
	peakDay: DailyUsage | null; // day with highest cost (null if no data)
	period: UsagePeriod;
	sessionsCount: number;
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
		if (model !== undefined) records = records.filter((r) => r.model === model);
		if (options?.activity !== undefined) records = records.filter((r) => r.activity === options.activity);
		if (options?.agent !== undefined) records = records.filter((r) => r.agent === options.agent);
		if (options?.session !== undefined) records = records.filter((r) => r.sessionId === options.session);
		if (options?.project !== undefined) records = records.filter((r) => r.projectPath === options.project);
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

	private byActivityFromRecords(records: SpendingRecord[]): ActivityUsage[] {
		const map = new Map<
			string,
			Omit<ActivityUsage, 'avgCostPerRequest' | 'avgIterations' | 'oneShotRate'> & {
				iterationsCount: number;
				iterationsSum: number;
				oneShotCount: number;
			}
		>();

		for (const r of records) {
			const key = r.activity ?? 'Other';
			const ex = map.get(key);
			const hasIterations = r.iterations !== undefined;
			if (ex) {
				ex.totalCostUsd += r.costUsd;
				ex.totalTokens += r.totalTokens;
				ex.requestCount += 1;
				ex.cacheSavingsUsd += r.cacheSavingsUsd;
				if (hasIterations) {
					ex.iterationsSum += r.iterations!;
					ex.iterationsCount += 1;
					if (r.iterations === 1) ex.oneShotCount += 1;
				}
			} else {
				map.set(key, {
					activity: key,
					cacheSavingsUsd: r.cacheSavingsUsd,
					iterationsCount: hasIterations ? 1 : 0,
					iterationsSum: hasIterations ? r.iterations! : 0,
					oneShotCount: r.iterations === 1 ? 1 : 0,
					requestCount: 1,
					totalCostUsd: r.costUsd,
					totalTokens: r.totalTokens
				});
			}
		}

		return Array.from(map.values())
			.sort((a, b) => b.totalCostUsd - a.totalCostUsd)
			.map(({ iterationsCount, iterationsSum, oneShotCount, ...rest }) => ({
				...rest,
				avgCostPerRequest: rest.totalCostUsd / rest.requestCount,
				avgIterations: iterationsCount > 0 ? iterationsSum / iterationsCount : null,
				oneShotRate: iterationsCount > 0 ? oneShotCount / iterationsCount : null
			}));
	}

	private byAgentFromRecords(records: SpendingRecord[]): AgentUsage[] {
		const map = new Map<string, Omit<AgentUsage, 'avgCostPerRequest'>>();
		for (const r of records) {
			const key = r.agent ?? '(unknown)';
			const ex = map.get(key);
			if (ex) {
				ex.totalCostUsd += r.costUsd;
				ex.totalTokens += r.totalTokens;
				ex.requestCount += 1;
				ex.cacheSavingsUsd += r.cacheSavingsUsd;
			} else {
				map.set(key, {
					agent: key,
					cacheSavingsUsd: r.cacheSavingsUsd,
					requestCount: 1,
					totalCostUsd: r.costUsd,
					totalTokens: r.totalTokens
				});
			}
		}
		return Array.from(map.values())
			.sort((a, b) => b.totalCostUsd - a.totalCostUsd)
			.map((e) => ({ ...e, avgCostPerRequest: e.totalCostUsd / e.requestCount }));
	}

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

	private byProjectFromRecords(records: SpendingRecord[]): ProjectUsage[] {
		const map = new Map<string, Omit<ProjectUsage, 'avgCostPerRequest'>>();
		for (const r of records) {
			const key = r.projectPath ?? '(unknown)';
			const ex = map.get(key);
			if (ex) {
				ex.totalCostUsd += r.costUsd;
				ex.totalTokens += r.totalTokens;
				ex.requestCount += 1;
				ex.cacheSavingsUsd += r.cacheSavingsUsd;
			} else {
				map.set(key, {
					cacheSavingsUsd: r.cacheSavingsUsd,
					projectPath: key,
					requestCount: 1,
					totalCostUsd: r.costUsd,
					totalTokens: r.totalTokens
				});
			}
		}
		return Array.from(map.values())
			.sort((a, b) => b.totalCostUsd - a.totalCostUsd)
			.map((e) => ({ ...e, avgCostPerRequest: e.totalCostUsd / e.requestCount }));
	}

	private bySessionFromRecords(records: SpendingRecord[]): SessionUsage[] {
		const map = new Map<string, Omit<SessionUsage, 'avgCostPerRequest'>>();
		for (const r of records) {
			const key = r.sessionId ?? '(unknown)';
			const ex = map.get(key);
			if (ex) {
				ex.totalCostUsd += r.costUsd;
				ex.totalTokens += r.totalTokens;
				ex.requestCount += 1;
				ex.cacheSavingsUsd += r.cacheSavingsUsd;
				if (r.timestamp < ex.from) ex.from = r.timestamp;
				if (r.timestamp > ex.to) ex.to = r.timestamp;
			} else {
				map.set(key, {
					cacheSavingsUsd: r.cacheSavingsUsd,
					from: r.timestamp,
					requestCount: 1,
					sessionId: key,
					to: r.timestamp,
					totalCostUsd: r.costUsd,
					totalTokens: r.totalTokens
				});
			}
		}
		return Array.from(map.values())
			.sort((a, b) => b.totalCostUsd - a.totalCostUsd)
			.map((e) => ({ ...e, avgCostPerRequest: e.totalCostUsd / e.requestCount }));
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
		const bySession = this.bySessionFromRecords(records);
		const byActivity = this.byActivityFromRecords(records);
		const byProject = this.byProjectFromRecords(records);
		const byAgent = this.byAgentFromRecords(records);

		const totalCacheReadTokens = records.reduce((s, r) => s + r.cacheReadTokens, 0);
		const totalPromptTokens = records.reduce((s, r) => s + r.promptTokens, 0);
		const cacheHitRatio =
			totalCacheReadTokens + totalPromptTokens > 0
				? totalCacheReadTokens / (totalCacheReadTokens + totalPromptTokens)
				: 0;
		const sessionsCount = records.length === 0 ? 0 : new Set(records.map((r) => r.sessionId ?? '(unknown)')).size;

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
			byActivity,
			byAgent,
			byCommand,
			byModel,
			byProject,
			bySession,
			cacheHitRatio,
			costliestRequests,
			daily,
			peakDay,
			period: { from, to: now },
			sessionsCount,
			totals: effectiveTotals
		};
	}

	generateCsvReport(
		opts?: UsageAnalyticsOptions & {
			section?: 'byActivity' | 'byAgent' | 'byCommand' | 'byModel' | 'byProject' | 'bySession' | 'daily';
		}
	): string {
		const section = opts?.section ?? 'byModel';
		const summary = this.analyze(opts);
		return toCsv(summary, section);
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

// ─── CSV helper ───────────────────────────────────────────────────────────────

export type CsvSection = 'byActivity' | 'byAgent' | 'byCommand' | 'byModel' | 'byProject' | 'bySession' | 'daily';

type CsvRenderer = (summary: UsageSummary) => string[];

const csvRenderers: Record<CsvSection, CsvRenderer> = {
	byActivity: (s) => [
		csvRow([
			'activity',
			'requestCount',
			'totalCostUsd',
			'totalTokens',
			'avgCostPerRequest',
			'cacheSavingsUsd',
			'oneShotRate',
			'avgIterations'
		]),
		...s.byActivity.map((a) =>
			csvRow([
				a.activity,
				a.requestCount,
				a.totalCostUsd,
				a.totalTokens,
				a.avgCostPerRequest,
				a.cacheSavingsUsd,
				a.oneShotRate,
				a.avgIterations
			])
		)
	],
	byAgent: (s) => [
		csvRow(['agent', 'requestCount', 'totalCostUsd', 'totalTokens', 'avgCostPerRequest', 'cacheSavingsUsd']),
		...s.byAgent.map((a) =>
			csvRow([a.agent, a.requestCount, a.totalCostUsd, a.totalTokens, a.avgCostPerRequest, a.cacheSavingsUsd])
		)
	],
	byCommand: (s) => [
		csvRow([
			'command',
			'requestCount',
			'totalCostUsd',
			'totalTokens',
			'avgCostPerRequest',
			'cacheSavingsUsd',
			'models'
		]),
		...s.byCommand.map((c) =>
			csvRow([
				c.command,
				c.requestCount,
				c.totalCostUsd,
				c.totalTokens,
				c.avgCostPerRequest,
				c.cacheSavingsUsd,
				c.models.join(';')
			])
		)
	],
	byModel: (s) => [
		csvRow([
			'model',
			'requestCount',
			'totalCostUsd',
			'totalTokens',
			'avgCostPerRequest',
			'cacheSavingsUsd',
			'inputTokens',
			'outputTokens',
			'cacheReadTokens',
			'cacheWriteTokens'
		]),
		...s.byModel.map((m) =>
			csvRow([
				m.model,
				m.requestCount,
				m.totalCostUsd,
				m.totalTokens,
				m.avgCostPerRequest,
				m.cacheSavingsUsd,
				m.inputTokens,
				m.outputTokens,
				m.cacheReadTokens,
				m.cacheWriteTokens
			])
		)
	],
	byProject: (s) => [
		csvRow(['projectPath', 'requestCount', 'totalCostUsd', 'totalTokens', 'avgCostPerRequest', 'cacheSavingsUsd']),
		...s.byProject.map((p) =>
			csvRow([p.projectPath, p.requestCount, p.totalCostUsd, p.totalTokens, p.avgCostPerRequest, p.cacheSavingsUsd])
		)
	],
	bySession: (s) => [
		csvRow([
			'sessionId',
			'requestCount',
			'totalCostUsd',
			'totalTokens',
			'avgCostPerRequest',
			'cacheSavingsUsd',
			'from',
			'to'
		]),
		...s.bySession.map((sess) =>
			csvRow([
				sess.sessionId,
				sess.requestCount,
				sess.totalCostUsd,
				sess.totalTokens,
				sess.avgCostPerRequest,
				sess.cacheSavingsUsd,
				sess.from,
				sess.to
			])
		)
	],
	daily: (s) => [
		csvRow([
			'date',
			'requestCount',
			'totalCostUsd',
			'totalTokens',
			'cacheSavingsUsd',
			'inputTokens',
			'outputTokens',
			'cacheReadTokens',
			'cacheWriteTokens'
		]),
		...s.daily.map((d) =>
			csvRow([
				d.date,
				d.requestCount,
				d.totalCostUsd,
				d.totalTokens,
				d.cacheSavingsUsd,
				d.inputTokens,
				d.outputTokens,
				d.cacheReadTokens,
				d.cacheWriteTokens
			])
		)
	]
};

export function toCsv(summary: UsageSummary, section: CsvSection): string {
	return csvRenderers[section](summary).join('\n');
}

function csvCell(v: unknown): string {
	const s = String(v ?? '');
	return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvRow(values: unknown[]): string {
	return values.map(csvCell).join(',');
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let instance: null | UsageAnalytics = null;

export function getUsageAnalytics(): UsageAnalytics {
	instance ??= new UsageAnalytics(getSpendingTracker());
	return instance;
}
