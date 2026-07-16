/**
 * Confidence calibration report subcommand for the monitoring CLI command
 *
 * Shows, empirically, whether the escalation pipeline's self-reported LLM
 * confidence correlates with what a human actually decided about it.
 */

import { writeFileSync } from 'fs';
import { getCommandGuard } from 'security/command-guard';

import type { CommandAdapter } from 'cli/command-adapter.interface';

import { getColorAdapter } from 'output/color-adapter.interface';
import {
	type ConfidenceBucketSummary,
	type ConfidenceCalibrationOptions,
	type ConfidenceCalibrationSummary,
	getConfidenceCalibrationAnalytics,
	type TriggeredCriterionSummary
} from 'utils/confidence-calibration-analytics';
import { formatError } from 'utils/error-handler';
import { InputValidator } from 'utils/input-validator';

export function configureConfidenceReportSubcommand(monitoringCmd: CommandAdapter): CommandAdapter {
	return (
		monitoringCmd
			.command('confidence-report')
			.description('Show empirical calibration of escalation confidence vs. human decisions')
			.option('--since <date>', 'Filter records since date (ISO 8601)')
			.option('--stage <name>', 'Filter to a single stage')
			.option('--format <fmt>', 'Output format (json|table|markdown)', 'table')
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
					runConfidenceReportAction(options);
				} catch (error) {
					console.error(color.red('Failed to retrieve confidence calibration data:'), formatError(error as Error));
					process.exit(1);
				}
			})
	);
}

function displayBucketTable(buckets: ConfidenceBucketSummary[], color: ReturnType<typeof getColorAdapter>): void {
	console.log(`\n${color.magenta('📊 By confidence bucket')}`);
	console.log('═'.repeat(70));
	console.log(
		`  ${'Bucket'.padEnd(10)} ${'Total'.padStart(6)}  ${'Abort'.padStart(6)}  ${'Modify'.padStart(6)}  ${'Proceed'.padStart(7)}`
	);
	console.log('  ' + '─'.repeat(50));
	for (const b of buckets) {
		console.log(
			`  ${b.label.padEnd(10)} ${String(b.totalCount).padStart(6)}  ${String(b.abortCount).padStart(6)}  ${String(b.modifyCount).padStart(6)}  ${String(b.proceedCount).padStart(7)}`
		);
	}
}

function displayCriteriaTable(criteria: TriggeredCriterionSummary[], color: ReturnType<typeof getColorAdapter>): void {
	console.log(`\n${color.magenta('🎯 By triggered criterion')}`);
	console.log('═'.repeat(70));
	if (criteria.length === 0) {
		console.log(color.dim('  No escalations recorded yet.'));
		return;
	}
	for (const c of criteria) {
		console.log(`  ${String(c.count).padStart(4)}  ${c.criterion}`);
	}
}

function emitReport(content: string, outputPath: string | undefined, color: ReturnType<typeof getColorAdapter>): void {
	if (outputPath) {
		writeFileSync(outputPath, content, 'utf8');
		console.log(color.green(`✅ Report written to ${outputPath}`));
	} else {
		console.log(content);
	}
}

function renderTableOutput(summary: ConfidenceCalibrationSummary, color: ReturnType<typeof getColorAdapter>): void {
	console.log(`\n${color.bold('Confidence Calibration Report')}`);
	console.log(`Period: ${summary.period.from ?? 'n/a'} → ${summary.period.to ?? 'n/a'}`);
	console.log(`Total escalations: ${summary.totalEscalations}`);
	displayBucketTable(summary.byConfidenceBucket, color);
	displayCriteriaTable(summary.byTriggeredCriterion, color);
	console.log('');
}

function runConfidenceReportAction(options: Record<string, unknown>): void {
	const color = getColorAdapter();
	const analytics = getConfidenceCalibrationAnalytics();

	const opts: ConfidenceCalibrationOptions = {
		sinceDate: options['since'] as string | undefined,
		stage: options['stage'] as string | undefined
	};

	const fmt = (options['format'] as string | undefined) ?? 'table';
	const rawExportPath = options['export'] as string | undefined;
	const outputPath = rawExportPath ? InputValidator.validatePath(rawExportPath, process.cwd()) : undefined;
	if (outputPath && getCommandGuard().isProtectedInfrastructureTarget(outputPath)) {
		throw new Error('Invalid --export path: targets a protected security-infrastructure file');
	}

	const formatActions: Record<string, () => void> = {
		json: () => emitReport(analytics.generateJsonReport(opts), outputPath, color),
		markdown: () => emitReport(analytics.generateMarkdownReport(opts), outputPath, color),
		table: () => renderTableOutput(analytics.analyze(opts), color)
	};

	(formatActions[fmt] ?? formatActions['table']!)();
}
