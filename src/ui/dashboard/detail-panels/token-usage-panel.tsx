/**
 * Token Usage Panel - Token usage breakdown + trend
 */

import React from 'react';

import type { Session } from 'types/session.types';

import { getModelContextWindow } from 'config/providers.config';
import { Sparkline } from 'exploration/dashboard-metrics';
import { getTUIAdapter } from 'ui/tui-adapter.interface';
import { formatNumber } from 'utils/number-format';
import { type EndpointSummary, getSpendingTracker, type SpendingTotals } from 'utils/spending-tracker';

const tui = getTUIAdapter();
// eslint-disable-next-line @typescript-eslint/naming-convention -- Box and Text are React components which require PascalCase
const { Box, Text } = tui;

// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
export function TokenUsagePanel({ session }: { session: Session }): React.JSX.Element {
	const tracker = getSpendingTracker();
	const sessionStart = session.created_at;
	const totals = tracker.getTotals({ since: sessionStart });
	const byEndpoint = tracker.getByEndpoint({ since: sessionStart });
	const maxTokens = Math.max(1, ...byEndpoint.map((e) => e.totalTokens));

	// Most recent record for model + context window info
	const records = tracker.getRecords({ since: sessionStart });
	const latestRecord = records.at(-1);
	const model = latestRecord?.model;
	const latestPromptTokens = latestRecord?.promptTokens ?? 0;
	const { contextWindowSize, utilizationPercent } = getContextInfo(model, latestPromptTokens);

	// Trend data: tokens per request in chronological order
	const tokenTrend = records.map((r) => r.totalTokens);

	return (
		<Box borderColor="white" borderStyle="round" flexDirection="column" marginBottom={1} paddingX={1}>
			<Text bold color="cyan">
				Token Usage
			</Text>
			<Box flexDirection="column" marginTop={1}>
				<Box>
					<Text dimColor>Total Tokens: </Text>
					<Text bold color="cyan">
						{formatNumber(totals.totalTokens)}
					</Text>
					{model && (
						<>
							<Text dimColor> Model: </Text>
							<Text color="cyan">{model}</Text>
						</>
					)}
					{contextWindowSize > 0 && (
						<>
							<Text dimColor> Context: </Text>
							<Text bold color={utilizationPercent > 80 ? 'red' : 'green'}>
								{utilizationPercent.toFixed(1)}%
							</Text>
							<Text dimColor> of {formatNumber(contextWindowSize)}</Text>
						</>
					)}
				</Box>
				<TokenBreakdown totals={totals} />
			</Box>

			{byEndpoint.length > 0 && (
				<Box flexDirection="column" marginTop={1}>
					<Text dimColor>Per-Command Usage:</Text>
					{byEndpoint.slice(0, 10).map((e, index) => (
						<CommandRow e={e} key={index} maxTokens={maxTokens} />
					))}
				</Box>
			)}

			{/* Token usage trend */}
			{tokenTrend.length > 1 && (
				<Box flexDirection="column" marginTop={1}>
					<Text dimColor>Token Usage Trend:</Text>
					<Sparkline color="cyan" data={tokenTrend} height={3} width={30} />
				</Box>
			)}

			{totals.requestCount === 0 && <Text dimColor>No token usage recorded</Text>}
		</Box>
	);
}

// eslint-disable-next-line @typescript-eslint/naming-convention -- React component must use PascalCase
function CommandRow({ e, maxTokens }: { e: EndpointSummary; maxTokens: number }): React.JSX.Element {
	const barWidth = 20;
	const filled = Math.max(1, Math.floor((e.totalTokens / maxTokens) * barWidth));
	const commandLabel = e.command.length > 15 ? `${e.command.substring(0, 12)}...` : e.command;
	const cacheReadStr = e.totalCacheReadTokens > 0 ? ` cr:${formatNumber(e.totalCacheReadTokens)}` : '';
	const cacheWriteStr = e.totalCacheWriteTokens > 0 ? ` cw:${formatNumber(e.totalCacheWriteTokens)}` : '';
	return (
		<Box flexDirection="column">
			<Box>
				<Text> {commandLabel.padEnd(15)}</Text>
				<Text color="cyan">{'█'.repeat(filled)}</Text>
				<Text dimColor>{'░'.repeat(barWidth - filled)}</Text>
				<Text> {formatNumber(e.totalTokens)}</Text>
			</Box>
			<Box>
				<Text dimColor>
					{'   '}
					{`in:${formatNumber(e.totalInputTokens)} out:${formatNumber(e.totalOutputTokens)}${cacheReadStr}${cacheWriteStr}`}
				</Text>
			</Box>
		</Box>
	);
}

function getContextInfo(
	model: string | undefined,
	latestPromptTokens: number
): { contextWindowSize: number; utilizationPercent: number } {
	if (!model) return { contextWindowSize: 0, utilizationPercent: 0 };
	const contextWindowSize = getModelContextWindow(model);
	const utilizationPercent = contextWindowSize > 0 ? Math.min(100, (latestPromptTokens / contextWindowSize) * 100) : 0;
	return { contextWindowSize, utilizationPercent };
}

// eslint-disable-next-line @typescript-eslint/naming-convention -- React component must use PascalCase
function TokenBreakdown({ totals }: { totals: SpendingTotals }): React.JSX.Element {
	return (
		<Box flexDirection="column" marginTop={1}>
			<Text dimColor>Token Breakdown:</Text>
			<Box>
				<Text dimColor>{'  Input:        '}</Text>
				<Text color="cyan">{formatNumber(totals.totalInputTokens).padStart(7)}</Text>
			</Box>
			<Box>
				<Text dimColor>{'  Output:       '}</Text>
				<Text color="cyan">{formatNumber(totals.totalOutputTokens).padStart(7)}</Text>
			</Box>
			{totals.totalCacheReadTokens > 0 && (
				<Box>
					<Text dimColor>{'  Cache read:   '}</Text>
					<Text color="cyan">{formatNumber(totals.totalCacheReadTokens).padStart(7)}</Text>
				</Box>
			)}
			{totals.totalCacheWriteTokens > 0 && (
				<Box>
					<Text dimColor>{'  Cache write:  '}</Text>
					<Text color="cyan">{formatNumber(totals.totalCacheWriteTokens).padStart(7)}</Text>
				</Box>
			)}
		</Box>
	);
}
