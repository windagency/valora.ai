/**
 * Dashboard module - barrel export
 */

// Types
export type {
	BackgroundTask,
	DashboardData,
	DashboardTab,
	MetricsSummary,
	RecentCommand,
	SessionSubTab,
	SystemHealth,
	ViewMode,
	WorktreeDiagramEntry
} from './types';

// Hooks
export { useDashboardData } from './hooks/use-dashboard-data';
export { useMetricsData } from './hooks/use-metrics-data';
export { useNavigation } from './hooks/use-navigation';

// Components
export { Header } from './components/header';
export { HelpBar } from './components/help-bar';
export { TabBar } from './components/tab-bar';

// Panels
export { ActiveSessionsPanel } from './panels/active-sessions-panel';
export { BackgroundTasksPanel } from './panels/background-tasks-panel';
export { MetricsSummaryPanel } from './panels/metrics-summary-panel';
export { RecentCommandsPanel } from './panels/recent-commands-panel';
export { MCPMetricsPanel } from './panels/server-metrics-panel';
export { SystemHealthPanel } from './panels/system-health-panel';
export { WorktreeDiagramPanel } from './panels/worktree-diagram-panel';

// Views
export { AgentAnalyticsView } from './views/agent-analytics-view';
export { AuditLogView } from './views/audit-log-view';
export { CacheStatsView } from './views/cache-stats-view';
export { DashboardView } from './views/dashboard-view';
export { PerformanceView } from './views/performance-view';
export { SessionDetailsView } from './views/session-details-view';

// Session Panels
export { CommandHistoryPanel } from './detail-panels/command-history-panel';
export { ExplorationInfoPanel } from './detail-panels/exploration-info-panel';
export { OptimizationPanel } from './detail-panels/optimization-panel';
export { QualityPanel } from './detail-panels/quality-panel';
export { RunningTaskPanel } from './detail-panels/running-task-panel';
export { SessionInfoPanel } from './detail-panels/session-info-panel';
export { SpendingPanel } from './detail-panels/spending-panel';
export { TokenUsagePanel } from './detail-panels/token-usage-panel';
export { MCPSessionPanel } from './detail-panels/tool-calls-panel';
export { WorktreeStatsPanel } from './detail-panels/worktree-stats-panel';

// Utilities
export { formatAge, formatDurationMs, getContextColor, getStatusColor } from './utils/format-helpers';
