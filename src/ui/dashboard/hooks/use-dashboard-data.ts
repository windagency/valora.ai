/**
 * Dashboard data fetching hook
 */

import { useCallback, useState } from 'react';

import type { BackgroundTask, DashboardData, RecentCommand, WorktreeDiagramEntry } from 'ui/dashboard/types';

import { ExplorationStateManager } from 'exploration/exploration-state';
import { WorktreeManager } from 'exploration/worktree-manager';
import { getMCPAuditLogger } from 'mcp/mcp-audit-logger.service';
import { SessionStore } from 'session/store';

const INITIAL_DATA: DashboardData = {
	activeSessions: [],
	backgroundTasks: [],
	mcpMetrics: null,
	metricsSummary: null,
	recentCommands: [],
	systemHealth: {
		apiStatus: 'healthy',
		diskUsage: '0 MB',
		sessionsCount: 0,
		uptime: 0
	},
	worktrees: []
};

export function useDashboardData(): {
	data: DashboardData;
	fetchData: () => Promise<void>;
	sessionStore: SessionStore;
} {
	const [startTime] = useState(() => Date.now());
	const [data, setData] = useState<DashboardData>(INITIAL_DATA);
	const [sessionStore] = useState(() => new SessionStore());
	const [worktreeManager] = useState(() => new WorktreeManager());
	const [explorationStateManager] = useState(() => new ExplorationStateManager());
	const fetchData = useCallback(async (): Promise<void> => {
		try {
			const [sessions, rawWorktrees, activeExplorations] = await Promise.all([
				sessionStore.listSessions(),
				worktreeManager.listWorktrees().catch(() => []),
				explorationStateManager.getActiveExplorations().catch(() => [])
			]);

			const worktreeEntries: WorktreeDiagramEntry[] = rawWorktrees.map((wt, index) => {
				const isExploration = wt.branch?.startsWith('exploration/') ?? false;
				const matchingExploration = isExploration
					? activeExplorations.find((exp) => wt.branch?.includes(exp.id))
					: undefined;

				return {
					branch: wt.branch ?? '(detached)',
					commit: wt.commit?.substring(0, 7) ?? '',
					explorationId: matchingExploration?.id,
					explorationStatus: matchingExploration?.status,
					explorationTask: matchingExploration?.task,
					isExploration,
					isMainWorktree: index === 0,
					path: wt.path,
					prunable: wt.prunable
				};
			});

			const activeSessions = sessions.slice(0, 10);

			const recentCommands: RecentCommand[] = sessions
				.slice(0, 10)
				.filter((s) => s.last_command)
				.map(
					(s): RecentCommand => ({
						agent: 'default',
						command: s.last_command!,
						status: s.status === 'failed' ? 'failed' : s.status === 'active' ? 'running' : 'success',
						timestamp: s.updated_at
					})
				)
				.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
				.slice(0, 5);

			const totalBytes = sessions.reduce((sum, s) => sum + (s.size_bytes || 0), 0);
			const mb = (totalBytes / 1024 / 1024).toFixed(2);

			const seenIds = new Set<string>();
			const backgroundTasks: BackgroundTask[] = sessions
				.filter((s) => {
					if (s.status !== 'active' || seenIds.has(s.session_id)) return false;
					seenIds.add(s.session_id);
					return true;
				})
				.map((s) => ({
					id: s.session_id,
					name: s.current_command ? `${s.session_id}: ${s.current_command}` : s.session_id,
					progress: -1,
					startedAt: s.updated_at,
					status: 'running' as const
				}));

			const rawMcpMetrics = getMCPAuditLogger().getDashboardMetrics();
			const mcpMetrics = rawMcpMetrics.totalToolCalls === 0 ? null : rawMcpMetrics;

			setData((prev) => ({
				...prev,
				activeSessions,
				backgroundTasks,
				mcpMetrics,
				recentCommands,
				systemHealth: {
					apiStatus: 'healthy',
					diskUsage: `${mb} MB`,
					sessionsCount: sessions.length,
					uptime: Date.now() - startTime
				},
				worktrees: worktreeEntries
			}));
		} catch {
			// Silent fail for refresh errors
		}
	}, [sessionStore, worktreeManager, explorationStateManager, startTime]);

	return { data, fetchData, sessionStore };
}
