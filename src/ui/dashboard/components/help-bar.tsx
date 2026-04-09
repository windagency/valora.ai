/**
 * Dashboard Help Bar Component
 */

import React from 'react';

import type { DashboardTab, ViewMode } from 'ui/dashboard/types';

import { getTUIAdapter } from 'ui/tui-adapter.interface';

const tui = getTUIAdapter();
// eslint-disable-next-line @typescript-eslint/naming-convention -- Box and Text are React components which require PascalCase
const { Box, Text } = tui;

// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
export function HelpBar({
	activeTab,
	hasSubTabs,
	mode
}: {
	activeTab?: DashboardTab;
	hasSubTabs?: boolean;
	mode: ViewMode;
}): React.JSX.Element {
	return (
		<Box borderColor="white" borderStyle="round" paddingX={1}>
			{mode === 'details' ? (
				<Text>
					<Text color="cyan">j/k/↑/↓</Text>: Scroll{' '}
					{hasSubTabs && (
						<>
							<Text color="cyan">[/]</Text>: Sub-tab{' '}
						</>
					)}
					<Text color="cyan">Esc/q</Text>: Back <Text color="cyan">Ctrl+C</Text>: Quit
				</Text>
			) : (
				<Text>
					<Text color="cyan">1-6</Text>: Tab <Text color="cyan">j/k</Text>: Navigate{' '}
					{activeTab === 'overview' && (
						<>
							<Text color="cyan">Enter</Text>: Details{' '}
						</>
					)}
					<Text color="cyan">r</Text>: Refresh <Text color="cyan">q</Text>: Quit
				</Text>
			)}
		</Box>
	);
}
