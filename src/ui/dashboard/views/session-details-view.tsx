/**
 * Session Details View - Enhanced with sub-tabs
 */

import React, { useEffect, useState } from 'react';

import type { Session, WorktreeUsageStats } from 'types/session.types';
import type { SessionSubTab } from 'ui/dashboard/types';

import { getMCPAuditLogger } from 'mcp/mcp-audit-logger.service';
import { CommandHistoryPanel } from 'ui/dashboard/detail-panels/command-history-panel';
import { ExplorationInfoPanel } from 'ui/dashboard/detail-panels/exploration-info-panel';
import { OptimizationPanel } from 'ui/dashboard/detail-panels/optimization-panel';
import { QualityPanel } from 'ui/dashboard/detail-panels/quality-panel';
import { RunningTaskPanel } from 'ui/dashboard/detail-panels/running-task-panel';
import { SessionInfoPanel } from 'ui/dashboard/detail-panels/session-info-panel';
import { SpendingPanel } from 'ui/dashboard/detail-panels/spending-panel';
import { TokenUsagePanel } from 'ui/dashboard/detail-panels/token-usage-panel';
import { MCPSessionPanel } from 'ui/dashboard/detail-panels/tool-calls-panel';
import { WorktreeStatsPanel } from 'ui/dashboard/detail-panels/worktree-stats-panel';
import { getTUIAdapter } from 'ui/tui-adapter.interface';

const tui = getTUIAdapter();
// eslint-disable-next-line @typescript-eslint/naming-convention -- Box and Text are React components which require PascalCase
const { Box, Text } = tui;

const SUB_TAB_CONFIG: Array<{ label: string; tab: SessionSubTab }> = [
	{ label: 'Overview', tab: 'overview' },
	{ label: 'Optimisation', tab: 'optimization' },
	{ label: 'Quality', tab: 'quality' },
	{ label: 'Tokens', tab: 'tokens' },
	{ label: 'Spending', tab: 'spending' }
];

// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
export function SessionDetailsView({
	activeSubTab,
	onBack,
	onExit,
	session
}: {
	activeSubTab: SessionSubTab;
	onBack: () => void;
	onExit: () => void;
	session: Session;
}): React.JSX.Element {
	const [, setTick] = useState(0);

	useEffect(() => {
		if (session.status !== 'active') return;
		const interval = setInterval(() => setTick((t) => t + 1), 1000);
		return () => clearInterval(interval);
	}, [session.status]);

	tui.useInput((input, key) => {
		if (key.escape || input === 'q') {
			onBack();
		} else if (key.ctrl && input === 'c') {
			onExit();
		}
	});

	return (
		<Box flexDirection="column" paddingX={1}>
			<Box borderColor="cyan" borderStyle="round" marginBottom={1} paddingX={1}>
				<Text bold color="cyan">
					Session Details: {session.session_id}
				</Text>
			</Box>

			{/* Sub-tab bar */}
			<Box marginBottom={1}>
				{SUB_TAB_CONFIG.map((config) => {
					const isActive = config.tab === activeSubTab;
					return (
						<Box key={config.tab} marginRight={1}>
							<Text
								backgroundColor={isActive ? 'cyan' : undefined}
								bold={isActive}
								color={isActive ? 'black' : 'white'}>
								{' '}
								{config.label}{' '}
							</Text>
						</Box>
					);
				})}
				<Text dimColor> ([/] switch)</Text>
			</Box>

			<SubTabContent activeSubTab={activeSubTab} session={session} />

			<Box borderColor="white" borderStyle="round" paddingX={1}>
				<Text dimColor>
					Press <Text color="cyan">[/]</Text> to switch sub-tabs, <Text color="cyan">q</Text> or{' '}
					<Text color="cyan">Esc</Text> to go back
				</Text>
			</Box>
		</Box>
	);
}

// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
function OverviewContent({ session }: { session: Session }): React.JSX.Element {
	const isRunning = session.status === 'active';
	const elapsedMs = isRunning ? Date.now() - new Date(session.updated_at).getTime() : 0;
	const worktreeStats = session.context?.['worktree_stats'] as undefined | WorktreeUsageStats;
	const explorationId = session.context?.['exploration_id'] as string | undefined;
	const mcpMetrics = getMCPAuditLogger().getDashboardMetrics();

	return (
		<>
			<SessionInfoPanel session={session} />

			{isRunning && session.current_command && (
				<RunningTaskPanel command={session.current_command} elapsedMs={elapsedMs} />
			)}

			<ExplorationInfoPanel explorationId={explorationId} sessionId={session.session_id} />

			{mcpMetrics.totalToolCalls > 0 && <MCPSessionPanel metrics={mcpMetrics} />}

			<CommandHistoryPanel session={session} />

			{worktreeStats && worktreeStats.total_created > 0 && <WorktreeStatsPanel stats={worktreeStats} />}
		</>
	);
}

// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
function SubTabContent({
	activeSubTab,
	session
}: {
	activeSubTab: SessionSubTab;
	session: Session;
}): React.JSX.Element {
	switch (activeSubTab) {
		case 'optimization':
			return <OptimizationPanel session={session} />;
		case 'quality':
			return <QualityPanel session={session} />;
		case 'spending':
			return <SpendingPanel session={session} />;
		case 'tokens':
			return <TokenUsagePanel session={session} />;
		default:
			return <OverviewContent session={session} />;
	}
}
