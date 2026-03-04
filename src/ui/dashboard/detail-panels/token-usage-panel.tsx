/**
 * Token Usage Panel - Token usage breakdown + trend
 */

import type { Session } from 'types/session.types';

import { Sparkline } from 'exploration/dashboard-metrics';
import React from 'react';
import { getTUIAdapter } from 'ui/tui-adapter.interface';
import { formatNumber } from 'utils/number-format';

const tui = getTUIAdapter();
// eslint-disable-next-line @typescript-eslint/naming-convention -- Box and Text are React components which require PascalCase
const { Box, Text } = tui;

// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
export function TokenUsagePanel({ session }: { session: Session }): React.JSX.Element {
	const commandsWithTokens = session.commands.filter((cmd) => cmd.tokens_used != null && cmd.tokens_used > 0);
	const totalTokens = session.total_tokens_used ?? 0;
	const tokenValues = commandsWithTokens.map((cmd) => cmd.tokens_used!);
	const maxTokens = tokenValues.length > 0 ? Math.max(...tokenValues) : 1;

	return (
		<Box borderColor="white" borderStyle="round" flexDirection="column" marginBottom={1} paddingX={1}>
			<Text bold color="cyan">
				Token Usage
			</Text>
			<Box flexDirection="column" marginTop={1}>
				<Box>
					<Text dimColor>Total Tokens: </Text>
					<Text bold color="cyan">
						{formatNumber(totalTokens)}
					</Text>
					{session.context_window && (
						<>
							<Text dimColor> Context: </Text>
							<Text bold color={session.context_window.utilization_percent > 80 ? 'red' : 'green'}>
								{session.context_window.utilization_percent.toFixed(1)}%
							</Text>
							<Text dimColor> Model: </Text>
							<Text color="cyan">{session.context_window.model}</Text>
						</>
					)}
				</Box>
			</Box>

			{commandsWithTokens.length > 0 && (
				<Box flexDirection="column" marginTop={1}>
					<Text dimColor>Per-Command Usage:</Text>
					{commandsWithTokens
						.slice(-10)
						.reverse()
						.map((cmd, index) => {
							const barWidth = 20;
							const filled = Math.max(1, Math.floor((cmd.tokens_used! / maxTokens) * barWidth));
							return (
								<Box key={index}>
									<Text color={cmd.success ? 'green' : 'red'}>{cmd.success ? '✓' : '✗'}</Text>
									<Text>
										{' '}
										{(cmd.command.length > 15 ? cmd.command.substring(0, 12) + '...' : cmd.command).padEnd(15)}
									</Text>
									<Text color="cyan">{'█'.repeat(filled)}</Text>
									<Text dimColor>{'░'.repeat(barWidth - filled)}</Text>
									<Text> {formatNumber(cmd.tokens_used!)}</Text>
								</Box>
							);
						})}
				</Box>
			)}

			{/* Token usage trend */}
			{tokenValues.length > 1 && (
				<Box flexDirection="column" marginTop={1}>
					<Text dimColor>Token Usage Trend:</Text>
					<Sparkline color="cyan" data={tokenValues} height={3} width={30} />
				</Box>
			)}

			{commandsWithTokens.length === 0 && <Text dimColor>No token usage recorded</Text>}
		</Box>
	);
}
