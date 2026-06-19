/**
 * Cache Stats View - Dry-run + stage output cache stats
 */

import React from 'react';

import type { CacheData } from 'ui/dashboard/hooks/use-metrics-data';

import { formatDurationMs } from 'ui/dashboard/utils/format-helpers';
import { getTUIAdapter } from 'ui/tui-adapter.interface';

const tui = getTUIAdapter();

const { Box, Text } = tui;

export function CacheStatsView({ data }: { data: CacheData }): React.JSX.Element {
	return (
		<Box flexDirection="column">
			{/* Dry Run Cache */}
			<Box borderColor="green" borderStyle="round" flexDirection="column" paddingX={1}>
				<Text bold color="green">
					Dry Run Cache
				</Text>
				<Box marginTop={1}>
					<Text dimColor>Entries: </Text>
					<Text bold color="cyan">
						{data.dryRunCache.size}
					</Text>
					<Text dimColor> / 50 max</Text>
				</Box>
				{data.dryRunCache.entries.length > 0 ? (
					<Box flexDirection="column" marginTop={1}>
						{data.dryRunCache.entries.slice(0, 10).map((entry, index) => (
							<Box key={index}>
								<Text color="cyan">
									{(entry.commandName.length > 25
										? entry.commandName.substring(0, 22) + '...'
										: entry.commandName
									).padEnd(25)}
								</Text>
								<Text dimColor> age: {formatDurationMs(entry.ageMs)}</Text>
							</Box>
						))}
						{data.dryRunCache.entries.length > 10 && (
							<Text dimColor>...and {data.dryRunCache.entries.length - 10} more</Text>
						)}
					</Box>
				) : (
					<Text dimColor>No entries — run a command with --dry-run to populate</Text>
				)}
			</Box>

			{/* Stage Output Cache */}
			<Box borderColor="yellow" borderStyle="round" flexDirection="column" marginTop={1} paddingX={1}>
				<Text bold color="yellow">
					Stage Output Cache
				</Text>
				<Box marginTop={1}>
					<Text dimColor>Entries: </Text>
					<Text bold color="cyan">
						{data.stageOutputCache.size}
					</Text>
					<Text dimColor> / 100 max</Text>
				</Box>
				{data.stageOutputCache.entries.length > 0 ? (
					<Box flexDirection="column" marginTop={1}>
						{data.stageOutputCache.entries.slice(0, 10).map((entry, index) => (
							<Box key={index}>
								<Text color="yellow">
									{(entry.stageId.length > 20 ? entry.stageId.substring(0, 17) + '...' : entry.stageId).padEnd(20)}
								</Text>
								<Text dimColor> age: {formatDurationMs(entry.ageMs)}</Text>
								{entry.savedTime_ms > 0 && <Text color="green"> saved: {formatDurationMs(entry.savedTime_ms)}</Text>}
							</Box>
						))}
						{data.stageOutputCache.entries.length > 10 && (
							<Text dimColor>...and {data.stageOutputCache.entries.length - 10} more</Text>
						)}
					</Box>
				) : (
					<Text dimColor>No entries — cache populates after stage execution (1hr TTL)</Text>
				)}
			</Box>
		</Box>
	);
}
