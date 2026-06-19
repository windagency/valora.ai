/**
 * Optimisation Panel - Per-command optimisation metrics
 */

import React from 'react';

import type { OptimizationMetrics, Session, SessionCommand } from 'types/session.types';

import { getTUIAdapter } from 'ui/tui-adapter.interface';
import { getMetricsCollector } from 'utils/metrics-collector';

const tui = getTUIAdapter();

const { Box, Text } = tui;

export function OptimizationPanel({ session }: { session: Session }): React.JSX.Element {
	const commandsWithMetrics = session.commands.filter((cmd) => cmd.optimization_metrics);

	if (commandsWithMetrics.length === 0) {
		return (
			<Box borderColor="white" borderStyle="round" flexDirection="column" marginBottom={1} paddingX={1}>
				<Text bold color="cyan">
					Optimisation Metrics
				</Text>
				<Text dimColor>No optimisation metrics recorded</Text>
			</Box>
		);
	}

	let totalTimeSaved = 0;
	let patternCount = 0;
	let earlyExitCount = 0;
	let complexitySum = 0;
	let complexityCount = 0;

	for (const cmd of commandsWithMetrics) {
		const m = cmd.optimization_metrics!;
		totalTimeSaved += m.time_saved_minutes ?? 0;
		if (m.pattern_detected) patternCount++;
		if (m.early_exit_triggered) earlyExitCount++;
		if (m.complexity_score != null) {
			complexitySum += m.complexity_score;
			complexityCount++;
		}
	}

	return (
		<Box borderColor="white" borderStyle="round" flexDirection="column" marginBottom={1} paddingX={1}>
			<Text bold color="cyan">
				Optimisation Metrics ({commandsWithMetrics.length} commands)
			</Text>
			<Box flexDirection="column" marginTop={1}>
				{commandsWithMetrics
					.slice(-10)
					.reverse()
					.map((cmd, index) => (
						<OptimizationRow cmd={cmd} key={index} m={cmd.optimization_metrics!} />
					))}
			</Box>
			<Box borderColor="cyan" borderStyle="round" flexDirection="column" paddingX={1}>
				<Text bold color="cyan">
					Summary
				</Text>
				<Box>
					<Text dimColor>Time Saved: </Text>
					<Text bold color="green">
						{totalTimeSaved.toFixed(1)}m
					</Text>
					<Text dimColor> Pattern Rate: </Text>
					<Text bold>{((patternCount / commandsWithMetrics.length) * 100).toFixed(0)}%</Text>
					<Text dimColor> Early Exit Rate: </Text>
					<Text bold>{((earlyExitCount / commandsWithMetrics.length) * 100).toFixed(0)}%</Text>
					{complexityCount > 0 && (
						<>
							<Text dimColor> Avg Complexity: </Text>
							<Text bold>{(complexitySum / complexityCount).toFixed(1)}</Text>
						</>
					)}
				</Box>
				<CompressionStatsRows />
			</Box>
		</Box>
	);
}

function CompressionHistoryRow({ dedup, pruned }: { dedup: number; pruned: number }): null | React.JSX.Element {
	if (pruned === 0 && dedup === 0) return null;
	return (
		<Box>
			<Text dimColor>History: </Text>
			<Text bold>{pruned} tool results pruned</Text>
			<Text dimColor>, </Text>
			<Text bold>{dedup} deduplicated</Text>
		</Box>
	);
}

function CompressionOutputRow({
	ratioPct,
	savedCostUsd,
	savedTokens
}: {
	ratioPct: null | number;
	savedCostUsd: number;
	savedTokens: number;
}): null | React.JSX.Element {
	if (ratioPct === null && savedTokens === 0) return null;
	return (
		<Box>
			<Text dimColor>Output compression: </Text>
			<Text bold color="green">
				{ratioPct !== null ? `${ratioPct}%` : '—'} saved
			</Text>
			{savedTokens > 0 && (
				<Text dimColor>
					{' '}
					(~{(savedTokens / 1000).toFixed(1)}k tokens, ~${savedCostUsd.toFixed(4)})
				</Text>
			)}
		</Box>
	);
}

function CompressionStatsRows(): React.JSX.Element {
	const snapshot = getMetricsCollector().getSnapshot();
	const ratioGauge = snapshot.gauges.find((g) => g.name === 'compression.terminal.ratio');
	const savedTokens = snapshot.gauges.find((g) => g.name === 'compression.terminal.estimated_saved_tokens')?.value ?? 0;
	const savedCostUsd =
		snapshot.gauges.find((g) => g.name === 'compression.terminal.estimated_saved_cost_usd')?.value ?? 0;
	const prunedMessages = snapshot.counters.find((c) => c.name === 'compression.history.pruned_messages')?.value ?? 0;
	const dedupHits = snapshot.counters.find((c) => c.name === 'compression.dedup.hits')?.value ?? 0;
	const ratioPct = ratioGauge ? Math.round(ratioGauge.value * 100) : null;
	return (
		<>
			<CompressionOutputRow ratioPct={ratioPct} savedCostUsd={savedCostUsd} savedTokens={savedTokens} />
			<CompressionHistoryRow dedup={dedupHits} pruned={prunedMessages} />
		</>
	);
}

function getComplexityColor(score: number): string {
	if (score > 7) return 'red';
	if (score > 4) return 'yellow';
	return 'green';
}

function OptimizationDetailsRow({ m }: { m: OptimizationMetrics }): React.JSX.Element {
	return (
		<Box>
			{m.complexity_score != null && (
				<>
					<Text dimColor> Complexity: </Text>
					<Text color={getComplexityColor(m.complexity_score)}>{m.complexity_score.toFixed(1)}/10</Text>
				</>
			)}
			{m.early_exit_triggered && (
				<>
					<Text dimColor> Early Exit: </Text>
					<Text color="green">Yes</Text>
					{m.early_exit_confidence != null && <Text dimColor> ({m.early_exit_confidence.toFixed(1)})</Text>}
				</>
			)}
			{m.time_saved_minutes != null && m.time_saved_minutes > 0 && (
				<>
					<Text dimColor> Saved: </Text>
					<Text color="green">{m.time_saved_minutes.toFixed(1)}m</Text>
				</>
			)}
		</Box>
	);
}

function OptimizationModeRow({ m }: { m: OptimizationMetrics }): React.JSX.Element {
	return (
		<Box>
			<Text dimColor> Mode: </Text>
			<Text color="cyan">{m.planning_mode ?? 'standard'}</Text>
			{m.pattern_detected && (
				<>
					<Text dimColor> Pattern: </Text>
					<Text color="yellow">{m.pattern_detected}</Text>
					{m.pattern_confidence != null && <Text dimColor> ({(m.pattern_confidence * 100).toFixed(0)}%)</Text>}
				</>
			)}
		</Box>
	);
}

function OptimizationRow({ cmd, m }: { cmd: SessionCommand; m: OptimizationMetrics }): React.JSX.Element {
	return (
		<Box flexDirection="column" marginBottom={1}>
			<Box>
				<Text color={cmd.success ? 'green' : 'red'}>{cmd.success ? '✓' : '✗'}</Text>
				<Text bold> {cmd.command}</Text>
			</Box>
			<OptimizationModeRow m={m} />
			<OptimizationDetailsRow m={m} />
			{m.template_used && (
				<Box>
					<Text dimColor> Template: </Text>
					<Text>{m.template_used}</Text>
				</Box>
			)}
		</Box>
	);
}
