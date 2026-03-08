/**
 * Session Information Panel
 */

import React from 'react';

import type { Session } from 'types/session.types';

import { getContextColor, getStatusColor } from 'ui/dashboard/utils/format-helpers';
import { getTUIAdapter } from 'ui/tui-adapter.interface';
import { formatNumber } from 'utils/number-format';

const tui = getTUIAdapter();
// eslint-disable-next-line @typescript-eslint/naming-convention -- Box and Text are React components which require PascalCase
const { Box, Text } = tui;

// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
export function SessionInfoPanel({ session }: { session: Session }): React.JSX.Element {
	return (
		<Box borderColor="white" borderStyle="round" flexDirection="column" marginBottom={1} paddingX={1}>
			<Text bold color="cyan">
				Session Information
			</Text>
			<Text>
				Session ID: <Text color="cyan">{session.session_id}</Text>
			</Text>
			<Text>
				Status: <Text color={getStatusColor(session.status)}>{session.status.toUpperCase()}</Text>
			</Text>
			<Text>
				Created: <Text color="yellow">{new Date(session.created_at).toLocaleString()}</Text>
			</Text>
			<Text>
				Last Updated: <Text color="yellow">{new Date(session.updated_at).toLocaleString()}</Text>
			</Text>
			{session.total_tokens_used != null && session.total_tokens_used > 0 && (
				<Text>
					Total Tokens: <Text color="cyan">{formatNumber(session.total_tokens_used)}</Text>
				</Text>
			)}
			{session.context_window && (
				<>
					<Text>
						Context Window:{' '}
						<Text color={getContextColor(session.context_window.utilization_percent)}>
							{session.context_window.utilization_percent.toFixed(1)}%
						</Text>
						<Text dimColor>
							{' '}
							({formatNumber(session.context_window.tokens_used)} /{' '}
							{formatNumber(session.context_window.context_window_size)})
						</Text>
					</Text>
					<Text>
						Model: <Text color="cyan">{session.context_window.model}</Text>
					</Text>
				</>
			)}
		</Box>
	);
}
