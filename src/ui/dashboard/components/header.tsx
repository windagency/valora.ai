/**
 * Dashboard Header Component
 */

import React from 'react';

import { getTUIAdapter } from 'ui/tui-adapter.interface';

const tui = getTUIAdapter();

const { Box, Text } = tui;

export function Header(): React.JSX.Element {
	return (
		<Box borderColor="blue" borderStyle="round" paddingX={1}>
			<Text bold color="cyan">
				VALORA - Real-Time Dashboard
			</Text>
		</Box>
	);
}
