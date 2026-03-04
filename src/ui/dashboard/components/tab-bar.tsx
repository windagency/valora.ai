/**
 * Dashboard Tab Bar Component
 */

import React from 'react';
import { getTUIAdapter } from 'ui/tui-adapter.interface';

import type { DashboardTab } from '../types';

const tui = getTUIAdapter();
// eslint-disable-next-line @typescript-eslint/naming-convention -- Box and Text are React components which require PascalCase
const { Box, Text } = tui;

const TAB_CONFIG: Array<{ key: string; label: string; tab: DashboardTab }> = [
	{ key: '1', label: 'Overview', tab: 'overview' },
	{ key: '2', label: 'Performance', tab: 'performance' },
	{ key: '3', label: 'Agents', tab: 'agents' },
	{ key: '4', label: 'Cache', tab: 'cache' },
	{ key: '5', label: 'Audit', tab: 'audit' }
];

// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
export function TabBar({ activeTab }: { activeTab: DashboardTab }): React.JSX.Element {
	return (
		<Box marginBottom={1}>
			{TAB_CONFIG.map((config) => {
				const isActive = config.tab === activeTab;
				return (
					<Box key={config.tab} marginRight={1}>
						<Text backgroundColor={isActive ? 'cyan' : undefined} bold={isActive} color={isActive ? 'black' : 'white'}>
							{' '}
							{config.key}:{config.label}{' '}
						</Text>
					</Box>
				);
			})}
		</Box>
	);
}
