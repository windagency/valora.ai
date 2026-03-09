/**
 * Metrics Summary Panel - Aggregated at-a-glance metrics
 */

import React from 'react';

import type { MetricsSummary } from 'ui/dashboard/types';

import { getTUIAdapter } from 'ui/tui-adapter.interface';
import { formatNumber } from 'utils/number-format';

const tui = getTUIAdapter();
// eslint-disable-next-line @typescript-eslint/naming-convention -- Box and Text are React components which require PascalCase
const { Box, Text } = tui;

// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
export function MetricsSummaryPanel({ summary }: { summary: MetricsSummary }): React.JSX.Element {
	return (
		<Box borderColor="cyan" borderStyle="round" flexDirection="column" paddingX={1}>
			<Text bold color="cyan">
				Metrics Summary
			</Text>
			<Box marginTop={1}>
				<Text dimColor>Cmds: </Text>
				<Text bold>{summary.totalCommands}</Text>
				<Text dimColor> Tokens: </Text>
				<Text bold color="cyan">
					{formatNumber(summary.totalTokens)}
				</Text>
				<Text dimColor> Cache Hit: </Text>
				<Text bold color={summary.cacheHitRate >= 70 ? 'green' : 'yellow'}>
					{summary.cacheHitRate.toFixed(0)}%
				</Text>
				<Text dimColor> Avg Review: </Text>
				<Text bold color={summary.avgReviewScore >= 80 ? 'green' : 'yellow'}>
					{summary.avgReviewScore > 0 ? `${summary.avgReviewScore.toFixed(0)}/100` : 'N/A'}
				</Text>
			</Box>
			<Box>
				<Text dimColor>Time Saved: </Text>
				<Text bold color="green">
					{summary.timeSavedMinutes.toFixed(0)}m
				</Text>
				<Text dimColor> Patterns: </Text>
				<Text bold>{summary.patterns}</Text>
				<Text dimColor> Early Exits: </Text>
				<Text bold>{summary.earlyExits}</Text>
				<Text dimColor> Errors: </Text>
				<Text bold color={summary.errors > 0 ? 'red' : 'green'}>
					{summary.errors}
				</Text>
				<Text dimColor> Loop Exhausted: </Text>
				<Text bold color={summary.toolLoopExhaustions > 0 ? 'yellow' : 'green'}>
					{summary.toolLoopExhaustions}
				</Text>
				<Text dimColor> Tool Failures: </Text>
				<Text bold color={summary.toolExecutionFailures > 0 ? 'red' : 'green'}>
					{summary.toolExecutionFailures}
				</Text>
			</Box>
		</Box>
	);
}
