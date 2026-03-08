/**
 * Recent Commands Panel
 */

import React from 'react';

import type { RecentCommand } from 'ui/dashboard/types';

import { formatAge } from 'ui/dashboard/utils/format-helpers';
import { getTUIAdapter } from 'ui/tui-adapter.interface';

const tui = getTUIAdapter();
// eslint-disable-next-line @typescript-eslint/naming-convention -- Box and Text are React components which require PascalCase
const { Box, Text } = tui;

// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
export function RecentCommandsPanel({ commands }: { commands: RecentCommand[] }): React.JSX.Element {
	return (
		<Box borderColor="yellow" borderStyle="round" flexDirection="column" height={8} paddingX={1}>
			<Text bold color="yellow">
				Recent Commands
			</Text>
			<Box flexDirection="column" marginTop={1}>
				{commands.length === 0 ? (
					<Text dimColor>No recent commands</Text>
				) : (
					commands.map((cmd, index) => {
						const truncatedCmd = cmd.command.length > 20 ? cmd.command.substring(0, 17) + '...' : cmd.command;
						const age = formatAge(cmd.timestamp);

						return (
							<Box key={index}>
								<Text bold color={cmd.status === 'success' ? 'green' : 'red'}>
									{cmd.status === 'success' ? '✓' : '✗'}
								</Text>
								<Text> </Text>
								<Text bold>{truncatedCmd.padEnd(20)}</Text>
								<Text dimColor> {age}</Text>
							</Box>
						);
					})
				)}
			</Box>
		</Box>
	);
}
