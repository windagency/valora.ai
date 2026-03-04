/**
 * MCP Session Panel - Detailed view for session details
 */

import type { MCPDashboardMetrics } from 'types/mcp-client.types';

import { Sparkline } from 'exploration/dashboard-metrics';
import React from 'react';
import { getTUIAdapter } from 'ui/tui-adapter.interface';

import { formatAge } from '../utils/format-helpers';

const tui = getTUIAdapter();
// eslint-disable-next-line @typescript-eslint/naming-convention -- Box and Text are React components which require PascalCase
const { Box, Text } = tui;

// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
export function MCPSessionPanel({ metrics }: { metrics: MCPDashboardMetrics }): React.JSX.Element {
	return (
		<Box borderColor="magenta" borderStyle="round" flexDirection="column" marginBottom={1} paddingX={1}>
			<Text bold color="magenta">
				MCP Analytics
			</Text>
			<Box flexDirection="column" marginTop={1}>
				<Box>
					<Text dimColor>Total Calls: </Text>
					<Text bold color="cyan">
						{metrics.totalToolCalls}
					</Text>
					<Text dimColor> Errors: </Text>
					<Text bold color={metrics.totalErrors > 0 ? 'red' : 'green'}>
						{metrics.totalErrors}
					</Text>
					<Text dimColor> Avg: </Text>
					<Text bold color="cyan">
						{metrics.avgDurationMs.toFixed(0)}ms
					</Text>
				</Box>
			</Box>
			{metrics.durationTrend.length > 0 && (
				<Box flexDirection="column" marginTop={1}>
					<Text dimColor>Duration Trend:</Text>
					<Sparkline color="cyan" data={metrics.durationTrend} height={3} width={30} />
				</Box>
			)}
			{metrics.servers.length > 0 && (
				<Box flexDirection="column" marginTop={1}>
					<Text dimColor>Servers:</Text>
					{metrics.servers.map((server) => (
						<Box flexDirection="column" key={server.serverId}>
							<Box>
								<Text color={server.isConnected ? 'green' : 'red'}>{server.isConnected ? '●' : '○'}</Text>
								<Text bold> {server.serverId}</Text>
								<Text dimColor>
									{' '}
									({server.totalCalls} calls, {(server.successRate * 100).toFixed(0)}%,{' '}
									{server.avgDurationMs.toFixed(0)}ms avg)
								</Text>
							</Box>
							{server.toolBreakdown.slice(0, 3).map((tool) => (
								<Box key={tool.toolName}>
									<Text dimColor> └ {tool.toolName}</Text>
									<Text dimColor>
										{' '}
										{tool.calls}x {(tool.successRate * 100).toFixed(0)}% {tool.avgDurationMs.toFixed(0)}ms
									</Text>
								</Box>
							))}
						</Box>
					))}
				</Box>
			)}
			{metrics.recentToolCalls.length > 0 && (
				<Box flexDirection="column" marginTop={1}>
					<Text dimColor>Recent Calls:</Text>
					{metrics.recentToolCalls.slice(0, 5).map((call, index) => (
						<Box key={index}>
							<Text bold color={call.success ? 'green' : 'red'}>
								{call.success ? '✓' : '✗'}
							</Text>
							<Text> {call.toolName}</Text>
							<Text dimColor>
								{' '}
								{call.durationMs}ms {formatAge(call.timestamp.toISOString())}
							</Text>
						</Box>
					))}
				</Box>
			)}
		</Box>
	);
}
