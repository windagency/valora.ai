/**
 * System Health Panel
 */

import React from 'react';
import { getTUIAdapter } from 'ui/tui-adapter.interface';

import type { SystemHealth } from '../types';

import { formatDurationMs } from '../utils/format-helpers';

const tui = getTUIAdapter();
// eslint-disable-next-line @typescript-eslint/naming-convention -- Box and Text are React components which require PascalCase
const { Box, Text } = tui;

// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
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
