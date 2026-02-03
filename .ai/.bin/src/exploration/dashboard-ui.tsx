/**
 * Exploration Dashboard UI - Real-time terminal dashboard
 *
 * Interactive terminal UI for monitoring exploration progress
 */

import type { ContainerStats, Exploration, Insight, WorktreeExploration } from 'types/exploration.types';

import React, { useEffect, useState } from 'react';
import { getTUIAdapter, type RenderResult } from 'ui/tui-adapter.interface';

import {
	type ContainerStatsEvent,
	type ExplorationEvent,
	getExplorationEvents,
	type InsightEvent,
	type ProgressEvent,
	type WorktreeEvent
} from './exploration-events';

const tui = getTUIAdapter();
// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must be PascalCase
const { Box, Newline, Text } = tui;

interface DashboardProps {
	explorationId: string;
	initialExploration?: Exploration;
}

interface DashboardState {
	containerStats: Map<number, ContainerStats>;
	exploration?: Exploration;
	lastUpdate: string;
	recentInsights: Insight[];
}

/**
 * Progress bar component
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- React component must be PascalCase
const ProgressBar: React.FC<{ color?: string; percentage: number; width: number }> = ({
	color = 'green',
	percentage,
	width
}) => {
	const filled = Math.floor((percentage / 100) * width);
	const empty = width - filled;

	const bar = '█'.repeat(filled) + '░'.repeat(empty);

	return <Text color={color}>{bar}</Text>;
};

/**
 * Worktree status display
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- React component must be PascalCase
const WorktreeStatus: React.FC<{
	stats?: ContainerStats;
	worktree: WorktreeExploration;
}> = ({ stats, worktree }) => {
	const statusColor =
		worktree.status === 'completed'
			? 'green'
			: worktree.status === 'running'
				? 'cyan'
				: worktree.status === 'failed'
					? 'red'
					: 'yellow';

	const statusIcon =
		worktree.status === 'completed'
			? '✓'
			: worktree.status === 'running'
				? '▶'
				: worktree.status === 'failed'
					? '✗'
					: '○';

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Box>
				<Text bold color={statusColor}>
					{statusIcon} Worktree {worktree.index}
				</Text>
				{worktree.strategy && <Text dimColor> ({worktree.strategy})</Text>}
				<Text dimColor> - </Text>
				<Text color={statusColor}>{worktree.status}</Text>
			</Box>

			<Box marginLeft={2}>
				<Text dimColor>Progress: </Text>
				<ProgressBar color={statusColor} percentage={worktree.progress.percentage} width={30} />
				<Text dimColor> {worktree.progress.percentage}%</Text>
			</Box>

			<Box marginLeft={2}>
				<Text dimColor>Stage: {worktree.progress.current_stage}</Text>
			</Box>

			{stats && (
				<Box marginLeft={2}>
					<Text dimColor>
						CPU: {stats.cpu_usage_percent.toFixed(1)}% | Memory: {stats.memory_usage_mb.toFixed(0)}MB /{' '}
						{stats.memory_limit_mb}MB | Uptime: {Math.floor(stats.uptime_seconds)}s
					</Text>
				</Box>
			)}

			{worktree.progress.errors.length > 0 && (
				<Box marginLeft={2}>
					<Text color="red">Errors: {worktree.progress.errors.length}</Text>
				</Box>
			)}
		</Box>
	);
};

/**
 * Insights feed component
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- React component must be PascalCase
const InsightsFeed: React.FC<{ insights: Insight[]; maxItems?: number }> = ({ insights, maxItems = 5 }) => {
	const recentInsights = insights.slice(-maxItems).reverse();

	if (recentInsights.length === 0) {
		return (
			<Box>
				<Text dimColor>No insights yet...</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			{recentInsights.map((insight) => (
				<Box flexDirection="column" key={insight.id} marginBottom={1}>
					<Box>
						<Text color="cyan">• </Text>
						<Text bold>{insight.title}</Text>
						<Text dimColor> (worktree {insight.worktree_id.split('-').pop()})</Text>
					</Box>
					<Box marginLeft={2}>
						<Text dimColor>
							{insight.content.length > 80 ? `${insight.content.substring(0, 80)}...` : insight.content}
						</Text>
					</Box>
				</Box>
			))}
		</Box>
	);
};

/**
 * Main dashboard component
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- React component must be PascalCase
export const ExplorationDashboard: React.FC<DashboardProps> = ({ explorationId, initialExploration }) => {
	const { exit } = tui.useApp();
	const [state, setState] = useState<DashboardState>({
		containerStats: new Map(),
		exploration: initialExploration,
		lastUpdate: new Date().toISOString(),
		recentInsights: []
	});

	// Keyboard controls
	tui.useInput((input, key) => {
		if (input === 'q' || (key.ctrl && input === 'c')) {
			exit();
		}
	});

	// Subscribe to exploration events
	useEffect(() => {
		const eventEmitter = getExplorationEvents();

		const handleExplorationUpdate = (event: ExplorationEvent): void => {
			if (event.exploration_id !== explorationId) return;

			const eventData = event.data as { exploration?: Exploration };

			setState((prev) => ({
				...prev,
				exploration: eventData.exploration,
				lastUpdate: event.timestamp
			}));
		};

		const handleWorktreeUpdate = (event: WorktreeEvent): void => {
			if (event.exploration_id !== explorationId) return;

			setState((prev) => {
				const exploration = prev.exploration;
				if (!exploration) return prev;

				const worktrees = [...exploration.worktrees];
				const worktreeIndex = event.worktree_index - 1;

				if (worktrees[worktreeIndex]) {
					worktrees[worktreeIndex] = event.data.worktree;
				}

				return {
					...prev,
					exploration: { ...exploration, worktrees },
					lastUpdate: event.timestamp
				};
			});
		};

		const handleProgressUpdate = (event: ProgressEvent): void => {
			if (event.exploration_id !== explorationId) return;

			setState((prev) => {
				const exploration = prev.exploration;
				if (!exploration) return prev;

				const worktrees = [...exploration.worktrees];
				const worktreeIndex = event.worktree_index - 1;

				if (worktrees[worktreeIndex]) {
					worktrees[worktreeIndex] = {
						...worktrees[worktreeIndex],
						progress: {
							current_stage: event.data.current_stage,
							errors: worktrees[worktreeIndex].progress.errors,
							insights_published: worktrees[worktreeIndex].progress.insights_published,
							last_update: event.timestamp,
							percentage: event.data.percentage,
							stages_completed: event.data.stages_completed
						}
					};
				}

				return {
					...prev,
					exploration: { ...exploration, worktrees },
					lastUpdate: event.timestamp
				};
			});
		};

		const handleContainerStats = (event: ContainerStatsEvent): void => {
			if (event.exploration_id !== explorationId) return;

			setState((prev) => {
				// Only create new Map if stats actually changed to reduce memory churn
				const existingStats = prev.containerStats.get(event.worktree_index);
				if (existingStats === event.data.stats) return prev;

				const newStats = new Map(prev.containerStats);
				newStats.set(event.worktree_index, event.data.stats);

				return {
					...prev,
					containerStats: newStats,
					lastUpdate: event.timestamp
				};
			});
		};

		const handleInsight = (event: InsightEvent): void => {
			if (event.exploration_id !== explorationId) return;

			setState((prev) => ({
				...prev,
				lastUpdate: event.timestamp,
				// Keep only the last 100 insights to prevent unbounded memory growth
				recentInsights: [...prev.recentInsights, event.data.insight].slice(-100)
			}));
		};

		// Register event listeners
		eventEmitter.on('exploration:started', handleExplorationUpdate);
		eventEmitter.on('exploration:completed', handleExplorationUpdate);
		eventEmitter.on('exploration:failed', handleExplorationUpdate);
		eventEmitter.on('exploration:stopped', handleExplorationUpdate);

		eventEmitter.on('worktree:started', handleWorktreeUpdate);
		eventEmitter.on('worktree:completed', handleWorktreeUpdate);
		eventEmitter.on('worktree:failed', handleWorktreeUpdate);
		eventEmitter.on('worktree:progress', handleProgressUpdate);

		eventEmitter.on('container:stats', handleContainerStats);

		eventEmitter.on('insight:published', handleInsight);

		// Cleanup
		return () => {
			eventEmitter.off('exploration:started', handleExplorationUpdate);
			eventEmitter.off('exploration:completed', handleExplorationUpdate);
			eventEmitter.off('exploration:failed', handleExplorationUpdate);
			eventEmitter.off('exploration:stopped', handleExplorationUpdate);

			eventEmitter.off('worktree:started', handleWorktreeUpdate);
			eventEmitter.off('worktree:completed', handleWorktreeUpdate);
			eventEmitter.off('worktree:failed', handleWorktreeUpdate);
			eventEmitter.off('worktree:progress', handleProgressUpdate);

			eventEmitter.off('container:stats', handleContainerStats);

			eventEmitter.off('insight:published', handleInsight);
		};
	}, [explorationId]);

	const { containerStats, exploration, lastUpdate, recentInsights } = state;

	if (!exploration) {
		return (
			<Box flexDirection="column">
				<Box>
					<Text color="cyan">⏳ Loading exploration...</Text>
				</Box>
			</Box>
		);
	}

	const statusColor =
		exploration.status === 'completed'
			? 'green'
			: exploration.status === 'running'
				? 'cyan'
				: exploration.status === 'failed'
					? 'red'
					: 'yellow';

	const overallProgress = Math.floor(
		exploration.worktrees.reduce((sum, wt) => sum + wt.progress.percentage, 0) / exploration.branches || 0
	);

	return (
		<Box flexDirection="column" padding={1}>
			{/* Header */}
			<Box borderColor="cyan" borderStyle="round" marginBottom={1} padding={1}>
				<Box flexDirection="column" width="100%">
					<Box>
						<Text bold color="cyan">
							🔬 Exploration Dashboard
						</Text>
						<Text dimColor> - {exploration.id}</Text>
					</Box>
					<Box>
						<Text dimColor>Task: </Text>
						<Text>{exploration.task}</Text>
					</Box>
					<Box>
						<Text dimColor>Status: </Text>
						<Text bold color={statusColor}>
							{exploration.status.toUpperCase()}
						</Text>
						<Text dimColor> | Mode: {exploration.mode}</Text>
						<Text dimColor>
							{' '}
							| Completed: {exploration.completed_branches}/{exploration.branches}
						</Text>
					</Box>
					<Box marginTop={1}>
						<Text dimColor>Overall Progress: </Text>
						<ProgressBar color="cyan" percentage={overallProgress} width={40} />
						<Text dimColor> {overallProgress}%</Text>
					</Box>
				</Box>
			</Box>

			{/* Worktrees Section */}
			<Box borderColor="yellow" borderStyle="round" marginBottom={1} padding={1}>
				<Box flexDirection="column" width="100%">
					<Text bold color="yellow">
						📊 Worktrees
					</Text>
					<Newline />
					{exploration.worktrees.map((worktree) => (
						<WorktreeStatus key={worktree.index} stats={containerStats.get(worktree.index)} worktree={worktree} />
					))}
				</Box>
			</Box>

			{/* Insights Section */}
			<Box borderColor="magenta" borderStyle="round" marginBottom={1} padding={1}>
				<Box flexDirection="column" width="100%">
					<Text bold color="magenta">
						💡 Recent Insights
					</Text>
					<Newline />
					<InsightsFeed insights={recentInsights} maxItems={5} />
				</Box>
			</Box>

			{/* Footer */}
			<Box>
				<Text dimColor>Last update: {new Date(lastUpdate).toLocaleTimeString()} | Press Q to quit</Text>
			</Box>
		</Box>
	);
};

/**
 * Launch dashboard in separate process
 */
export function launchDashboard(explorationId: string, exploration?: Exploration): RenderResult {
	const instance = tui.render(
		React.createElement(ExplorationDashboard, {
			explorationId,
			initialExploration: exploration
		})
	);

	// Return instance for cleanup if needed
	return instance;
}
