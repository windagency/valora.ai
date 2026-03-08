/**
 * Audit Log View - MCP audit log viewer
 */

import React from 'react';

import type { AuditData } from 'ui/dashboard/hooks/use-metrics-data';

import { formatAge } from 'ui/dashboard/utils/format-helpers';
import { getTUIAdapter } from 'ui/tui-adapter.interface';

const tui = getTUIAdapter();
// eslint-disable-next-line @typescript-eslint/naming-convention -- Box and Text are React components which require PascalCase
const { Box, Text } = tui;

// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
export function AuditLogView({ data }: { data: AuditData }): React.JSX.Element {
	return (
		<Box flexDirection="column">
			{/* Summary header */}
			<Box borderColor="cyan" borderStyle="round" flexDirection="column" paddingX={1}>
				<Text bold color="cyan">
					MCP Audit Log
				</Text>
				<Box marginTop={1}>
					<Text dimColor>Total Entries: </Text>
					<Text bold>{data.stats.totalEntries}</Text>
					<Text dimColor> Success Rate: </Text>
					<Text bold color={data.stats.successRate >= 0.9 ? 'green' : 'yellow'}>
						{(data.stats.successRate * 100).toFixed(1)}%
					</Text>
				</Box>
				{Object.keys(data.stats.byOperation).length > 0 && (
					<Box>
						<Text dimColor>By Operation: </Text>
						{Object.entries(data.stats.byOperation).map(([op, count], index) => (
							<Text key={op}>
								{index > 0 ? ', ' : ''}
								<Text color="cyan">{op}</Text>: {count}
							</Text>
						))}
					</Box>
				)}
				{Object.keys(data.stats.byServer).length > 0 && (
					<Box>
						<Text dimColor>By Server: </Text>
						{Object.entries(data.stats.byServer).map(([server, count], index) => (
							<Text key={server}>
								{index > 0 ? ', ' : ''}
								<Text color="yellow">{server}</Text>: {count}
							</Text>
						))}
					</Box>
				)}
			</Box>

			{/* Entry list */}
			<Box borderColor="white" borderStyle="round" flexDirection="column" marginTop={1} paddingX={1}>
				<Text bold>Recent Entries ({data.entries.length})</Text>
				{data.entries.length === 0 ? (
					<Text dimColor>No audit entries recorded</Text>
				) : (
					<Box flexDirection="column" marginTop={1}>
						{data.entries
							.slice(-20)
							.reverse()
							.map((entry, index) => (
								<Box flexDirection="column" key={index}>
									<Box>
										<Text bold color={entry.success ? 'green' : 'red'}>
											{entry.success ? '✓' : '✗'}
										</Text>
										<Text color="cyan"> {entry.operation.padEnd(12)}</Text>
										<Text color="yellow">
											{' '}
											{(entry.serverId.length > 15 ? entry.serverId.substring(0, 12) + '...' : entry.serverId).padEnd(
												15
											)}
										</Text>
										{entry.toolName && <Text> {entry.toolName}</Text>}
										{entry.duration_ms != null && <Text dimColor> {entry.duration_ms}ms</Text>}
										<Text dimColor> {formatAge(entry.timestamp.toISOString())}</Text>
									</Box>
									{entry.error && (
										<Box>
											<Text color="red"> Error: {entry.error}</Text>
										</Box>
									)}
								</Box>
							))}
					</Box>
				)}
			</Box>
		</Box>
	);
}
