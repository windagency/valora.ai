/**
 * Optimisation Panel - Per-command optimisation metrics
 */

import React from 'react';

import type { OptimizationMetrics, Session, SessionCommand } from 'types/session.types';

import { getTUIAdapter } from 'ui/tui-adapter.interface';

const tui = getTUIAdapter();
// eslint-disable-next-line @typescript-eslint/naming-convention -- Box and Text are React components which require PascalCase
const { Box, Text } = tui;

// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
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
			</Box>
		</Box>
	);
}

function getComplexityColor(score: number): string {
	if (score > 7) return 'red';
	if (score > 4) return 'yellow';
	return 'green';
}

// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
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

// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
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

// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
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
