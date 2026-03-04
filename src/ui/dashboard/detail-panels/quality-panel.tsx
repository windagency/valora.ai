/**
 * Quality Panel - Per-command quality metrics
 */

import type { QualityMetrics, Session, SessionCommand } from 'types/session.types';

import { Sparkline } from 'exploration/dashboard-metrics';
import React from 'react';
import { getTUIAdapter } from 'ui/tui-adapter.interface';

const tui = getTUIAdapter();
// eslint-disable-next-line @typescript-eslint/naming-convention -- Box and Text are React components which require PascalCase
const { Box, Text } = tui;

interface QualityAggregates {
	avgReview: number;
	reviewScoreCount: number;
	reviewScores: number[];
	testRate: number;
	testTotalCount: number;
	totalAutoFixes: number;
	totalFilesGenerated: number;
}

// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
export function QualityPanel({ session }: { session: Session }): React.JSX.Element {
	const commandsWithMetrics = session.commands.filter((cmd) => cmd.quality_metrics);

	if (commandsWithMetrics.length === 0) {
		return (
			<Box borderColor="white" borderStyle="round" flexDirection="column" marginBottom={1} paddingX={1}>
				<Text bold color="cyan">
					Quality Metrics
				</Text>
				<Text dimColor>No quality metrics recorded</Text>
			</Box>
		);
	}

	const agg = aggregateQualityMetrics(commandsWithMetrics);

	return (
		<Box borderColor="white" borderStyle="round" flexDirection="column" marginBottom={1} paddingX={1}>
			<Text bold color="cyan">
				Quality Metrics ({commandsWithMetrics.length} commands)
			</Text>
			<Box flexDirection="column" marginTop={1}>
				{commandsWithMetrics
					.slice(-10)
					.reverse()
					.map((cmd, index) => (
						<QualityRow cmd={cmd} key={index} m={cmd.quality_metrics!} />
					))}
			</Box>

			{agg.reviewScores.length > 1 && (
				<Box flexDirection="column" marginTop={1}>
					<Text dimColor>Review Score Trend:</Text>
					<Sparkline color="green" data={agg.reviewScores} height={3} width={30} />
				</Box>
			)}

			<QualitySummary agg={agg} />
		</Box>
	);
}

function aggregateQualityMetrics(commands: SessionCommand[]): QualityAggregates {
	let totalAutoFixes = 0;
	let totalFilesGenerated = 0;
	let testPassCount = 0;
	let testTotalCount = 0;
	let reviewScoreSum = 0;
	let reviewScoreCount = 0;
	const reviewScores: number[] = [];

	for (const cmd of commands) {
		const m = cmd.quality_metrics!;
		totalAutoFixes += m.auto_fixes_applied ?? 0;
		totalFilesGenerated += m.files_generated ?? 0;
		if (m.test_passes != null) {
			testPassCount += m.test_passes;
			testTotalCount += m.test_passes;
		}
		if (m.test_failures != null) testTotalCount += m.test_failures;
		if (m.review_score != null) {
			reviewScoreSum += m.review_score;
			reviewScoreCount++;
			reviewScores.push(m.review_score);
		}
	}

	return {
		avgReview: reviewScoreCount > 0 ? reviewScoreSum / reviewScoreCount : 0,
		reviewScoreCount,
		reviewScores,
		testRate: testTotalCount > 0 ? testPassCount / testTotalCount : 0,
		testTotalCount,
		totalAutoFixes,
		totalFilesGenerated
	};
}

function getScoreColor(score: number): string {
	if (score >= 80) return 'green';
	if (score >= 60) return 'yellow';
	return 'red';
}

function getTestPassColor(testTotalCount: number, testRate: number): string {
	if (testTotalCount === 0) return 'white';
	return testRate >= 0.9 ? 'green' : 'yellow';
}

// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
function QualityCodeInfo({ m }: { m: QualityMetrics }): React.JSX.Element {
	return (
		<Box>
			<QualityLintInfo m={m} />
			<QualityTestInfo m={m} />
		</Box>
	);
}

// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
function QualityLintInfo({ m }: { m: QualityMetrics }): React.JSX.Element {
	const lintTotal = (m.lint_errors_assert ?? 0) + (m.lint_errors_realtime ?? 0);

	return (
		<>
			{(m.lint_errors_assert != null || m.lint_errors_realtime != null) && (
				<>
					<Text dimColor> Lint: </Text>
					<Text color={lintTotal > 0 ? 'yellow' : 'green'}>
						{m.lint_errors_assert ?? 0}a/{m.lint_errors_realtime ?? 0}r
					</Text>
				</>
			)}
			{m.auto_fixes_applied != null && m.auto_fixes_applied > 0 && (
				<>
					<Text dimColor> Fixes: </Text>
					<Text color="green">{m.auto_fixes_applied}</Text>
				</>
			)}
		</>
	);
}

// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
function QualityPlanInfo({ m }: { m: QualityMetrics }): React.JSX.Element {
	return (
		<Box>
			{m.iterations != null && (
				<>
					<Text dimColor> Iterations: </Text>
					<Text>{m.iterations}</Text>
				</>
			)}
			{m.plan_approved != null && (
				<>
					<Text dimColor> Plan: </Text>
					<Text color={m.plan_approved ? 'green' : 'red'}>{m.plan_approved ? 'Approved' : 'Rejected'}</Text>
				</>
			)}
			{m.files_generated != null && m.files_generated > 0 && (
				<>
					<Text dimColor> Files: </Text>
					<Text>{m.files_generated}</Text>
				</>
			)}
		</Box>
	);
}

// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
function QualityRow({ cmd, m }: { cmd: SessionCommand; m: QualityMetrics }): React.JSX.Element {
	return (
		<Box flexDirection="column" marginBottom={1}>
			<Box>
				<Text color={cmd.success ? 'green' : 'red'}>{cmd.success ? '✓' : '✗'}</Text>
				<Text bold> {cmd.command}</Text>
			</Box>
			<QualityPlanInfo m={m} />
			<QualityCodeInfo m={m} />
		</Box>
	);
}

// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
function QualitySummary({ agg }: { agg: QualityAggregates }): React.JSX.Element {
	return (
		<Box borderColor="cyan" borderStyle="round" flexDirection="column" paddingX={1}>
			<Text bold color="cyan">
				Summary
			</Text>
			<Box>
				<Text dimColor>Avg Review: </Text>
				<Text bold color={agg.avgReview >= 80 ? 'green' : 'yellow'}>
					{agg.reviewScoreCount > 0 ? agg.avgReview.toFixed(0) : 'N/A'}
				</Text>
				<Text dimColor> Auto-Fixes: </Text>
				<Text bold>{agg.totalAutoFixes}</Text>
				<Text dimColor> Test Pass: </Text>
				<Text bold color={getTestPassColor(agg.testTotalCount, agg.testRate)}>
					{agg.testTotalCount > 0 ? `${(agg.testRate * 100).toFixed(0)}%` : 'N/A'}
				</Text>
				<Text dimColor> Files: </Text>
				<Text bold>{agg.totalFilesGenerated}</Text>
			</Box>
		</Box>
	);
}

// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
function QualityTestInfo({ m }: { m: QualityMetrics }): React.JSX.Element {
	return (
		<>
			{(m.test_passes != null || m.test_failures != null) && (
				<>
					<Text dimColor> Tests: </Text>
					<Text color={(m.test_failures ?? 0) > 0 ? 'red' : 'green'}>
						{m.test_passes ?? 0}p/{m.test_failures ?? 0}f
					</Text>
				</>
			)}
			{m.review_score != null && (
				<>
					<Text dimColor> Score: </Text>
					<Text bold color={getScoreColor(m.review_score)}>
						{m.review_score}
					</Text>
				</>
			)}
		</>
	);
}
