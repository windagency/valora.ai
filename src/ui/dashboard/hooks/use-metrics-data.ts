/**
 * Metrics data fetching hook - per-tab data with tiered refresh rates
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { DashboardTab, MetricsSummary } from 'ui/dashboard/types';

import { getDryRunCache } from 'executor/dry-run-cache';
import { getStageOutputCache } from 'executor/stage-output-cache';
import { getMCPAuditLogger } from 'mcp/mcp-audit-logger.service';
import { type AgentSelectionMetrics, getAgentSelectionAnalytics } from 'services/agent-selection-analytics.service';
import { SessionStore } from 'session/store';
import {
	type CounterMetric,
	type GaugeMetric,
	getMetricsCollector,
	type HistogramMetric,
	type MetricsSnapshot
} from 'utils/metrics-collector';

export interface AgentAnalyticsData {
	metrics: AgentSelectionMetrics | null;
	successMetrics: null | {
		accuracy: number;
		completionRate: number;
		insights: string[];
		performance: number;
		userSatisfaction: number;
	};
}

export interface AuditData {
	entries: Array<{
		details?: Record<string, unknown>;
		duration_ms?: number;
		error?: string;
		operation: string;
		serverId: string;
		success: boolean;
		timestamp: Date;
		toolName?: string;
	}>;
	stats: {
		byOperation: Record<string, number>;
		byServer: Record<string, number>;
		successRate: number;
		totalEntries: number;
	};
}

export interface CacheData {
	dryRunCache: { entries: Array<{ ageMs: number; commandName: string; key: string }>; size: number };
	stageOutputCache: { entries: Array<{ ageMs: number; savedTime_ms: number; stageId: string }>; size: number };
}

export interface PerformanceData {
	counters: CounterMetric[];
	gauges: GaugeMetric[];
	histograms: HistogramMetric[];
	snapshot: MetricsSnapshot | null;
}

const REFRESH_RATES: Record<DashboardTab, number> = {
	agents: 5000,
	audit: 3000,
	cache: 5000,
	overview: 1000,
	performance: 2000,
	usage: 10000
};

interface CmdOptMetrics {
	early_exit_triggered?: boolean;
	pattern_detected?: string;
	time_saved_minutes?: number;
}

interface CmdQualityMetrics {
	review_score?: number;
	tool_failures?: number;
	tool_loop_exhaustions?: number;
}

interface SessionAggregates {
	earlyExits: number;
	errors: number;
	patterns: number;
	reviewScoreCount: number;
	reviewScoreSum: number;
	timeSavedMinutes: number;
	toolFailures: number;
	toolLoopExhaustions: number;
}
export function useMetricsData(activeTab: DashboardTab): {
	agentData: AgentAnalyticsData;
	auditData: AuditData;
	cacheData: CacheData;
	computeMetricsSummary: () => Promise<MetricsSummary | null>;
	performanceData: PerformanceData;
} {
	const [performanceData, setPerformanceData] = useState<PerformanceData>({
		counters: [],
		gauges: [],
		histograms: [],
		snapshot: null
	});

	const [agentData, setAgentData] = useState<AgentAnalyticsData>({
		metrics: null,
		successMetrics: null
	});

	const [cacheData, setCacheData] = useState<CacheData>({
		dryRunCache: { entries: [], size: 0 },
		stageOutputCache: { entries: [], size: 0 }
	});

	const [auditData, setAuditData] = useState<AuditData>({
		entries: [],
		stats: { byOperation: {}, byServer: {}, successRate: 0, totalEntries: 0 }
	});

	const intervalRef = useRef<NodeJS.Timeout | null>(null);

	const fetchPerformance = useCallback(() => {
		try {
			const snapshot = getMetricsCollector().getSnapshot();
			setPerformanceData({
				counters: snapshot.counters,
				gauges: snapshot.gauges,
				histograms: snapshot.histograms,
				snapshot
			});
		} catch {
			// Silent fail
		}
	}, []);

	const fetchAgents = useCallback(() => {
		try {
			const analytics = getAgentSelectionAnalytics();
			const metrics = analytics.getMetrics(24);
			const successMetrics = analytics.getSuccessMetrics(168);
			setAgentData({ metrics, successMetrics });
		} catch {
			// Silent fail
		}
	}, []);

	const fetchCache = useCallback(() => {
		try {
			const dryRunStats = getDryRunCache().getStats();
			const stageStats = getStageOutputCache().getStats();
			setCacheData({
				dryRunCache: dryRunStats,
				stageOutputCache: stageStats
			});
		} catch {
			// Silent fail
		}
	}, []);

	const fetchAudit = useCallback(() => {
		try {
			const logger = getMCPAuditLogger();
			const entries = logger.getRecentEntries(100);
			const stats = logger.getStats();
			setAuditData({ entries, stats });
		} catch {
			// Silent fail
		}
	}, []);

	const computeMetricsSummary = useCallback((): Promise<MetricsSummary | null> => {
		return buildMetricsSummary();
	}, []);

	// Set up polling for active tab
	useEffect(() => {
		if (intervalRef.current) {
			clearInterval(intervalRef.current);
			intervalRef.current = null;
		}

		const fetchForTab = (): void => {
			switch (activeTab) {
				case 'agents':
					fetchAgents();
					break;
				case 'audit':
					fetchAudit();
					break;
				case 'cache':
					fetchCache();
					break;
				case 'performance':
					fetchPerformance();
					break;
				default:
					break;
			}
		};

		// Fetch immediately
		fetchForTab();

		// Set up interval
		const rate = REFRESH_RATES[activeTab];
		if (activeTab !== 'overview') {
			intervalRef.current = setInterval(fetchForTab, rate);
		}

		return () => {
			if (intervalRef.current) {
				clearInterval(intervalRef.current);
				intervalRef.current = null;
			}
		};
	}, [activeTab, fetchPerformance, fetchAgents, fetchCache, fetchAudit]);

	return { agentData, auditData, cacheData, computeMetricsSummary, performanceData };
}

function accumulateCommandMetrics(
	cmd: { error?: string; optimization_metrics?: CmdOptMetrics; quality_metrics?: CmdQualityMetrics },
	acc: SessionAggregates
): void {
	if (cmd.optimization_metrics) accumulateOptimizationMetrics(cmd.optimization_metrics, acc);
	if (cmd.quality_metrics) accumulateQualityMetrics(cmd.quality_metrics, acc);
	if (cmd.error) acc.errors++;
}

function accumulateOptimizationMetrics(opt: CmdOptMetrics, acc: SessionAggregates): void {
	if (opt.early_exit_triggered) acc.earlyExits++;
	if (opt.pattern_detected) acc.patterns++;
	acc.timeSavedMinutes += opt.time_saved_minutes ?? 0;
}

function accumulateQualityMetrics(q: CmdQualityMetrics, acc: SessionAggregates): void {
	if (q.review_score != null) {
		acc.reviewScoreSum += q.review_score;
		acc.reviewScoreCount++;
	}
	acc.toolFailures += q.tool_failures ?? 0;
	acc.toolLoopExhaustions += q.tool_loop_exhaustions ?? 0;
}

async function aggregateSessionMetrics(
	sessionStore: SessionStore,
	recentSessions: Array<{ session_id: string }>
): Promise<SessionAggregates> {
	const acc: SessionAggregates = {
		earlyExits: 0,
		errors: 0,
		patterns: 0,
		reviewScoreCount: 0,
		reviewScoreSum: 0,
		timeSavedMinutes: 0,
		toolFailures: 0,
		toolLoopExhaustions: 0
	};

	for (const s of recentSessions.slice(0, 5)) {
		try {
			const full = await sessionStore.loadSession(s.session_id);
			for (const cmd of full.commands) {
				accumulateCommandMetrics(cmd, acc);
			}
		} catch {
			// Skip sessions that fail to load
		}
	}
	return acc;
}

async function buildMetricsSummary(): Promise<MetricsSummary | null> {
	try {
		const sessionStore = new SessionStore();
		const sessions = await sessionStore.listSessions();
		const recentSessions = sessions.slice(0, 20);

		let totalCommands = 0;
		let totalTokens = 0;
		let summaryErrors = 0;

		for (const s of recentSessions) {
			totalCommands += s.command_count;
			totalTokens += s.total_tokens_used ?? 0;
			if (s.status === 'failed') summaryErrors++;
		}

		const detailed = await aggregateSessionMetrics(sessionStore, recentSessions);

		const dryRunStats = getDryRunCache().getStats();
		const stageStats = getStageOutputCache().getStats();
		const totalCacheEntries = dryRunStats.size + stageStats.size;
		const cacheHitRate = totalCacheEntries > 0 ? Math.min(100, totalCacheEntries * 10) : 0;

		const counters = getMetricsCollector().getSnapshot().counters;

		// Current-session counters (in-memory, reset each process start)
		const sessionLoopExhaustions = counters
			.filter((c) => c.name === 'tool_loop_exhausted')
			.reduce((sum, c) => sum + c.value, 0);
		const sessionToolFailures = counters
			.filter((c) => c.name === 'tool_execution_failed')
			.reduce((sum, c) => sum + c.value, 0);

		// Historical totals from persisted session quality_metrics (cross-session)
		const toolLoopExhaustions = sessionLoopExhaustions + detailed.toolLoopExhaustions;
		const toolExecutionFailures = sessionToolFailures + detailed.toolFailures;

		return {
			avgReviewScore: detailed.reviewScoreCount > 0 ? detailed.reviewScoreSum / detailed.reviewScoreCount : 0,
			cacheHitRate,
			earlyExits: detailed.earlyExits,
			errors: summaryErrors + detailed.errors,
			patterns: detailed.patterns,
			timeSavedMinutes: detailed.timeSavedMinutes,
			toolExecutionFailures,
			toolLoopExhaustions,
			totalCommands,
			totalTokens
		};
	} catch {
		return null;
	}
}
