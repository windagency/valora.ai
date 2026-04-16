/**
 * Active Sessions Panel
 */

import React from 'react';

import type { SessionSummary } from 'types/session.types';

import { formatAge, getContextColor } from 'ui/dashboard/utils/format-helpers';
import { getTUIAdapter } from 'ui/tui-adapter.interface';
import { formatNumber } from 'utils/number-format';

const tui = getTUIAdapter();

const { Box, Text } = tui;

export function ActiveSessionsPanel({
	selectedIndex,
	sessions
}: {
	selectedIndex: number;
	sessions: SessionSummary[];
}): React.JSX.Element {
	return (
		<Box borderColor="green" borderStyle="round" flexDirection="column" height={15} paddingX={1}>
			<Text bold color="green">
				Recent Sessions ({sessions.length})
			</Text>
			<Box flexDirection="column" marginTop={1}>
				{sessions.length === 0 ? (
					<>
						<Text dimColor>No sessions yet</Text>
						<Text dimColor>Run commands to create sessions</Text>
					</>
				) : (
					sessions
						.slice(0, 10)
						.map((session, index) => (
							<SessionRow isSelected={index === selectedIndex} key={session.session_id} session={session} />
						))
				)}
			</Box>
		</Box>
	);
}

function SessionRow({ isSelected, session }: { isSelected: boolean; session: SessionSummary }): React.JSX.Element {
	const age = formatAge(session.last_active);
	const tokens = session.total_tokens_used ?? 0;
	const sessionId = session.session_id.substring(0, 16).padEnd(16);
	const ctxUsage = session.context_window;
	const ctxPercent = ctxUsage?.utilization_percent ?? 0;
	const ctxColor = getContextColor(ctxPercent);

	return (
		<Box key={`session-${session.session_id}`}>
			<Text backgroundColor={isSelected ? 'blue' : undefined} bold={isSelected} color={isSelected ? 'blue' : 'white'}>
				{isSelected ? '▶' : ' '}
			</Text>
			<Text> </Text>
			<Text color={session.status === 'active' ? 'green' : 'yellow'}>●</Text>
			<Text> </Text>
			<Text color="cyan">{sessionId}</Text>
			<Text dimColor> {age.padEnd(10)}</Text>
			<Text color="yellow"> {String(session.command_count).padStart(2)} cmd</Text>
			{tokens > 0 && <Text color="cyan"> {formatNumber(tokens)} tokens</Text>}
			{ctxUsage && <Text color={ctxColor}> ctx:{ctxPercent.toFixed(0)}%</Text>}
		</Box>
	);
}
