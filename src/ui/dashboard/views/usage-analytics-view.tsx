/**
 * Usage Analytics View - Cross-session token/cost analytics dashboard tab
 */

import React from 'react';

import type { UsageAnalyticsDashboardData } from 'ui/dashboard/hooks/use-usage-analytics-data';

import { Sparkline } from 'exploration/dashboard-metrics';
import { getTUIAdapter } from 'ui/tui-adapter.interface';
import { formatNumber } from 'utils/number-format';

const tui = getTUIAdapter();

const { Box, Text } = tui;

export function UsageAnalyticsView({ data }: { data: UsageAnalyticsDashboardData }): React.JSX.Element {
	if (data.isLoading) {
		return <Text dimColor>Loading usage data...</Text>;
	}

	if (data.error !== null) {
		return <Text color="red">Error: {data.error}</Text>;
	}

	const { summary } = data;

	if (summary === null || summary.totals.requestCount === 0) {
		return <Text dimColor>No spending data found. Run some Valora commands to see usage analytics.</Text>;
	}

	const { avgDailyCost, byCommand, byModel, daily, period, totals } = summary;

	// Panel 2: By Model bar chart
	const topModels = byModel.slice(0, 8);
	const maxModelCost = topModels.length > 0 ? Math.max(...topModels.map((m) => m.totalCostUsd)) : 1;

	// Panel 4: By Command bar chart
	const topCommands = byCommand.slice(0, 8);
	const maxCommandCost = topCommands.length > 0 ? Math.max(...topCommands.map((c) => c.totalCostUsd)) : 1;

	// Daily data for sparkline — last 7 days
	const recentDaily = daily.slice(-7);

	return (
		<Box flexDirection="column">
			{/* Row 1: Summary + By Model */}
			<Box flexDirection="row">
				{/* Panel 1: Summary */}
				<Box borderColor="yellow" borderStyle="round" flexDirection="column" marginRight={1} paddingX={1}>
					<Text bold color="yellow">
						Usage Analytics (last 7 days)
					</Text>
					<Box flexDirection="column" marginTop={1}>
						<Box>
							<Text dimColor>Period: </Text>
							<Text color="cyan">
								{period.from.slice(0, 10)} → {period.to.slice(0, 10)}
							</Text>
						</Box>
						<Box>
							<Text dimColor>Total cost: </Text>
							<Text bold color="yellow">
								${totals.totalCostUsd.toFixed(4)}
							</Text>
						</Box>
						<Box>
							<Text dimColor>Total tokens:</Text>
							<Text color="cyan"> {formatNumber(totals.totalTokens)}</Text>
						</Box>
						<Box>
							<Text dimColor>Requests: </Text>
							<Text color="cyan">{totals.requestCount}</Text>
						</Box>
						<Box>
							<Text dimColor>Avg daily: </Text>
							<Text color="yellow">${avgDailyCost.toFixed(4)}</Text>
						</Box>
						<Box>
							<Text dimColor>Cache saved: </Text>
							<Text color="green">${totals.cacheSavingsUsd.toFixed(4)}</Text>
						</Box>
					</Box>
				</Box>

				{/* Panel 2: Cost by Model */}
				<Box borderColor="cyan" borderStyle="round" flexDirection="column" paddingX={1}>
					<Text bold color="cyan">
						Cost by Model
					</Text>
					<Box flexDirection="column" marginTop={1}>
						{topModels.length === 0 ? (
							<Text dimColor>No model data</Text>
						) : (
							topModels.map((m) => {
								const barWidth = 20;
								const filled = Math.max(1, Math.floor((m.totalCostUsd / maxModelCost) * barWidth));
								const name = m.model.length > 30 ? m.model.substring(0, 27) + '...' : m.model;
								return (
									<Box key={m.model}>
										<Text>{name.padEnd(30)}</Text>
										<Text color="cyan">{'█'.repeat(filled)}</Text>
										<Text dimColor>{'░'.repeat(barWidth - filled)}</Text>
										<Text> ${m.totalCostUsd.toFixed(4)}</Text>
										<Text dimColor> ({m.requestCount})</Text>
									</Box>
								);
							})
						)}
					</Box>
				</Box>
			</Box>

			{/* Row 2: Daily Trend + Top Commands */}
			<Box flexDirection="row" marginTop={1}>
				{/* Panel 3: Daily Trend */}
				<Box borderColor="green" borderStyle="round" flexDirection="column" marginRight={1} paddingX={1}>
					<Text bold color="green">
						Daily Trend (last 7 days)
					</Text>
					<Box flexDirection="column" marginTop={1}>
						{recentDaily.length === 0 ? (
							<Text dimColor>No data</Text>
						) : (
							<>
								<Sparkline color="green" data={recentDaily.map((d) => d.totalCostUsd)} height={3} width={30} />
								<Box flexDirection="column" marginTop={1}>
									{recentDaily.map((d) => (
										<Box key={d.date}>
											<Text dimColor>{d.date}</Text>
											<Text dimColor> reqs: </Text>
											<Text color="cyan">{String(d.requestCount).padStart(4)}</Text>
											<Text dimColor> tok: </Text>
											<Text color="cyan">{formatNumber(d.totalTokens).padStart(8)}</Text>
											<Text dimColor> </Text>
											<Text color="yellow">${d.totalCostUsd.toFixed(4)}</Text>
										</Box>
									))}
								</Box>
							</>
						)}
					</Box>
				</Box>

				{/* Panel 4: Cost by Command */}
				<Box borderColor="magenta" borderStyle="round" flexDirection="column" paddingX={1}>
					<Text bold color="magenta">
						Cost by Command
					</Text>
					<Box flexDirection="column" marginTop={1}>
						{topCommands.length === 0 ? (
							<Text dimColor>No command data</Text>
						) : (
							topCommands.map((c) => {
								const barWidth = 20;
								const filled = Math.max(1, Math.floor((c.totalCostUsd / maxCommandCost) * barWidth));
								const name = c.command.length > 20 ? c.command.substring(0, 17) + '...' : c.command;
								const modelList = c.models.length > 2 ? c.models.slice(0, 2).join(', ') + '...' : c.models.join(', ');
								return (
									<Box key={c.command}>
										<Text>{name.padEnd(20)}</Text>
										<Text color="magenta">{'█'.repeat(filled)}</Text>
										<Text dimColor>{'░'.repeat(barWidth - filled)}</Text>
										<Text> ${c.totalCostUsd.toFixed(4)}</Text>
										<Text dimColor> {modelList}</Text>
									</Box>
								);
							})
						)}
					</Box>
				</Box>
			</Box>
		</Box>
	);
}
