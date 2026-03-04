/**
 * Dashboard View - Main overview two-column layout
 */

import React from 'react';
import { getTUIAdapter } from 'ui/tui-adapter.interface';

import type { DashboardData } from '../types';

import { ActiveSessionsPanel } from '../panels/active-sessions-panel';
import { BackgroundTasksPanel } from '../panels/background-tasks-panel';
import { MetricsSummaryPanel } from '../panels/metrics-summary-panel';
import { RecentCommandsPanel } from '../panels/recent-commands-panel';
import { MCPMetricsPanel } from '../panels/server-metrics-panel';
import { SystemHealthPanel } from '../panels/system-health-panel';
import { WorktreeDiagramPanel } from '../panels/worktree-diagram-panel';

const tui = getTUIAdapter();
// eslint-disable-next-line @typescript-eslint/naming-convention -- Box and Text are React components which require PascalCase
const { Box } = tui;

// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
export function DashboardView({
	data,
	selectedIndex
}: {
	data: DashboardData;
	selectedIndex: number;
}): React.JSX.Element {
	return (
		<Box flexDirection="column">
			{data.metricsSummary && (
				<Box marginBottom={1}>
					<MetricsSummaryPanel summary={data.metricsSummary} />
				</Box>
			)}
			<Box flexGrow={1}>
				<Box flexDirection="column" width="65%">
					<ActiveSessionsPanel selectedIndex={selectedIndex} sessions={data.activeSessions} />
					<Box marginTop={1}>
						<BackgroundTasksPanel tasks={data.backgroundTasks} />
					</Box>
				</Box>
				<Box flexDirection="column" marginLeft={1} width="35%">
					<SystemHealthPanel health={data.systemHealth} />
					<Box marginTop={1}>
						<WorktreeDiagramPanel worktrees={data.worktrees} />
					</Box>
					{data.mcpMetrics && (
						<Box marginTop={1}>
							<MCPMetricsPanel metrics={data.mcpMetrics} />
						</Box>
					)}
					<Box marginTop={1}>
						<RecentCommandsPanel commands={data.recentCommands} />
					</Box>
				</Box>
			</Box>
		</Box>
	);
}
