/**
 * Dashboard Metrics - Real-time metrics visualization components
 *
 * Provides detailed metrics charts and statistics for exploration monitoring
 */

import type { ContainerStats, WorktreeExploration } from 'types/exploration.types';

import React from 'react';
import { getTUIAdapter } from 'ui/tui-adapter.interface';

const tui = getTUIAdapter();

/**
 * Format duration with hours, minutes, seconds, milliseconds when applicable
 */
function formatDuration(ms: number): string {
	if (ms < 1000) {
		return `${Math.round(ms)}ms`;
	}

	const hours = Math.floor(ms / 3600000);
	const minutes = Math.floor((ms % 3600000) / 60000);
	const seconds = Math.floor((ms % 60000) / 1000);
	const milliseconds = Math.round(ms % 1000);

	const parts: string[] = [];

	if (hours > 0) {
		parts.push(`${hours}h`);
	}
	if (minutes > 0 || hours > 0) {
		parts.push(`${minutes}m`);
	}
	if (seconds > 0 || minutes > 0 || hours > 0) {
		parts.push(`${seconds}s`);
	}
	if (milliseconds > 0 && hours === 0) {
		parts.push(`${milliseconds}ms`);
	}

	return parts.join(' ');
}
// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must be PascalCase
const { Box, Text } = tui;

interface MetricsHistory {
	cpu: number;
	memory: number;
	timestamp: number;
}

/**
 * Sparkline chart component for terminal
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- React component must be PascalCase
export const Sparkline: React.FC<{
	color?: string;
	data: number[];
	height?: number;
	width: number;
}> = ({ color = 'cyan', data, height = 4, width }) => {
	if (data.length === 0) {
		return <Text dimColor>No data</Text>;
	}

	const sampledData = resampleData(data, width);
	const lines = generateSparklines(sampledData, height, width);

	return (
		<Box flexDirection="column">
			{lines.map((line, i) => (
				<Text color={color} key={i}>
					{line}
				</Text>
			))}
		</Box>
	);
};

/**
 * Resample data to fit display width
 */
function resampleData(data: number[], width: number): number[] {
	const sampledData: number[] = [];
	const step = data.length / width;

	for (let i = 0; i < width; i++) {
		const index = Math.floor(i * step);
		sampledData.push(data[index] ?? 0);
	}

	return sampledData;
}

/**
 * Generate sparkline chart lines
 */
function generateSparklines(sampledData: number[], height: number, width: number): string[] {
	const { min, range } = calculateDataRange(sampledData);
	const lines: string[] = [];

	for (let y = height - 1; y >= 0; y--) {
		const threshold = min + (range * (y + 1)) / height;
		lines.push(buildChartLine(sampledData, threshold, width));
	}

	return lines;
}

/**
 * Calculate min, max, and range for data normalization
 */
function calculateDataRange(data: number[]): { max: number; min: number; range: number } {
	const max = Math.max(...data, 1);
	const min = Math.min(...data, 0);
	const range = max - min || 1;
	return { max, min, range };
}

/**
 * Build a single chart line
 */
function buildChartLine(data: number[], threshold: number, width: number): string {
	let line = '';

	for (let x = 0; x < width; x++) {
		const value = data[x];
		line += value === undefined ? ' ' : value >= threshold ? '▄' : ' ';
	}

	return line;
}

/**
 * Resource usage gauge
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- React component must be PascalCase
export const ResourceGauge: React.FC<{
	label: string;
	max: number;
	unit: string;
	value: number;
	width?: number;
}> = ({ label, max, unit, value, width = 20 }) => {
	const percentage = Math.min((value / max) * 100, 100);
	const filled = Math.floor((percentage / 100) * width);
	const empty = width - filled;

	const color = percentage > 90 ? 'red' : percentage > 70 ? 'yellow' : 'green';

	return (
		<Box>
			<Text dimColor>{label}: </Text>
			<Text color={color}>{'█'.repeat(filled)}</Text>
			<Text dimColor>{'░'.repeat(empty)}</Text>
			<Text>
				{' '}
				{value.toFixed(1)}
				{unit} / {max}
				{unit}
			</Text>
		</Box>
	);
};

/**
 * Container metrics panel
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- React component must be PascalCase
export const ContainerMetricsPanel: React.FC<{
	history?: MetricsHistory[];
	stats: ContainerStats;
}> = ({ history = [], stats }) => {
	const cpuHistory = history.map((h) => h.cpu);
	const memoryHistory = history.map((h) => h.memory);

	return (
		<Box borderColor="cyan" borderStyle="round" flexDirection="column" padding={1}>
			<Text bold color="cyan">
				Container {stats.container_id.substring(0, 12)}
			</Text>
			<Text dimColor>Worktree {stats.worktree_index}</Text>

			<Box marginTop={1}>
				<ResourceGauge label="CPU" max={100} unit="%" value={stats.cpu_usage_percent} width={25} />
			</Box>

			<Box>
				<ResourceGauge label="Memory" max={stats.memory_limit_mb} unit="MB" value={stats.memory_usage_mb} width={25} />
			</Box>

			<Box marginTop={1}>
				<Text dimColor>Status: </Text>
				<Text color={stats.status === 'running' ? 'green' : stats.status === 'exited' ? 'yellow' : 'red'}>
					{stats.status}
				</Text>
				<Text dimColor> | Uptime: {formatDuration(stats.uptime_seconds * 1000)}</Text>
			</Box>

			{history.length > 0 && (
				<Box flexDirection="column" marginTop={1}>
					<Text dimColor>CPU History:</Text>
					<Sparkline color="cyan" data={cpuHistory} height={4} width={40} />

					<Box marginTop={1}>
						<Text dimColor>Memory History:</Text>
					</Box>
					<Sparkline color="magenta" data={memoryHistory} height={4} width={40} />
				</Box>
			)}

			{stats.exit_code !== undefined && (
				<Box marginTop={1}>
					<Text color="red">Exit code: {stats.exit_code}</Text>
				</Box>
			)}
		</Box>
	);
};

/**
 * Exploration summary statistics
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- React component must be PascalCase
export const ExplorationStats: React.FC<{
	decisionsCount: number;
	duration?: number;
	insightsCount: number;
	worktrees: WorktreeExploration[];
}> = ({ decisionsCount, duration, insightsCount, worktrees }) => {
	const completed = worktrees.filter((wt) => wt.status === 'completed').length;
	const running = worktrees.filter((wt) => wt.status === 'running').length;
	const failed = worktrees.filter((wt) => wt.status === 'failed').length;
	const pending = worktrees.filter((wt) => wt.status === 'pending').length;

	const totalErrors = worktrees.reduce((sum, wt) => sum + wt.progress.errors.length, 0);
	const totalInsightsPublished = worktrees.reduce((sum, wt) => sum + wt.progress.insights_published, 0);

	const avgProgress = worktrees.reduce((sum, wt) => sum + wt.progress.percentage, 0) / worktrees.length || 0;

	return (
		<Box borderColor="green" borderStyle="round" flexDirection="column" padding={1}>
			<Text bold color="green">
				📈 Statistics
			</Text>

			<Box flexDirection="column" marginTop={1}>
				<Box>
					<Text dimColor>Worktrees: </Text>
					<Text color="green">✓ {completed}</Text>
					<Text dimColor> | </Text>
					<Text color="cyan">▶ {running}</Text>
					<Text dimColor> | </Text>
					<Text color="red">✗ {failed}</Text>
					<Text dimColor> | </Text>
					<Text color="yellow">○ {pending}</Text>
				</Box>

				<Box>
					<Text dimColor>Average Progress: </Text>
					<Text>{avgProgress.toFixed(1)}%</Text>
				</Box>

				<Box>
					<Text dimColor>Insights Published: </Text>
					<Text>{totalInsightsPublished}</Text>
					<Text dimColor> | Total Collected: </Text>
					<Text>{insightsCount}</Text>
				</Box>

				<Box>
					<Text dimColor>Decisions Made: </Text>
					<Text>{decisionsCount}</Text>
				</Box>

				<Box>
					<Text dimColor>Total Errors: </Text>
					<Text color={totalErrors > 0 ? 'red' : 'green'}>{totalErrors}</Text>
				</Box>

				{duration !== undefined && (
					<Box>
						<Text dimColor>Duration: </Text>
						<Text>{formatDuration(duration)}</Text>
					</Box>
				)}
			</Box>
		</Box>
	);
};

/**
 * Timeline component showing stage progression
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- React component must be PascalCase
export const StageTimeline: React.FC<{
	worktree: WorktreeExploration;
}> = ({ worktree }) => {
	const allStages = ['Initialization', 'Planning', 'Implementation', 'Testing', 'Validation', 'Completion'];

	const currentStageIndex = allStages.findIndex(
		(stage) => stage.toLowerCase() === worktree.progress.current_stage.toLowerCase()
	);

	return (
		<Box flexDirection="column">
			<Text bold>Stage Timeline:</Text>
			<Box marginTop={1}>
				{allStages.map((stage, index) => {
					const isCompleted = worktree.progress.stages_completed.some((s) => s.toLowerCase() === stage.toLowerCase());
					const isCurrent = index === currentStageIndex;

					const icon = isCompleted ? '✓' : isCurrent ? '▶' : '○';
					const color = isCompleted ? 'green' : isCurrent ? 'cyan' : 'gray';

					return (
						<Text color={color} key={stage}>
							{icon} {stage}{' '}
						</Text>
					);
				})}
			</Box>
		</Box>
	);
};

/**
 * Comparison table for multiple worktrees
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- React component must be PascalCase
export const WorktreeComparisonTable: React.FC<{
	containerStats: Map<number, ContainerStats>;
	worktrees: WorktreeExploration[];
}> = ({ containerStats, worktrees }) => {
	return (
		<Box borderColor="yellow" borderStyle="round" flexDirection="column" padding={1}>
			<Text bold color="yellow">
				📊 Worktree Comparison
			</Text>

			<Box flexDirection="column" marginTop={1}>
				{/* Header */}
				<Box>
					<Text bold dimColor>
						{'Index'.padEnd(8)}
						{'Strategy'.padEnd(15)}
						{'Status'.padEnd(12)}
						{'Progress'.padEnd(12)}
						{'CPU%'.padEnd(8)}
						{'Memory'.padEnd(12)}
					</Text>
				</Box>

				{/* Rows */}
				{worktrees.map((wt) => {
					const stats = containerStats.get(wt.index);
					const statusColor =
						wt.status === 'completed'
							? 'green'
							: wt.status === 'running'
								? 'cyan'
								: wt.status === 'failed'
									? 'red'
									: 'yellow';

					return (
						<Box key={wt.index}>
							<Text>{String(wt.index).padEnd(8)}</Text>
							<Text>{(wt.strategy ?? 'default').padEnd(15)}</Text>
							<Text color={statusColor}>{wt.status.padEnd(12)}</Text>
							<Text>{`${wt.progress.percentage}%`.padEnd(12)}</Text>
							<Text>{stats ? `${stats.cpu_usage_percent.toFixed(1)}%`.padEnd(8) : 'N/A'.padEnd(8)}</Text>
							<Text>{stats ? `${stats.memory_usage_mb.toFixed(0)}MB`.padEnd(12) : 'N/A'.padEnd(12)}</Text>
						</Box>
					);
				})}
			</Box>
		</Box>
	);
};
