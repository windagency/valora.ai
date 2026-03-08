/**
 * Background Tasks Panel
 */

import React from 'react';

import type { BackgroundTask } from 'ui/dashboard/types';

import { formatDurationMs } from 'ui/dashboard/utils/format-helpers';
import { getTUIAdapter } from 'ui/tui-adapter.interface';

const tui = getTUIAdapter();
// eslint-disable-next-line @typescript-eslint/naming-convention -- Box and Text are React components which require PascalCase
const { Box, Text } = tui;

// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
export function BackgroundTasksPanel({ tasks }: { tasks: BackgroundTask[] }): React.JSX.Element {
	return (
		<Box borderColor="magenta" borderStyle="round" flexDirection="column" height={6} paddingX={1}>
			<Text bold color="magenta">
				Background Tasks
			</Text>
			<Box flexDirection="column" marginTop={1}>
				{tasks.length === 0 ? (
					<Text dimColor>No background tasks running</Text>
				) : (
					tasks.map((task) => {
						const statusColor = task.status === 'completed' ? 'green' : task.status === 'failed' ? 'red' : 'yellow';
						const isIndeterminate = task.progress < 0;
						const elapsedMs = task.startedAt ? Date.now() - new Date(task.startedAt).getTime() : 0;
						const elapsedStr = elapsedMs > 0 ? formatDurationMs(elapsedMs) : '';
						return (
							<Box flexDirection="column" key={task.id}>
								<Box>
									<Text color={statusColor}>
										{task.status === 'completed' ? '✓' : task.status === 'failed' ? '✗' : '⟳'}
									</Text>
									<Text> {task.name}</Text>
									{elapsedStr && <Text dimColor> ({elapsedStr})</Text>}
								</Box>
								<Text dimColor>
									{isIndeterminate
										? '▓▒░░░░░░░░░░░░░░░░░░ running...'
										: `${'█'.repeat(Math.floor((task.progress / 100) * 20))}${'░'.repeat(20 - Math.floor((task.progress / 100) * 20))} ${task.progress}%`}
								</Text>
							</Box>
						);
					})
				)}
			</Box>
		</Box>
	);
}
