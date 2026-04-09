/**
 * Usage analytics subcommand for the monitoring CLI command
 *
 * Provides cross-session usage analytics: cost, token, and request breakdowns
 * by model, command, and day.
 */

import { writeFileSync } from 'fs';

import type { CommandAdapter } from 'cli/command-adapter.interface';
import type { SpendingRecord } from 'utils/spending-tracker';

import { getColorAdapter } from 'output/color-adapter.interface';
import { formatError } from 'utils/error-handler';
import { formatNumber } from 'utils/number-format';
import {
	type CommandUsage,
	type DailyUsage,
	getUsageAnalytics,
	type ModelUsage,
	type UsageAnalyticsOptions,
	type UsageSummary
} from 'utils/usage-analytics';

// ─── Display helpers ──────────────────────────────────────────────────────────

function buildBar(value: number, maxValue: number, width: number): string {
	if (maxValue <= 0) return '░'.repeat(width);
	const filled = Math.round((value / maxValue) * width);
	return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function displayCommandBreakdown(
	commands: CommandUsage[],
	topN: number,
	color: ReturnType<typeof getColorAdapter>
): void {
	const slice = commands.slice(0, topN);
	const maxCost = slice.reduce((m, r) => Math.max(m, r.totalCostUsd), 0);

	console.log(`\n${color.magenta('⚡ By Command')}`);
	console.log('═'.repeat(62));

	if (slice.length === 0) {
		console.log(color.dim('  No command data found.'));
		return;
	}

	slice.forEach((c) => {
		const bar = buildBar(c.totalCostUsd, maxCost, 20);
		const avgTok = c.requestCount > 0 ? Math.round(c.totalTokens / c.requestCount) : 0;
		const modelList = c.models.length > 2 ? `${c.models.slice(0, 2).join(', ')}, ...` : c.models.join(', ');
		console.log(
			`  ${color.cyan(c.command.padEnd(20))} ${String(c.requestCount).padStart(3)} req  $${c.totalCostUsd.toFixed(4)}  ${formatNumber(avgTok)} avg tok  ${color.dim(modelList)}`
		);
		console.log(`  ${color.dim(bar)}`);
	});
}

function displayCostliestRequests(
	requests: SpendingRecord[],
	topN: number,
	color: ReturnType<typeof getColorAdapter>
): void {
	const slice = requests.slice(0, topN);

	console.log(`\n${color.magenta(`🔴 Top ${topN} Most Expensive Requests:`)}`);
	console.log('═'.repeat(62));

	if (slice.length === 0) {
		console.log(color.dim('  No spending records found.'));
		return;
	}

	for (const [i, r] of slice.entries()) {
		const date = new Date(r.timestamp).toLocaleString();
		console.log(
			`  ${i + 1}. ${color.cyan(r.command.padEnd(12))} ${color.dim(date)}  $${r.costUsd.toFixed(4)}  ${color.dim(r.model)}  ${formatNumber(r.totalTokens)} tok`
		);
	}
}

function displayDailyBreakdown(daily: DailyUsage[], color: ReturnType<typeof getColorAdapter>): void {
	const maxCost = daily.reduce((m, d) => Math.max(m, d.totalCostUsd), 0);

	console.log(`\n${color.blue('📅 Daily Breakdown')}`);
	console.log('═'.repeat(62));

	if (daily.length === 0) {
		console.log(color.dim('  No daily data found.'));
		return;
	}

	console.log(`  ${'Date'.padEnd(12)} ${'Req'.padStart(5)}  ${'Tokens'.padEnd(10)}  ${'Cost'.padEnd(10)}  Chart`);
	console.log('  ' + '─'.repeat(58));

	daily.forEach((d) => {
		const bar = buildBar(d.totalCostUsd, maxCost, 15);
		console.log(
			`  ${d.date.padEnd(12)} ${String(d.requestCount).padStart(5)}  ${formatNumber(d.totalTokens).padEnd(10)}  $${d.totalCostUsd.toFixed(4).padEnd(9)}  ${color.dim(bar)}`
		);
	});
}

function displayModelBreakdown(models: ModelUsage[], topN: number, color: ReturnType<typeof getColorAdapter>): void {
	const slice = models.slice(0, topN);
	const maxCost = slice.reduce((m, r) => Math.max(m, r.totalCostUsd), 0);

	console.log(`\n${color.magenta('🤖 By Model')}`);
	console.log('═'.repeat(62));

	if (slice.length === 0) {
		console.log(color.dim('  No model data found.'));
		return;
	}

	slice.forEach((m) => {
		const bar = buildBar(m.totalCostUsd, maxCost, 20);
		const savings = m.cacheSavingsUsd > 0 ? `  ${color.green(`saved $${m.cacheSavingsUsd.toFixed(4)}`)}` : '';
		console.log(
			`  ${color.cyan(m.model.padEnd(30))} ${String(m.requestCount).padStart(3)} req  $${m.totalCostUsd.toFixed(4)}  ${formatNumber(m.totalTokens)} tok`
		);
		console.log(`  ${color.dim(bar)}${savings}`);
	});
}

function displaySummary(summary: UsageSummary, color: ReturnType<typeof getColorAdapter>): void {
	const { avgDailyCost, period, totals } = summary;

	const fromDate = period.from.slice(0, 10);
	const toDate = period.to.slice(0, 10);

	console.log(`\n${color.cyan('📊 Usage Summary')}`);
	console.log('═'.repeat(62));
	console.log(`  Period:          ${fromDate} → ${toDate}`);
	console.log(`  Total cost:      ${color.bold(color.yellow(`$${totals.totalCostUsd.toFixed(4)}`))}`);
	console.log(`  Total tokens:    ${color.cyan(formatNumber(totals.totalTokens))}`);
	console.log(`  Total requests:  ${totals.requestCount}`);
	console.log(`  Avg daily cost:  $${avgDailyCost.toFixed(4)}`);

	if (totals.cacheSavingsUsd > 0) {
		console.log(`  Cache savings:   ${color.green(`$${totals.cacheSavingsUsd.toFixed(4)} saved`)}`);
	}
}

// ─── Output helpers ───────────────────────────────────────────────────────────

function writeOutput(content: string, outputPath: string, color: ReturnType<typeof getColorAdapter>): void {
	writeFileSync(outputPath, content, 'utf8');
	console.log(color.green(`✅ Report written to ${outputPath}`));
}

// ─── Subcommand configurator ──────────────────────────────────────────────────

export function configureUsageSubcommand(monitoringCmd: CommandAdapter): void {
	monitoringCmd
		.command('usage')
		.description('Show cross-session usage analytics')
		.option('--since <date>', 'Filter records since date (ISO 8601)')
		.option('--since-days <n>', 'Show last N days of usage', '7')
		.option('--top <n>', 'Top N costliest requests to show', '10')
		.option('--by-model', 'Show model breakdown only', false)
		.option('--by-command', 'Show command breakdown only', false)
		.option('--daily', 'Show daily breakdown only', false)
		.option('--model <name>', 'Filter to a single model')
		.option('--command <name>', 'Filter to a single command')
		.option('--format <fmt>', 'Output format (json|table|markdown)', 'table')
		.option('--output <path>', 'Write report to file path')
		.action((options: Record<string, unknown>) => {
			const color = getColorAdapter();
			try {
				runUsageAction(options);
			} catch (error) {
				console.error(color.red('Failed to retrieve usage data:'), formatError(error as Error));
				process.exit(1);
			}
		});
}

function emitReport(content: string, outputPath: string | undefined, color: ReturnType<typeof getColorAdapter>): void {
	if (outputPath) {
		writeOutput(content, outputPath, color);
	} else {
		console.log(content);
	}
}

function renderTableOutput(
	summary: UsageSummary,
	flags: { byCommand: boolean; byModel: boolean; daily: boolean; topN: number },
	color: ReturnType<typeof getColorAdapter>
): void {
	const { byCommand, byModel, daily, topN } = flags;
	const showAll = !byModel && !byCommand && !daily;

	if (showAll) {
		displaySummary(summary, color);
		displayModelBreakdown(summary.byModel, topN, color);
		displayCommandBreakdown(summary.byCommand, topN, color);
		displayCostliestRequests(summary.costliestRequests, topN, color);
		displayDailyBreakdown(summary.daily, color);
		return;
	}

	if (byModel) {
		displaySummary(summary, color);
		displayModelBreakdown(summary.byModel, topN, color);
	}
	if (byCommand) {
		displaySummary(summary, color);
		displayCommandBreakdown(summary.byCommand, topN, color);
	}
	if (daily) {
		displaySummary(summary, color);
		displayDailyBreakdown(summary.daily, color);
	}
}

function runUsageAction(options: Record<string, unknown>): void {
	const color = getColorAdapter();
	const analytics = getUsageAnalytics();

	const since = options['since'] as string | undefined;
	const sinceDaysRaw = options['sinceDays'] as string | undefined;
	const sinceDays = sinceDaysRaw ? parseInt(sinceDaysRaw, 10) : undefined;

	const opts: UsageAnalyticsOptions = {
		command: options['command'] as string | undefined,
		model: options['model'] as string | undefined,
		sinceDate: since,
		sinceDays: since ? undefined : sinceDays
	};

	const topN = options['top'] ? parseInt(options['top'] as string, 10) : 10;
	const fmt = (options['format'] as string | undefined) ?? 'table';
	const outputPath = options['output'] as string | undefined;

	const reportGenerators: Partial<Record<string, () => string>> = {
		json: () => analytics.generateJsonReport(opts),
		markdown: () => analytics.generateMarkdownReport(opts)
	};
	const generator = reportGenerators[fmt];
	if (generator !== undefined) {
		emitReport(generator(), outputPath, color);
		return;
	}

	const byModel = options['byModel'] === true;
	const byCommand = options['byCommand'] === true;
	const daily = options['daily'] === true;
	const summary = analytics.analyze(opts);

	renderTableOutput(summary, { byCommand, byModel, daily, topN }, color);
	console.log('');
}
