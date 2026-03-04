/**
 * Command History Panel
 */

import type { Session } from 'types/session.types';

import React from 'react';
import { getTUIAdapter } from 'ui/tui-adapter.interface';
import { formatNumber } from 'utils/number-format';

import { formatDurationMs } from '../utils/format-helpers';

const tui = getTUIAdapter();
// eslint-disable-next-line @typescript-eslint/naming-convention -- Box and Text are React components which require PascalCase
const { Box, Text } = tui;

// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
export function CommandHistoryPanel({ session }: { session: Session }): React.JSX.Element {
	const commands = session.commands.slice(-10).reverse();

	return (
		<Box borderColor="white" borderStyle="round" flexDirection="column" marginBottom={1} paddingX={1}>
			<Text bold color="cyan">
				Commands Executed ({session.commands.length})
			</Text>
			{commands.length === 0 ? (
				<Text dimColor>No commands executed yet</Text>
			) : (
				commands.map((cmd, index) => (
					<Box flexDirection="column" key={index} marginTop={index > 0 ? 1 : 0}>
						<Box>
							<Text color={cmd.success ? 'green' : 'red'}>{cmd.success ? '✓' : '✗'}</Text>
							<Text> {cmd.command}</Text>
							{cmd.duration_ms != null && cmd.duration_ms > 0 && (
								<Text dimColor> ({formatDurationMs(cmd.duration_ms)})</Text>
							)}
							{cmd.tokens_used != null && cmd.tokens_used > 0 && (
								<Text color="cyan"> {formatNumber(cmd.tokens_used)} tokens</Text>
							)}
						</Box>
						<Text dimColor> {new Date(cmd.timestamp).toLocaleString()}</Text>
						{cmd.error && <Text color="red"> Error: {cmd.error}</Text>}
					</Box>
				))
			)}
			{session.commands.length > 10 && (
				<Box marginTop={1}>
					<Text dimColor>... and {session.commands.length - 10} more commands</Text>
				</Box>
			)}
		</Box>
	);
}
