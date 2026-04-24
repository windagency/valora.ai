/**
 * Usage Optimize subcommand — scans spending history for actionable waste patterns.
 *
 * Each detector is a pure function over the full spending ledger. Output is ranked
 * by urgency (estimated dollar savings), so the user can address the highest-value
 * issues first.
 */

import type { CommandAdapter } from 'cli/command-adapter.interface';

import { getMCPAuditLogger, type MCPAuditLoggerService } from 'mcp/mcp-audit-logger.service';
import { getColorAdapter } from 'output/color-adapter.interface';
import {
	type AgentSelectionAnalyticsService,
	getAgentSelectionAnalytics
} from 'services/agent-selection-analytics.service';
import { formatError } from 'utils/error-handler';
import { getUsageAnalytics, type UsageAnalytics } from 'utils/usage-analytics';

export interface OptimizeFinding {
	details: string;
	detectorId: string;
	estimatedSavingsUsd: number;
	suggestedAction: string;
	title: string;
	urgency: OptimizeUrgency;
}

export type OptimizeUrgency = 'high' | 'low' | 'medium';

// ─── Detector helpers ──────────────────────────────────────────────────────────

function median(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

// ─── OptimizeScanner ──────────────────────────────────────────────────────────

export class OptimizeScanner {
	constructor(
		private readonly analytics: UsageAnalytics,
		private readonly agentAnalytics: AgentSelectionAnalyticsService = getAgentSelectionAnalytics(),
		private readonly mcpAuditLogger: MCPAuditLoggerService = getMCPAuditLogger()
	) {}

	scan(): OptimizeFinding[] {
		const records = this.analytics['tracker'].getRecords();
		const findings: OptimizeFinding[] = [];

		findings.push(...this.detectUnknownModelPricing(records));
		findings.push(...this.detectUnderutilisedCache(records));
		findings.push(...this.detectHighIterationCommands(records));
		findings.push(...this.detectProgressiveDisclosureThrash(records));
		findings.push(...this.detectAgentMisrouting(records));
		findings.push(...this.detectFlakyMCPTools());

		const urgencyOrder: Record<OptimizeUrgency, number> = { high: 0, low: 2, medium: 1 };
		return findings.sort(
			(a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency] || b.estimatedSavingsUsd - a.estimatedSavingsUsd
		);
	}

	private detectAgentMisrouting(
		records: ReturnType<(typeof this.analytics)['tracker']['getRecords']>
	): OptimizeFinding[] {
		const metrics = this.agentAnalytics.getMetrics();
		if (metrics.totalSelections < 5) return [];

		const combinedRate = metrics.fallbackRate + metrics.manualOverrideRate;
		if (combinedRate <= 0.2) return [];

		const totalCost = records.reduce((s, r) => s + r.costUsd, 0);
		const estimatedSavingsUsd = totalCost * combinedRate * 0.5;

		return [
			{
				details: `Agent selection has a combined fallback + manual-override rate of ${(combinedRate * 100).toFixed(1)}% across ${metrics.totalSelections} selections (threshold: 20%). Fallback: ${(metrics.fallbackRate * 100).toFixed(1)}%, manual override: ${(metrics.manualOverrideRate * 100).toFixed(1)}%.`,
				detectorId: 'agent-misrouting',
				estimatedSavingsUsd,
				suggestedAction:
					'Tighten agent capabilities in data/agents/registry.json: improve domain matching criteria and add task-domain hints to commands that frequently fall back.',
				title: `High agent mis-routing rate (${(combinedRate * 100).toFixed(1)}%)`,
				urgency: combinedRate > 0.3 ? 'high' : 'medium'
			}
		];
	}

	private detectFlakyMCPTools(): OptimizeFinding[] {
		const metrics = this.mcpAuditLogger.getDashboardMetrics();
		return metrics.servers.flatMap((server) =>
			server.toolBreakdown
				.filter((tool) => tool.calls >= 10 && tool.successRate < 0.9)
				.map((tool) => {
					const failureRate = 1 - tool.successRate;
					return {
						details: `Tool "${tool.toolName}" on server "${server.serverId}" has a ${(failureRate * 100).toFixed(1)}% failure rate across ${tool.calls} calls (threshold: 10%).`,
						detectorId: 'flaky-mcp-tool',
						estimatedSavingsUsd: 0,
						suggestedAction: `Investigate tool "${tool.toolName}" on server "${server.serverId}": isolate the failure causes, add retries for transient errors, or replace with a more reliable implementation.`,
						title: `Flaky MCP tool: "${tool.toolName}" on server "${server.serverId}"`,
						urgency: tool.successRate < 0.7 ? ('high' as const) : ('medium' as const)
					} satisfies OptimizeFinding;
				})
		);
	}

	private detectHighIterationCommands(
		records: ReturnType<(typeof this.analytics)['tracker']['getRecords']>
	): OptimizeFinding[] {
		const withIterations = records.filter((r) => r.iterations !== undefined);
		if (withIterations.length === 0) return [];

		const overallMedian = median(withIterations.map((r) => r.iterations!));

		const byCommand = new Map<string, typeof withIterations>();
		for (const r of withIterations) {
			const list = byCommand.get(r.command) ?? [];
			list.push(r);
			byCommand.set(r.command, list);
		}

		const findings: OptimizeFinding[] = [];

		for (const [command, recs] of byCommand) {
			const iterations = recs.map((r) => r.iterations!);
			if (iterations.length < 2) continue;
			const cmdMedian = median(iterations);
			if (cmdMedian > 2 && cmdMedian > overallMedian) {
				const avgCost = recs.reduce((s, r) => s + r.costUsd, 0) / recs.length;
				const estimatedSavingsUsd = avgCost * (cmdMedian - 1) * 0.5;
				findings.push({
					details: `"${command}" has a median of ${cmdMedian.toFixed(1)} stage iterations (overall median: ${overallMedian.toFixed(1)}). High stage counts indicate the command may be doing too much work per run or that its prompt pipeline needs refinement.`,
					detectorId: 'high-iteration-command',
					estimatedSavingsUsd,
					suggestedAction: `Review the "${command}" prompt pipeline for opportunities to reduce stage count: enable early-exit conditions, split into smaller focused commands, or improve the lead-agent selection criteria.`,
					title: `High stage iteration count for command "${command}"`,
					urgency: 'medium'
				});
			}
		}

		return findings;
	}

	private detectProgressiveDisclosureThrash(
		records: ReturnType<(typeof this.analytics)['tracker']['getRecords']>
	): OptimizeFinding[] {
		const withPD = records.filter((r) => r.progressiveDisclosureCalls !== undefined);
		if (withPD.length === 0) return [];

		const byCommand = new Map<string, typeof withPD>();
		for (const r of withPD) {
			const list = byCommand.get(r.command) ?? [];
			list.push(r);
			byCommand.set(r.command, list);
		}

		const findings: OptimizeFinding[] = [];

		for (const [command, recs] of byCommand) {
			if (recs.length < 2) continue;
			const thrashing = recs.filter((r) => r.progressiveDisclosureCalls! > 3 && (r.contextSavingsPercent ?? 100) < 10);
			if (thrashing.length / recs.length >= 0.5) {
				const estimatedSavingsUsd = thrashing.reduce((s, r) => s + r.costUsd * 0.3, 0);
				findings.push({
					details: `"${command}" shows progressive-disclosure thrash in ${thrashing.length} of ${recs.length} runs: high call count (>3) but context savings below 10%.`,
					detectorId: 'progressive-disclosure-thrash',
					estimatedSavingsUsd,
					suggestedAction: `Review the "${command}" prompt pipeline for early-exit heuristics that can reduce progressive-disclosure iterations when context savings are low.`,
					title: `Progressive-disclosure thrash in command "${command}"`,
					urgency: estimatedSavingsUsd > 0.05 ? 'high' : 'medium'
				});
			}
		}

		return findings;
	}

	private detectUnderutilisedCache(
		records: ReturnType<(typeof this.analytics)['tracker']['getRecords']>
	): OptimizeFinding[] {
		const byCommand = new Map<string, typeof records>();
		for (const r of records) {
			const list = byCommand.get(r.command) ?? [];
			list.push(r);
			byCommand.set(r.command, list);
		}

		const findings: OptimizeFinding[] = [];

		for (const [command, recs] of byCommand) {
			if (recs.length < 3) continue;

			const totalCost = recs.reduce((s, r) => s + r.costUsd, 0);
			const totalSavings = recs.reduce((s, r) => s + r.cacheSavingsUsd, 0);
			const ratio = totalCost > 0 ? totalSavings / totalCost : 0;

			if (ratio < 0.05) {
				const potentialSavings = totalCost * 0.15;
				findings.push({
					details: `"${command}" ran ${recs.length} time(s) with only ${(ratio * 100).toFixed(1)}% of cost covered by cache savings (threshold: 5%). Total cost: $${totalCost.toFixed(4)}.`,
					detectorId: 'under-utilised-cache',
					estimatedSavingsUsd: potentialSavings,
					suggestedAction: `Pin the stable portion of the "${command}" system prompt at the start of the context to maximise cache hits across repeated runs.`,
					title: `Under-utilised prompt cache for command "${command}"`,
					urgency: potentialSavings > 0.05 ? 'high' : 'medium'
				});
			}
		}

		return findings;
	}

	private detectUnknownModelPricing(
		records: ReturnType<(typeof this.analytics)['tracker']['getRecords']>
	): OptimizeFinding[] {
		const unknown = records.filter((r) => r.unknownModelPricing);
		if (unknown.length === 0) return [];

		const commandSet = new Set(unknown.map((r) => r.command));
		const modelSet = new Set(unknown.map((r) => r.model));
		const rate = (unknown.length / records.length) * 100;

		return [
			{
				details: `${unknown.length} request(s) (${rate.toFixed(1)}%) were billed at $0 due to unrecognised model names. Affected commands: ${[...commandSet].join(', ')}. Unrecognised models: ${[...modelSet].join(', ')}.`,
				detectorId: 'unknown-model-pricing',
				estimatedSavingsUsd: 0,
				suggestedAction:
					'Add the model names to the cost-calculator pricing table so Valora can accurately report actual spend.',
				title: 'Unknown model pricing — actual costs may be under-reported',
				urgency: 'medium'
			}
		];
	}
}

// ─── CLI subcommand configurator ──────────────────────────────────────────────

export function configureUsageOptimizeSubcommand(usageCmd: CommandAdapter): void {
	usageCmd
		.command('optimize')
		.description('Scan spending history for actionable waste patterns and cost-saving opportunities')
		.option('--since-days <n>', 'Analyse last N days of usage', '30')
		.option('--min-savings <usd>', 'Show only findings with estimated savings above this amount', '0')
		.action((options: Record<string, unknown>) => {
			const color = getColorAdapter();
			try {
				runOptimizeAction(options, color);
			} catch (error) {
				console.error(color.red('Failed to run optimize scan:'), formatError(error as Error));
				process.exit(1);
			}
		});
}

function runOptimizeAction(options: Record<string, unknown>, color: ReturnType<typeof getColorAdapter>): void {
	const scanner = new OptimizeScanner(getUsageAnalytics(), getAgentSelectionAnalytics(), getMCPAuditLogger());
	const findings = scanner.scan();

	const minSavings = parseFloat((options['minSavings'] as string | undefined) ?? '0');
	const filtered = findings.filter((f) => f.estimatedSavingsUsd >= minSavings);

	if (filtered.length === 0) {
		console.log(color.green('✅ No waste patterns detected. Your Valora usage looks efficient!'));
		return;
	}

	console.log(`\n${color.yellow('⚡ Valora Usage Optimizer')}`);
	console.log('═'.repeat(70));
	console.log(color.dim(`${filtered.length} finding(s) found. Sorted by urgency then estimated savings.\n`));

	const urgencyColor: Record<OptimizeUrgency, (s: string) => string> = {
		high: (s) => color.red(s),
		low: (s) => color.dim(s),
		medium: (s) => color.yellow(s)
	};
	const urgencyIcon: Record<OptimizeUrgency, string> = { high: '🔴', low: '🟢', medium: '🟡' };

	for (const [i, f] of filtered.entries()) {
		const savingsStr =
			f.estimatedSavingsUsd > 0
				? ` (est. savings: $${f.estimatedSavingsUsd.toFixed(4)})`
				: ' (risk: under-reported costs)';
		console.log(`${urgencyIcon[f.urgency]} ${urgencyColor[f.urgency](f.title)}${color.dim(savingsStr)}`);
		console.log(`   ${color.dim(f.details)}`);
		console.log(`   ${color.cyan('→')} ${f.suggestedAction}`);
		if (i < filtered.length - 1) console.log('');
	}

	console.log('');
}
