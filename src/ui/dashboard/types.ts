/**
 * Dashboard TUI - Shared type definitions
 */

import type { MCPDashboardMetrics } from 'types/mcp-client.types';
import type { SessionSummary } from 'types/session.types';

export interface BackgroundTask {
	id: string;
	name: string;
	progress: number;
	startedAt?: string;
	status: 'completed' | 'failed' | 'running';
}

export interface DashboardData {
	activeSessions: SessionSummary[];
	backgroundTasks: BackgroundTask[];
	mcpMetrics: MCPDashboardMetrics | null;
	metricsSummary: MetricsSummary | null;
	recentCommands: RecentCommand[];
	systemHealth: SystemHealth;
	worktrees: WorktreeDiagramEntry[];
}

export interface MetricsSummary {
	avgReviewScore: number;
	cacheHitRate: number;
	earlyExits: number;
	errors: number;
	patterns: number;
	timeSavedMinutes: number;
	/** Number of individual tool call failures this session */
	toolExecutionFailures: number;
	/** Number of times a stage hit the tool loop iteration limit this session */
	toolLoopExhaustions: number;
	totalCommands: number;
	totalTokens: number;
}

export interface RecentCommand {
	agent: string;
	command: string;
	status: 'failed' | 'running' | 'success';
	timestamp: string;
}

export interface SystemHealth {
	apiStatus: 'degraded' | 'healthy' | 'offline';
	diskUsage: string;
	sessionsCount: number;
	uptime: number;
}

export interface WorktreeDiagramEntry {
	branch: string;
	commit: string;
	explorationId?: string;
	explorationStatus?: string;
	explorationTask?: string;
	isExploration: boolean;
	isMainWorktree: boolean;
	path: string;
	prunable: boolean;
}

/** Top-level dashboard tabs */
export type DashboardTab = 'agents' | 'audit' | 'cache' | 'overview' | 'performance';

/** Session details sub-tabs */
export type SessionSubTab = 'optimization' | 'overview' | 'quality' | 'tokens';

/** Navigation view mode */
export type ViewMode = 'dashboard' | 'details';
