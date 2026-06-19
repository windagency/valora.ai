/**
 * Agent Analytics View - Agent selection data distributions and success metrics
 */

import React from 'react';

import type { AgentSelectionMetrics } from 'services/agent-selection-analytics.service';
import type { AgentAnalyticsData } from 'ui/dashboard/hooks/use-metrics-data';

import { getTUIAdapter } from 'ui/tui-adapter.interface';

const tui = getTUIAdapter();

const { Box, Text } = tui;

export function AgentAnalyticsView({ data }: { data: AgentAnalyticsData }): React.JSX.Element {
	if (!data.metrics || data.metrics.totalSelections === 0) {
		return (
			<Box borderColor="white" borderStyle="round" flexDirection="column" paddingX={1}>
				<Text bold color="cyan">
					Agent Analytics
				</Text>
				<Text dimColor>No events — agent analytics populate when dynamic agent selection is active</Text>
			</Box>
		);
	}

	const { metrics, successMetrics } = data;

	return (
		<Box flexDirection="column">
			<SummaryHeader metrics={metrics} />

			<Box flexGrow={1} marginTop={1}>
				<Box flexDirection="column" width="50%">
					<Box borderColor="green" borderStyle="round" flexDirection="column" paddingX={1}>
						<Text bold color="green">
							Agent Distribution
						</Text>
						<Box flexDirection="column" marginTop={1}>
							{renderDistribution(metrics.agentDistribution, 'green')}
						</Box>
					</Box>

					{Object.keys(metrics.commandDistribution).length > 0 && (
						<Box borderColor="yellow" borderStyle="round" flexDirection="column" marginTop={1} paddingX={1}>
							<Text bold color="yellow">
								Command Distribution
							</Text>
							<Box flexDirection="column" marginTop={1}>
								{renderDistribution(metrics.commandDistribution, 'yellow')}
							</Box>
						</Box>
					)}
				</Box>

				<Box flexDirection="column" marginLeft={1} width="50%">
					{Object.keys(metrics.reasonDistribution).length > 0 && (
						<Box borderColor="magenta" borderStyle="round" flexDirection="column" paddingX={1}>
							<Text bold color="magenta">
								Selection Reasons
							</Text>
							<Box flexDirection="column" marginTop={1}>
								{renderDistribution(metrics.reasonDistribution, 'magenta')}
							</Box>
						</Box>
					)}

					{successMetrics && (
						<Box borderColor="cyan" borderStyle="round" flexDirection="column" marginTop={1} paddingX={1}>
							<Text bold color="cyan">
								Success Metrics (7d)
							</Text>
							<Box flexDirection="column" marginTop={1}>
								<Box>
									<Text dimColor>Accuracy: </Text>
									<Text bold color={rateColor(successMetrics.accuracy, 0.85)}>
										{(successMetrics.accuracy * 100).toFixed(1)}%
									</Text>
								</Box>
								<Box>
									<Text dimColor>Completion: </Text>
									<Text bold color={rateColor(successMetrics.completionRate, 0.85)}>
										{(successMetrics.completionRate * 100).toFixed(1)}%
									</Text>
								</Box>
								<Box>
									<Text dimColor>Satisfaction: </Text>
									<Text bold color={rateColor(successMetrics.userSatisfaction, 0.8)}>
										{(successMetrics.userSatisfaction * 100).toFixed(1)}%
									</Text>
								</Box>
							</Box>
							{successMetrics.insights.length > 0 && (
								<Box flexDirection="column" marginTop={1}>
									<Text dimColor>Insights:</Text>
									{successMetrics.insights.map((insight, index) => (
										<Text key={index}>{insight}</Text>
									))}
								</Box>
							)}
						</Box>
					)}
				</Box>
			</Box>
		</Box>
	);
}

function badRateColor(value: number, threshold: number): string {
	return value > threshold ? 'red' : 'green';
}

function rateColor(value: number, threshold: number): string {
	return value >= threshold ? 'green' : 'yellow';
}

function renderDistribution(
	distribution: Record<string, number>,
	color: string,
	maxBars: number = 8
): React.JSX.Element[] {
	const entries = Object.entries(distribution)
		.sort(([, a], [, b]) => b - a)
		.slice(0, maxBars);
	const maxValue = entries.length > 0 ? Math.max(...entries.map(([, v]) => v)) : 1;
	const barWidth = 20;

	return entries.map(([name, value]) => {
		const filled = Math.max(1, Math.floor((value / maxValue) * barWidth));
		return (
			<Box key={name}>
				<Text>{(name.length > 15 ? name.substring(0, 12) + '...' : name).padEnd(15)}</Text>
				<Text color={color}>{'█'.repeat(filled)}</Text>
				<Text dimColor>{'░'.repeat(barWidth - filled)}</Text>
				<Text> {value}</Text>
			</Box>
		);
	});
}

function SummaryHeader({ metrics }: { metrics: AgentSelectionMetrics }): React.JSX.Element {
	return (
		<Box borderColor="cyan" borderStyle="round" flexDirection="column" paddingX={1}>
			<Text bold color="cyan">
				Agent Selection Summary (24h)
			</Text>
			<Box marginTop={1}>
				<Text dimColor>Selections: </Text>
				<Text bold>{metrics.totalSelections}</Text>
				<Text dimColor> Avg Confidence: </Text>
				<Text bold color={rateColor(metrics.averageConfidence, 0.85)}>
					{(metrics.averageConfidence * 100).toFixed(1)}%
				</Text>
				<Text dimColor> Fallback: </Text>
				<Text bold color={badRateColor(metrics.fallbackRate, 0.15)}>
					{(metrics.fallbackRate * 100).toFixed(1)}%
				</Text>
				<Text dimColor> Override: </Text>
				<Text bold color={badRateColor(metrics.manualOverrideRate, 0.2)}>
					{(metrics.manualOverrideRate * 100).toFixed(1)}%
				</Text>
			</Box>
		</Box>
	);
}
