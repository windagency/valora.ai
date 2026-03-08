/**
 * Worktree Stats Panel
 */

import React from 'react';

import type { WorktreeUsageStats } from 'types/session.types';

import { formatDurationMs } from 'ui/dashboard/utils/format-helpers';
import { getTUIAdapter } from 'ui/tui-adapter.interface';

const tui = getTUIAdapter();
// eslint-disable-next-line @typescript-eslint/naming-convention -- Box and Text are React components which require PascalCase
const { Box, Text } = tui;

// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
export function WorktreeStatsPanel({ stats }: { stats: WorktreeUsageStats }): React.JSX.Element {
	return (
		<Box borderColor="yellow" borderStyle="round" flexDirection="column" marginBottom={1} paddingX={1}>
			<Text bold color="yellow">
				Worktree Usage
			</Text>
			<Box flexDirection="column" marginTop={1}>
				<Box>
					<Text dimColor>Created: </Text>
					<Text bold>{stats.total_created}</Text>
					<Text> </Text>
					<Text dimColor>Max Concurrent: </Text>
					<Text bold>{stats.max_concurrent}</Text>
				</Box>
				<Box>
					<Text dimColor>Total Duration: </Text>
					<Text bold color="cyan">
						{formatDurationMs(stats.total_duration_ms)}
					</Text>
				</Box>
				{stats.exploration_ids.length > 0 && (
					<Box>
						<Text dimColor>Explorations: </Text>
						<Text color="cyan">{stats.exploration_ids.join(', ')}</Text>
					</Box>
				)}
			</Box>
			{stats.worktree_summaries.length > 0 && (
				<Box flexDirection="column" marginTop={1}>
					{stats.worktree_summaries.map((summary, index) => {
						const statusIcon =
							summary.status === 'completed' ? '\u2713' : summary.status === 'failed' ? '\u2717' : '\u25cb';
						const statusColor =
							summary.status === 'completed' ? 'green' : summary.status === 'failed' ? 'red' : 'yellow';
						const duration =
							summary.duration_ms != null
								? formatDurationMs(summary.duration_ms)
								: summary.status === 'failed'
									? 'fail'
									: '';

						return (
							<Box key={index}>
								<Text color={statusColor}>{statusIcon}</Text>
								<Text> </Text>
								<Text>{summary.branch_name}</Text>
								{duration && <Text dimColor> {duration}</Text>}
							</Box>
						);
					})}
				</Box>
			)}
		</Box>
	);
}
