/**
 * Spending Panel - Session cost breakdown for the live dashboard
 */

import React from 'react';

import type { Session } from 'types/session.types';

import { getTUIAdapter } from 'ui/tui-adapter.interface';
import { formatNumber } from 'utils/number-format';
import { getSpendingTracker } from 'utils/spending-tracker';

const tui = getTUIAdapter();

const { Box, Text } = tui;

export function SpendingPanel({ session }: { session: Session }): React.JSX.Element {
	const tracker = getSpendingTracker();
	const sessionStart = session.created_at;
	const records = tracker.getRecords({ since: sessionStart });
	const totals = tracker.getTotals({ since: sessionStart });

	// Group by command for the bar chart
	const byEndpoint = tracker.getByEndpoint({ since: sessionStart });
	const maxCost = byEndpoint.length > 0 ? Math.max(...byEndpoint.map((e) => e.totalCostUsd)) : 1;

	// Top 5 most expensive in this session
	const topExpensive = tracker.getExpensive(5, { since: sessionStart });

	return (
		<Box borderColor="white" borderStyle="round" flexDirection="column" marginBottom={1} paddingX={1}>
			<Text bold color="yellow">
				Spending
			</Text>
			<Box flexDirection="column" marginTop={1}>
				<Box>
					<Text dimColor>Session cost: </Text>
					<Text bold color="yellow">
						${totals.totalCostUsd.toFixed(4)}
					</Text>
					{totals.hasUnknownModelPricing && <Text color="red"> (estimated — model pricing unknown)</Text>}
				</Box>
				<Box>
					<Text dimColor>Requests: </Text>
					<Text color="cyan">{totals.requestCount}</Text>
					<Text dimColor> Tokens: </Text>
					<Text color="cyan">{formatNumber(totals.totalTokens)}</Text>
				</Box>
				<Box flexDirection="column" marginTop={1}>
					<Text dimColor>Cost Breakdown:</Text>
					<Box>
						<Text dimColor>{'  Input:        '}</Text>
						<Text color="cyan">{formatNumber(totals.totalInputTokens).padStart(7)}</Text>
						<Text dimColor> tok </Text>
						<Text color="yellow">${totals.totalInputCostUsd.toFixed(4)}</Text>
					</Box>
					<Box>
						<Text dimColor>{'  Output:       '}</Text>
						<Text color="cyan">{formatNumber(totals.totalOutputTokens).padStart(7)}</Text>
						<Text dimColor> tok </Text>
						<Text color="yellow">${totals.totalOutputCostUsd.toFixed(4)}</Text>
					</Box>
					{totals.totalCacheReadTokens > 0 && (
						<Box>
							<Text dimColor>{'  Cache read:   '}</Text>
							<Text color="cyan">{formatNumber(totals.totalCacheReadTokens).padStart(7)}</Text>
							<Text dimColor> tok </Text>
							<Text color="yellow">${totals.totalCacheReadCostUsd.toFixed(4)}</Text>
							{totals.cacheSavingsUsd > 0 && <Text color="green"> (saved ${totals.cacheSavingsUsd.toFixed(4)})</Text>}
						</Box>
					)}
					{totals.totalCacheWriteTokens > 0 && (
						<Box>
							<Text dimColor>{'  Cache write:  '}</Text>
							<Text color="cyan">{formatNumber(totals.totalCacheWriteTokens).padStart(7)}</Text>
							<Text dimColor> tok </Text>
							<Text color="yellow">${totals.totalCacheWriteCostUsd.toFixed(4)}</Text>
						</Box>
					)}
				</Box>
			</Box>

			{byEndpoint.length > 0 && (
				<Box flexDirection="column" marginTop={1}>
					<Text dimColor>Cost by Command:</Text>
					{byEndpoint.slice(0, 8).map((e, index) => {
						const barWidth = 20;
						const filled = Math.max(1, Math.floor((e.totalCostUsd / maxCost) * barWidth));
						return (
							<Box key={index}>
								<Text> {(e.command.length > 14 ? e.command.substring(0, 11) + '...' : e.command).padEnd(14)}</Text>
								<Text color="yellow">{'█'.repeat(filled)}</Text>
								<Text dimColor>{'░'.repeat(barWidth - filled)}</Text>
								<Text> ${e.totalCostUsd.toFixed(4)}</Text>
							</Box>
						);
					})}
				</Box>
			)}

			{topExpensive.length > 0 && (
				<Box flexDirection="column" marginTop={1}>
					<Text dimColor>Top Expensive Requests:</Text>
					{topExpensive.map((r, index) => {
						const date = new Date(r.timestamp).toLocaleTimeString();
						const tokenParts = [`in:${formatNumber(r.promptTokens)}`, `out:${formatNumber(r.completionTokens)}`];
						if (r.cacheReadTokens > 0) tokenParts.push(`cr:${formatNumber(r.cacheReadTokens)}`);
						if (r.cacheWriteTokens > 0) tokenParts.push(`cw:${formatNumber(r.cacheWriteTokens)}`);
						return (
							<Box flexDirection="column" key={index}>
								<Box>
									<Text dimColor>{index + 1}. </Text>
									<Text color="cyan">{r.command.padEnd(12)}</Text>
									<Text dimColor> {date} </Text>
									<Text color="yellow">${r.costUsd.toFixed(4)}</Text>
									{(r.unknownModelPricing ?? false) && <Text color="red"> ~est</Text>}
								</Box>
								<Box>
									<Text dimColor>
										{'   '}
										{tokenParts.join(' ')}
									</Text>
								</Box>
							</Box>
						);
					})}
				</Box>
			)}

			{records.length === 0 && <Text dimColor>No spending recorded this session</Text>}
		</Box>
	);
}
