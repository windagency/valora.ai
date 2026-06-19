/**
 * Running Task Panel
 */

import React from 'react';

import { formatDurationMs } from 'ui/dashboard/utils/format-helpers';
import { getTUIAdapter } from 'ui/tui-adapter.interface';

const tui = getTUIAdapter();

const { Box, Text } = tui;

export function RunningTaskPanel({ command, elapsedMs }: { command: string; elapsedMs: number }): React.JSX.Element {
	return (
		<Box borderColor="yellow" borderStyle="round" flexDirection="column" marginBottom={1} paddingX={1}>
			<Text bold color="yellow">
				⟳ Running Task
			</Text>
			<Box marginTop={1}>
				<Text>
					Command: <Text color="cyan">{command}</Text>
				</Text>
			</Box>
			<Text>
				Elapsed: <Text color="yellow">{formatDurationMs(elapsedMs)}</Text>
			</Text>
			<Text dimColor>▓▒░░░░░░░░░░░░░░░░░░ running...</Text>
		</Box>
	);
}
