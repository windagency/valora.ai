/**
 * System Health Panel
 */

import React from 'react';

import type { SystemHealth } from 'ui/dashboard/types';

import { formatDurationMs } from 'ui/dashboard/utils/format-helpers';
import { getTUIAdapter } from 'ui/tui-adapter.interface';

const tui = getTUIAdapter();

const { Box, Text } = tui;

export function SystemHealthPanel({ health }: { health: SystemHealth }): React.JSX.Element {
	const statusColor = health.apiStatus === 'healthy' ? 'green' : 'red';
	const statusIcon = health.apiStatus === 'healthy' ? '✓' : '✗';

	return (
		<Box borderColor="cyan" borderStyle="round" flexDirection="column" height={9} paddingX={1}>
			<Text bold color="cyan">
				System Health
			</Text>
			<Box flexDirection="column" marginTop={1}>
				<Box>
					<Text dimColor>API Status:</Text>
					<Text> </Text>
					<Text bold color={statusColor}>
						{statusIcon} {health.apiStatus.toUpperCase()}
					</Text>
				</Box>
				<Box marginTop={1}>
					<Text dimColor>Total Sessions:</Text>
					<Text> </Text>
					<Text bold color="cyan">
						{health.sessionsCount}
					</Text>
				</Box>
				<Box marginTop={1}>
					<Text dimColor>Disk Usage:</Text>
					<Text> </Text>
					<Text bold color="yellow">
						{health.diskUsage}
					</Text>
				</Box>
				<Box marginTop={1}>
					<Text dimColor>Uptime: {formatDurationMs(health.uptime)}</Text>
				</Box>
			</Box>
		</Box>
	);
}
