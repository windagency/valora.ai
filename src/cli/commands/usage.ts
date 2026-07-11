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
import { InputValidator } from 'utils/input-validator';
import { formatNumber } from 'utils/number-format';
import {
	type ActivityUsage,
	type AgentUsage,
	type CommandUsage,
	type CsvSection,
	type DailyUsage,
	getUsageAnalytics,
	type ModelUsage,
	type ProjectUsage,
	type SessionUsage,
	type UsageAnalyticsOptions,
	type UsageSummary
} from 'utils/usage-analytics';

// ─── Display helpers ──────────────────────────────────────────────────────────

function buildBar(value: number, maxValue: number, width: number): string {
	if (maxValue <= 0) return '░'.repeat(width);
	const filled = Math.round((value / maxValue) * width);
	return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function displayActivityBreakdown(
	activities: ActivityUsage[],
	topN: number,
	color: ReturnType<typeof getColorAdapter>
): void {
	const slice = activities.slice(0, topN);
	const maxCost = slice.reduce((m, a) => Math.max(m, a.totalCostUsd), 0);

	console.log(`\n${color.magenta('🎯 By Activity')}`);
	console.log('═'.repeat(70));

	if (slice.length === 0) {
		console.log(color.dim('  No activity data found.'));
		return;
	}

	console.log(
		`  ${'Activity'.padEnd(16)} ${'Req'.padStart(5)}  ${'Cost'.padEnd(10)}  ${'One-shot'.padEnd(10)}  ${'Avg iter'.padEnd(8)}  Chart`
	);
	console.log('  ' + '─'.repeat(66));

	for (const a of slice) {
		const bar = buildBar(a.totalCostUsd, maxCost, 12);
		const oneShot = a.oneShotRate !== null ? `${(a.oneShotRate * 100).toFixed(0)}%` : 'n/a';
		const avgIter = a.avgIterations !== null ? a.avgIterations.toFixed(1) : 'n/a';
		console.log(
			`  ${color.cyan(a.activity.padEnd(16))} ${String(a.requestCount).padStart(5)}  $${a.totalCostUsd.toFixed(4).padEnd(9)}  ${oneShot.padEnd(10)}  ${avgIter.padEnd(8)}  ${color.dim(bar)}`
		);
	}
}

function displayAgentBreakdown(agents: AgentUsage[], topN: number, color: ReturnType<typeof getColorAdapter>): void {
	const slice = agents.slice(0, topN);
	const maxCost = slice.reduce((m, a) => Math.max(m, a.totalCostUsd), 0);

	console.log(`\n${color.magenta('🤖 By Agent')}`);
	console.log('═'.repeat(62));

	if (slice.length === 0) {
		console.log(color.dim('  No agent data found.'));
		return;
	}

	for (const a of slice) {
		const bar = buildBar(a.totalCostUsd, maxCost, 20);
		console.log(
			`  ${color.cyan(a.agent.padEnd(20))} ${String(a.requestCount).padStart(3)} req  $${a.totalCostUsd.toFixed(4)}  ${formatNumber(a.totalTokens)} tok`
		);
		console.log(`  ${color.dim(bar)}`);
	}
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

function displayProjectBreakdown(
	projects: ProjectUsage[],
	topN: number,
	color: ReturnType<typeof getColorAdapter>
): void {
	const slice = projects.slice(0, topN);
	const maxCost = slice.reduce((m, p) => Math.max(m, p.totalCostUsd), 0);

	console.log(`\n${color.magenta('📁 By Project')}`);
	console.log('═'.repeat(70));

	if (slice.length === 0) {
		console.log(color.dim('  No project data found.'));
		return;
	}

	for (const p of slice) {
		const bar = buildBar(p.totalCostUsd, maxCost, 12);
		const label = p.projectPath.length > 30 ? `...${p.projectPath.slice(-27)}` : p.projectPath;
		console.log(
			`  ${color.cyan(label.padEnd(32))} ${String(p.requestCount).padStart(3)} req  $${p.totalCostUsd.toFixed(4)}  ${color.dim(bar)}`
		);
	}
}

function displaySessionBreakdown(
	sessions: SessionUsage[],
	topN: number,
	color: ReturnType<typeof getColorAdapter>
): void {
	const slice = sessions.slice(0, topN);
	const maxCost = slice.reduce((m, s) => Math.max(m, s.totalCostUsd), 0);

	console.log(`\n${color.magenta('📋 Top Sessions')}`);
	console.log('═'.repeat(70));

	if (slice.length === 0) {
		console.log(color.dim('  No session data found.'));
		return;
	}

	for (const [i, s] of slice.entries()) {
		const bar = buildBar(s.totalCostUsd, maxCost, 12);
		const from = s.from.slice(0, 16).replace('T', ' ');
		console.log(
			`  ${String(i + 1).padStart(2)}. ${color.cyan(s.sessionId.slice(0, 20).padEnd(20))} ${String(s.requestCount).padStart(3)} req  $${s.totalCostUsd.toFixed(4)}  ${color.dim(from)}  ${color.dim(bar)}`
		);
	}
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

interface TableFlags {
	byActivity: boolean;
	byAgent: boolean;
	byCommand: boolean;
	byModel: boolean;
	byProject: boolean;
	bySession: boolean;
	daily: boolean;
	topN: number;
}

export function configureUsageSubcommand(monitoringCmd: CommandAdapter): CommandAdapter {
	const usageCmd = monitoringCmd
		.command('usage')
		.description('Show cross-session usage analytics')
		.option('--since <date>', 'Filter records since date (ISO 8601)')
		.option('--since-days <n>', 'Show last N days of usage', '7')
		.option('--top <n>', 'Top N costliest requests to show', '10')
		.option('--by-model', 'Show model breakdown only', false)
		.option('--by-command', 'Show command breakdown only', false)
		.option('--by-activity', 'Show activity breakdown only', false)
		.option('--by-session', 'Show session breakdown only', false)
		.option('--by-project', 'Show project breakdown only', false)
		.option('--by-agent', 'Show agent breakdown only', false)
		.option('--daily', 'Show daily breakdown only', false)
		.option('--model <name>', 'Filter to a single model')
		.option('--command <name>', 'Filter to a single command')
		.option('--activity <name>', 'Filter to a single activity')
		.option('--session <id>', 'Filter to a single session')
		.option('--project <path>', 'Filter to a single project path')
		.option('--agent <name>', 'Filter to a single agent')
		.option('--format <fmt>', 'Output format (json|table|markdown|csv)', 'table')
		.option(
			'--csv-section <section>',
			'Section to export as CSV (byModel|byCommand|bySession|byActivity|byProject|byAgent|daily)',
			'byModel'
		)
		// Named --export, not --output: a global `--output <format>` option
		// (choices markdown/json/yaml) is registered on the root program, and
		// silently wins over a same-named subcommand-local option — a real
		// path here always errored "Allowed choices are markdown, json, yaml"
		// before this action handler ever ran, live-verified against the
		// actual CLI.
		.option('--export <path>', 'Write report to file path')
		.action((options: Record<string, unknown>) => {
			const color = getColorAdapter();
			try {
				runUsageAction(options);
			} catch (error) {
				console.error(color.red('Failed to retrieve usage data:'), formatError(error as Error));
				process.exit(1);
			}
		});
	return usageCmd;
}

function emitReport(content: string, outputPath: string | undefined, color: ReturnType<typeof getColorAdapter>): void {
	if (outputPath) {
		writeOutput(content, outputPath, color);
	} else {
		console.log(content);
	}
}

function renderAllSections(summary: UsageSummary, topN: number, color: ReturnType<typeof getColorAdapter>): void {
	displaySummary(summary, color);
	displayModelBreakdown(summary.byModel, topN, color);
	displayCommandBreakdown(summary.byCommand, topN, color);
	displayActivityBreakdown(summary.byActivity, topN, color);
	displaySessionBreakdown(summary.bySession, 5, color);
	displayProjectBreakdown(summary.byProject, topN, color);
	displayCostliestRequests(summary.costliestRequests, topN, color);
	displayDailyBreakdown(summary.daily, color);
}

function renderTableOutput(summary: UsageSummary, flags: TableFlags, color: ReturnType<typeof getColorAdapter>): void {
	const { byActivity, byAgent, byCommand, byModel, byProject, bySession, daily, topN } = flags;
	const showAll = [byActivity, byAgent, byCommand, byModel, byProject, bySession, daily].every((f) => !f);

	if (showAll) {
		renderAllSections(summary, topN, color);
		return;
	}

	if (byModel) displayModelBreakdown(summary.byModel, topN, color);
	if (byCommand) displayCommandBreakdown(summary.byCommand, topN, color);
	if (byActivity) displayActivityBreakdown(summary.byActivity, topN, color);
	if (bySession) displaySessionBreakdown(summary.bySession, topN, color);
	if (byProject) displayProjectBreakdown(summary.byProject, topN, color);
	if (byAgent) displayAgentBreakdown(summary.byAgent, topN, color);
	if (daily) displayDailyBreakdown(summary.daily, color);
}

function runUsageAction(options: Record<string, unknown>): void {
	const color = getColorAdapter();
	const analytics = getUsageAnalytics();

	const since = options['since'] as string | undefined;
	const sinceDaysRaw = options['sinceDays'] as string | undefined;
	const sinceDays = sinceDaysRaw ? parseInt(sinceDaysRaw, 10) : undefined;

	const opts: UsageAnalyticsOptions = {
		activity: options['activity'] as string | undefined,
		agent: options['agent'] as string | undefined,
		command: options['command'] as string | undefined,
		model: options['model'] as string | undefined,
		project: options['project'] as string | undefined,
		session: options['session'] as string | undefined,
		sinceDate: since,
		sinceDays: since ? undefined : sinceDays
	};

	const topN = options['top'] ? parseInt(options['top'] as string, 10) : 10;
	const fmt = (options['format'] as string | undefined) ?? 'table';
	const rawExportPath = options['export'] as string | undefined;
	const outputPath = rawExportPath ? InputValidator.validatePath(rawExportPath, process.cwd()) : undefined;

	const formatActions: Record<string, () => void> = {
		csv: () => {
			const csvSection = (options['csvSection'] as CsvSection | undefined) ?? 'byModel';
			emitReport(analytics.generateCsvReport({ ...opts, section: csvSection }), outputPath, color);
		},
		json: () => emitReport(analytics.generateJsonReport(opts), outputPath, color),
		markdown: () => emitReport(analytics.generateMarkdownReport(opts), outputPath, color),
		table: () => {
			const byModel = options['byModel'] === true;
			const byCommand = options['byCommand'] === true;
			const byActivity = options['byActivity'] === true;
			const bySession = options['bySession'] === true;
			const byProject = options['byProject'] === true;
			const byAgent = options['byAgent'] === true;
			const daily = options['daily'] === true;
			const summary = analytics.analyze(opts);
			renderTableOutput(summary, { byActivity, byAgent, byCommand, byModel, byProject, bySession, daily, topN }, color);
			console.log('');
		}
	};

	(formatActions[fmt] ?? formatActions['table']!)();
}
