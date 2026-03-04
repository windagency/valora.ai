/**
 * MCP Metrics Panel - Compact summary for main dashboard
 */

import type { MCPDashboardMetrics } from 'types/mcp-client.types';

import React from 'react';
import { getTUIAdapter } from 'ui/tui-adapter.interface';

const tui = getTUIAdapter();
// eslint-disable-next-line @typescript-eslint/naming-convention -- Box and Text are React components which require PascalCase
const { Box, Text } = tui;

// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
export function MCPMetricsPanel({ metrics }: { metrics: MCPDashboardMetrics }): React.JSX.Element {
	const topServers = metrics.servers.slice(0, 3);

	return (
		<Box borderColor="magenta" borderStyle="round" flexDirection="column" height={12} paddingX={1}>
			<Text bold color="magenta">
				MCP Servers
			</Text>
			<Box flexDirection="column" marginTop={1}>
				<Box>
					<Text dimColor>Active: </Text>
					<Text bold color="green">
						{metrics.activeServerCount}
					</Text>
					<Text dimColor> Calls: </Text>
					<Text bold color="cyan">
						{metrics.totalToolCalls}
					</Text>
				</Box>
				<Box>
					<Text dimColor>Success: </Text>
					<Text bold color={metrics.overallSuccessRate >= 0.9 ? 'green' : 'yellow'}>
						{(metrics.overallSuccessRate * 100).toFixed(0)}%
					</Text>
					<Text dimColor> Avg: </Text>
					<Text bold color="cyan">
						{metrics.avgDurationMs.toFixed(0)}ms
					</Text>
				</Box>
			</Box>
			{topServers.length > 0 && (
				<Box flexDirection="column" marginTop={1}>
					{topServers.map((server) => (
						<Box key={server.serverId}>
							<Text color={server.isConnected ? 'green' : 'red'}>{server.isConnected ? '●' : '○'}</Text>
							<Text> </Text>
							<Text>{server.serverId.length > 14 ? server.serverId.substring(0, 11) + '...' : server.serverId}</Text>
							<Text dimColor>
								{' '}
								{String(server.totalCalls).padStart(3)} calls {(server.successRate * 100).toFixed(0)}%
							</Text>
						</Box>
					))}
				</Box>
			)}
		</Box>
	);
}
