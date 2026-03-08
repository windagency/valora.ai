/**
 * Dashboard TUI - Real-time dashboard for monitoring sessions and system health
 * Built with Ink (modern React-based TUI framework)
 *
 * Root shell that composes modular components from ./dashboard/
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import type { Session } from 'types/session.types';

import type { DashboardTab } from './dashboard/types';

import { Header } from './dashboard/components/header';
import { HelpBar } from './dashboard/components/help-bar';
import { TabBar } from './dashboard/components/tab-bar';
import { useDashboardData } from './dashboard/hooks/use-dashboard-data';
import { useMetricsData } from './dashboard/hooks/use-metrics-data';
import { useNavigation } from './dashboard/hooks/use-navigation';
import { AgentAnalyticsView } from './dashboard/views/agent-analytics-view';
import { AuditLogView } from './dashboard/views/audit-log-view';
import { CacheStatsView } from './dashboard/views/cache-stats-view';
import { DashboardView } from './dashboard/views/dashboard-view';
import { PerformanceView } from './dashboard/views/performance-view';
import { SessionDetailsView } from './dashboard/views/session-details-view';
import { getTUIAdapter } from './tui-adapter.interface';

// Re-export types for backward compatibility
export type {
	BackgroundTask,
	DashboardData,
	RecentCommand,
	SystemHealth,
	WorktreeDiagramEntry
} from './dashboard/types';
export { formatDurationMs } from './dashboard/utils/format-helpers';

const tui = getTUIAdapter();
// eslint-disable-next-line @typescript-eslint/naming-convention -- Box and Text are React components which require PascalCase
const { Box } = tui;

const TAB_KEYS: Record<string, DashboardTab> = {
	'1': 'overview',
	'2': 'performance',
	'3': 'agents',
	'4': 'cache',
	'5': 'audit'
};

/**
 * Main Dashboard Component
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
function Dashboard(): React.JSX.Element {
	const { exit } = tui.useApp();
	const nav = useNavigation();
	const { data, fetchData, sessionStore } = useDashboardData();
	const { agentData, auditData, cacheData, computeMetricsSummary, performanceData } = useMetricsData(nav.activeTab);
	const [selectedSession, setSelectedSession] = useState<null | Session>(null);

	const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
	const exitTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const selectedSessionRef = useRef<null | Session>(null);
	selectedSessionRef.current = selectedSession;

	// Auto-refresh
	useEffect(() => {
		void fetchData();

		if (refreshIntervalRef.current) {
			clearInterval(refreshIntervalRef.current);
		}

		refreshIntervalRef.current = setInterval(() => {
			if (nav.viewMode === 'dashboard' && nav.activeTab === 'overview') {
				void fetchData();
			} else if (nav.viewMode === 'details' && selectedSessionRef.current) {
				sessionStore
					.loadSession(selectedSessionRef.current.session_id)
					.then((refreshedSession) => setSelectedSession(refreshedSession))
					.catch(() => {});
			}
		}, 1000);

		return () => {
			if (refreshIntervalRef.current) {
				clearInterval(refreshIntervalRef.current);
				refreshIntervalRef.current = null;
			}
		};
	}, [nav.viewMode, nav.activeTab, fetchData, sessionStore]);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (refreshIntervalRef.current) {
				clearInterval(refreshIntervalRef.current);
				refreshIntervalRef.current = null;
			}
			if (exitTimeoutRef.current) {
				clearTimeout(exitTimeoutRef.current);
				exitTimeoutRef.current = null;
			}
		};
	}, []);

	// Compute metrics summary on overview tab activation
	useEffect(() => {
		if (nav.activeTab === 'overview') {
			void computeMetricsSummary().then((summary) => {
				if (summary) {
					// Update data with metrics summary via a separate effect
					data.metricsSummary = summary;
				}
			});
		}
	}, [nav.activeTab]);

	const handleExit = useCallback((): void => {
		if (refreshIntervalRef.current) {
			clearInterval(refreshIntervalRef.current);
			refreshIntervalRef.current = null;
		}
		if (exitTimeoutRef.current) return;

		exit();
		exitTimeoutRef.current = setTimeout(() => {
			process.exit(0);
		}, 100);
	}, [exit]);

	const handleViewSessionDetails = useCallback((): void => {
		if (data.activeSessions.length === 0) return;
		const session = data.activeSessions[nav.selectedIndex];
		if (!session) return;

		sessionStore
			.loadSession(session.session_id)
			.then((fullSession) => {
				setSelectedSession(fullSession);
				nav.switchToDetails();
			})
			.catch(() => {});
	}, [data.activeSessions, nav, sessionStore]);

	const handleDetailsInput = useCallback(
		(input: string): void => {
			if (input === ']') {
				nav.nextSubTab();
			} else if (input === '[') {
				nav.prevSubTab();
			}
		},
		[nav]
	);

	const handleRefresh = useCallback((): void => {
		void fetchData();
		if (nav.activeTab === 'overview') {
			void computeMetricsSummary().then((summary) => {
				if (summary) data.metricsSummary = summary;
			});
		}
	}, [fetchData, computeMetricsSummary, nav.activeTab, data]);

	const handleDashboardNavigation = useCallback(
		(
			input: string,
			key: { downArrow?: boolean; return?: boolean; shift?: boolean; tab?: boolean; upArrow?: boolean }
		): void => {
			if (input === 'j' || key.downArrow) {
				nav.navigateDown(data.activeSessions.length - 1);
			} else if (input === 'k' || key.upArrow) {
				nav.navigateUp();
			} else if (key.return && nav.activeTab === 'overview') {
				handleViewSessionDetails();
			} else if (key.tab) {
				if (key.shift) {
					nav.prevTab();
				} else {
					nav.nextTab();
				}
			}
		},
		[nav, data.activeSessions.length, handleViewSessionDetails]
	);

	// Keyboard input
	tui.useInput((input, key) => {
		if (nav.viewMode === 'details') {
			handleDetailsInput(input);
			return;
		}

		if ((key.ctrl && input === 'c') || input === 'q' || Boolean(key.escape)) {
			handleExit();
			return;
		}

		if (input in TAB_KEYS) {
			nav.setTab(TAB_KEYS[input]!);
			return;
		}

		if (input === 'r') {
			handleRefresh();
		} else {
			handleDashboardNavigation(input, key);
		}
	});

	// Render session details
	if (nav.viewMode === 'details' && selectedSession) {
		return (
			<Box flexDirection="column">
				<Header />
				<SessionDetailsView
					activeSubTab={nav.sessionSubTab}
					onBack={() => {
						nav.switchToDashboard();
						setSelectedSession(null);
					}}
					onExit={handleExit}
					session={selectedSession}
				/>
			</Box>
		);
	}

	// Render dashboard with tabs
	return (
		<Box flexDirection="column" paddingX={1}>
			<Header />
			<TabBar activeTab={nav.activeTab} />
			<Box flexGrow={1}>
				{nav.activeTab === 'overview' && <DashboardView data={data} selectedIndex={nav.selectedIndex} />}
				{nav.activeTab === 'performance' && <PerformanceView data={performanceData} />}
				{nav.activeTab === 'agents' && <AgentAnalyticsView data={agentData} />}
				{nav.activeTab === 'cache' && <CacheStatsView data={cacheData} />}
				{nav.activeTab === 'audit' && <AuditLogView data={auditData} />}
			</Box>
			<Box marginTop={1}>
				<HelpBar activeTab={nav.activeTab} hasSubTabs={nav.viewMode === 'details'} mode={nav.viewMode} />
			</Box>
		</Box>
	);
}

/**
 * Start the dashboard
 */
export function startDashboard(): void {
	const { clear, unmount, waitUntilExit } = tui.render(<Dashboard />);

	const handleSignal = (): void => {
		clear();
		unmount();
		process.exit(0);
	};

	process.on('SIGINT', handleSignal);
	process.on('SIGTERM', handleSignal);

	void waitUntilExit().then(() => {
		process.removeListener('SIGINT', handleSignal);
		process.removeListener('SIGTERM', handleSignal);
	});
}
