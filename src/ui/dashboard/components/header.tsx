/**
 * Dashboard Header Component
 */

import React from 'react';

import { getTUIAdapter } from 'ui/tui-adapter.interface';

const tui = getTUIAdapter();
// eslint-disable-next-line @typescript-eslint/naming-convention -- Box and Text are React components which require PascalCase
const { Box, Text } = tui;

// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
export function Header(): React.JSX.Element {
	return (
		<Box borderColor="blue" borderStyle="round" paddingX={1}>
			<Text bold color="cyan">
				VALORA - Real-Time Dashboard
			</Text>
		</Box>
	);
}
