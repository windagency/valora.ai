/**
 * Dashboard TUI - Real-time dashboard for monitoring sessions and system health
 * Built with Ink (modern React-based TUI framework)
 */

import type { Exploration } from 'types/exploration.types';
import type { Session, SessionSummary, WorktreeUsageStats } from 'types/session.types';

import { ExplorationStateManager } from 'exploration/exploration-state';
import { WorktreeManager } from 'exploration/worktree-manager';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SessionStore } from 'session/store';
import { formatNumber } from 'utils/number-format';

import { getTUIAdapter } from './tui-adapter.interface';

const tui = getTUIAdapter();
// eslint-disable-next-line @typescript-eslint/naming-convention -- Box and Text are React components which require PascalCase
const { Box, Text } = tui;

/**
 * Format duration with hours, minutes, seconds, milliseconds when applicable
 */
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
	recentCommands: RecentCommand[];
	systemHealth: SystemHealth;
	worktrees: WorktreeDiagramEntry[];
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

function formatDurationMs(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	const parts: string[] = [];

	if (hours > 0) {
		parts.push(`${hours}h`);
	}
	if (minutes > 0 || hours > 0) {
		parts.push(`${minutes}m`);
	}
	parts.push(`${seconds}s`);

	return parts.join(' ');
}

/**
 * Format age (relative time)
 */
function formatAge(timestamp: string): string {
	const diff = Date.now() - new Date(timestamp).getTime();
	const seconds = Math.floor(diff / 1000);

	if (seconds < 60) return 'just now';
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
	if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
	return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * Header Component
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
function Header(): React.JSX.Element {
	return (
		<Box borderColor="blue" borderStyle="round" paddingX={1}>
			<Text bold color="cyan">
				VALORA - Real-Time Dashboard
			</Text>
		</Box>
	);
}

/**
 * Get context usage color based on percentage
 */
function getContextColor(percent: number): 'green' | 'red' | 'yellow' {
	if (percent > 80) return 'red';
	if (percent > 50) return 'yellow';
	return 'green';
}

/**
 * Get status color for session status
 */
function getStatusColor(status: string): 'gray' | 'green' | 'red' | 'yellow' {
	switch (status) {
		case 'active':
			return 'green';
		case 'failed':
			return 'red';
		case 'paused':
			return 'yellow';
		default:
			return 'gray';
	}
}

/**
 * Session Row component
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
function SessionRow({ isSelected, session }: { isSelected: boolean; session: SessionSummary }): React.JSX.Element {
	const age = formatAge(session.last_active);
	const tokens = session.total_tokens_used ?? 0;
	const sessionId = session.session_id.substring(0, 16).padEnd(16);
	const ctxUsage = session.context_window;
	const ctxPercent = ctxUsage?.utilization_percent ?? 0;
	const ctxColor = getContextColor(ctxPercent);

	return (
		<Box key={`session-${session.session_id}`}>
			<Text backgroundColor={isSelected ? 'blue' : undefined} bold={isSelected} color={isSelected ? 'blue' : 'white'}>
				{isSelected ? '▶' : ' '}
			</Text>
			<Text> </Text>
			<Text color={session.status === 'active' ? 'green' : 'yellow'}>●</Text>
			<Text> </Text>
			<Text color="cyan">{sessionId}</Text>
			<Text dimColor> {age.padEnd(10)}</Text>
			<Text color="yellow"> {String(session.command_count).padStart(2)} cmd</Text>
			{tokens > 0 && <Text color="cyan"> {formatNumber(tokens)} tokens</Text>}
			{ctxUsage && <Text color={ctxColor}> ctx:{ctxPercent.toFixed(0)}%</Text>}
		</Box>
	);
}

/**
 * Active Sessions Panel
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
function ActiveSessionsPanel({
	selectedIndex,
	sessions
}: {
	selectedIndex: number;
	sessions: SessionSummary[];
}): React.JSX.Element {
	return (
		<Box borderColor="green" borderStyle="round" flexDirection="column" height={15} paddingX={1}>
			<Text bold color="green">
				Recent Sessions ({sessions.length})
			</Text>
			<Box flexDirection="column" marginTop={1}>
				{sessions.length === 0 ? (
					<>
						<Text dimColor>No sessions yet</Text>
						<Text dimColor>Run commands to create sessions</Text>
					</>
				) : (
					sessions
						.slice(0, 10)
						.map((session, index) => (
							<SessionRow isSelected={index === selectedIndex} key={session.session_id} session={session} />
						))
				)}
			</Box>
		</Box>
	);
}

/**
 * System Health Panel
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
function SystemHealthPanel({ health }: { health: SystemHealth }): React.JSX.Element {
	const statusColor = health.apiStatus === 'healthy' ? 'green' : 'red';
	const statusIcon = health.apiStatus === 'healthy' ? '✓' : '✗';

	return (
		<Box borderColor="cyan" borderStyle="round" flexDirection="column" height={9} paddingX={1}>
			<Text bold color="cyan">
				System Health
			</Text>
			<Box flexDirection="column" marginTop={1}>
				<Box>
					<Text dimColor>API Status:</Text>
					<Text> </Text>
					<Text bold color={statusColor}>
						{statusIcon} {health.apiStatus.toUpperCase()}
					</Text>
				</Box>
				<Box marginTop={1}>
					<Text dimColor>Total Sessions:</Text>
					<Text> </Text>
					<Text bold color="cyan">
						{health.sessionsCount}
					</Text>
				</Box>
				<Box marginTop={1}>
					<Text dimColor>Disk Usage:</Text>
					<Text> </Text>
					<Text bold color="yellow">
						{health.diskUsage}
					</Text>
				</Box>
				<Box marginTop={1}>
					<Text dimColor>Uptime: {formatDurationMs(health.uptime)}</Text>
				</Box>
			</Box>
		</Box>
	);
}

/**
 * Recent Commands Panel
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
function RecentCommandsPanel({ commands }: { commands: RecentCommand[] }): React.JSX.Element {
	return (
		<Box borderColor="yellow" borderStyle="round" flexDirection="column" height={8} paddingX={1}>
			<Text bold color="yellow">
				Recent Commands
			</Text>
			<Box flexDirection="column" marginTop={1}>
				{commands.length === 0 ? (
					<Text dimColor>No recent commands</Text>
				) : (
					commands.map((cmd, index) => {
						// Truncate command if too long (max 20 chars)
						const truncatedCmd = cmd.command.length > 20 ? cmd.command.substring(0, 17) + '...' : cmd.command;
						const age = formatAge(cmd.timestamp);

						return (
							<Box key={index}>
								<Text bold color={cmd.status === 'success' ? 'green' : 'red'}>
									{cmd.status === 'success' ? '✓' : '✗'}
								</Text>
								<Text> </Text>
								<Text bold>{truncatedCmd.padEnd(20)}</Text>
								<Text dimColor> {age}</Text>
							</Box>
						);
					})
				)}
			</Box>
		</Box>
	);
}

/**
 * Get worktree status icon
 */
function getWorktreeStatusIcon(status?: string): string {
	switch (status) {
		case 'completed':
			return '\u2713';
		case 'failed':
			return '\u2717';
		case 'running':
			return '\u25b6';
		default:
			return '\u25cb';
	}
}

/**
 * Get exploration status color
 */
function getExplorationStatusColor(status: string): 'green' | 'red' | 'yellow' {
	if (status === 'running') return 'yellow';
	if (status === 'completed') return 'green';
	return 'red';
}

/**
 * Worktree child row in the diagram tree
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
function WorktreeChildRow({
	isLast,
	worktree
}: {
	isLast: boolean;
	worktree: WorktreeDiagramEntry;
}): React.JSX.Element {
	const connector = isLast ? '\u2514\u2500\u2500' : '\u251c\u2500\u2500';
	const branchColor = worktree.prunable ? 'red' : worktree.isExploration ? 'yellow' : 'white';
	const truncatedTask =
		worktree.explorationTask && worktree.explorationTask.length > 20
			? worktree.explorationTask.substring(0, 17) + '...'
			: worktree.explorationTask;

	return (
		<Box flexDirection="column">
			<Box>
				<Text dimColor>{connector} </Text>
				<Text color={branchColor}>{worktree.branch}</Text>
			</Box>
			<Box>
				<Text dimColor>{isLast ? '    ' : '\u2502   '}</Text>
				<Text dimColor>{worktree.commit}</Text>
				{worktree.explorationStatus && (
					<Text color={getExplorationStatusColor(worktree.explorationStatus)}>
						{' '}
						{getWorktreeStatusIcon(worktree.explorationStatus)} {worktree.explorationStatus.toUpperCase()}
					</Text>
				)}
				{truncatedTask && <Text dimColor> {truncatedTask}</Text>}
			</Box>
		</Box>
	);
}

/**
 * Worktree Diagram Panel - Shows git worktree tree structure
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
function WorktreeDiagramPanel({ worktrees }: { worktrees: WorktreeDiagramEntry[] }): React.JSX.Element {
	const mainWorktree = worktrees.find((wt) => wt.isMainWorktree);
	const childWorktrees = worktrees.filter((wt) => !wt.isMainWorktree);
	const maxDisplay = 4;
	const displayChildren = childWorktrees.slice(0, maxDisplay);
	const overflowCount = childWorktrees.length - maxDisplay;

	return (
		<Box borderColor="green" borderStyle="round" flexDirection="column" paddingX={1}>
			<Text bold color="green">
				Git Worktrees ({worktrees.length})
			</Text>
			<Box flexDirection="column" marginTop={1}>
				{mainWorktree ? (
					<>
						<Box>
							<Text color="cyan">
								{'\u25cf'} {mainWorktree.branch || 'main'}
							</Text>
							<Text dimColor> {mainWorktree.commit}</Text>
						</Box>
						{displayChildren.length === 0 ? (
							<Text dimColor>No additional worktrees</Text>
						) : (
							displayChildren.map((wt, index) => (
								<WorktreeChildRow
									isLast={index === displayChildren.length - 1 && overflowCount <= 0}
									key={wt.path}
									worktree={wt}
								/>
							))
						)}
						{overflowCount > 0 && <Text dimColor>...and {overflowCount} more</Text>}
					</>
				) : (
					<Text dimColor>No git repository detected</Text>
				)}
			</Box>
		</Box>
	);
}

/**
 * Background Tasks Panel
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
function BackgroundTasksPanel({ tasks }: { tasks: BackgroundTask[] }): React.JSX.Element {
	return (
		<Box borderColor="magenta" borderStyle="round" flexDirection="column" height={6} paddingX={1}>
			<Text bold color="magenta">
				Background Tasks
			</Text>
			<Box flexDirection="column" marginTop={1}>
				{tasks.length === 0 ? (
					<Text dimColor>No background tasks running</Text>
				) : (
					tasks.map((task) => {
						const statusColor = task.status === 'completed' ? 'green' : task.status === 'failed' ? 'red' : 'yellow';
						const isIndeterminate = task.progress < 0;
						const elapsedMs = task.startedAt ? Date.now() - new Date(task.startedAt).getTime() : 0;
						const elapsedStr = elapsedMs > 0 ? formatDurationMs(elapsedMs) : '';
						return (
							<Box flexDirection="column" key={task.id}>
								<Box>
									<Text color={statusColor}>
										{task.status === 'completed' ? '✓' : task.status === 'failed' ? '✗' : '⟳'}
									</Text>
									<Text> {task.name}</Text>
									{elapsedStr && <Text dimColor> ({elapsedStr})</Text>}
								</Box>
								<Text dimColor>
									{isIndeterminate
										? '▓▒░░░░░░░░░░░░░░░░░░ running...'
										: `${'█'.repeat(Math.floor((task.progress / 100) * 20))}${'░'.repeat(20 - Math.floor((task.progress / 100) * 20))} ${task.progress}%`}
								</Text>
							</Box>
						);
					})
				)}
			</Box>
		</Box>
	);
}

/**
 * Session Information Panel
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
function SessionInfoPanel({ session }: { session: Session }): React.JSX.Element {
	return (
		<Box borderColor="white" borderStyle="round" flexDirection="column" marginBottom={1} paddingX={1}>
			<Text bold color="cyan">
				Session Information
			</Text>
			<Text>
				Session ID: <Text color="cyan">{session.session_id}</Text>
			</Text>
			<Text>
				Status: <Text color={getStatusColor(session.status)}>{session.status.toUpperCase()}</Text>
			</Text>
			<Text>
				Created: <Text color="yellow">{new Date(session.created_at).toLocaleString()}</Text>
			</Text>
			<Text>
				Last Updated: <Text color="yellow">{new Date(session.updated_at).toLocaleString()}</Text>
			</Text>
			{session.total_tokens_used != null && session.total_tokens_used > 0 && (
				<Text>
					Total Tokens: <Text color="cyan">{formatNumber(session.total_tokens_used)}</Text>
				</Text>
			)}
			{session.context_window && (
				<>
					<Text>
						Context Window:{' '}
						<Text color={getContextColor(session.context_window.utilization_percent)}>
							{session.context_window.utilization_percent.toFixed(1)}%
						</Text>
						<Text dimColor>
							{' '}
							({formatNumber(session.context_window.tokens_used)} /{' '}
							{formatNumber(session.context_window.context_window_size)})
						</Text>
					</Text>
					<Text>
						Model: <Text color="cyan">{session.context_window.model}</Text>
					</Text>
				</>
			)}
		</Box>
	);
}

/**
 * Running Task Panel
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
function RunningTaskPanel({ command, elapsedMs }: { command: string; elapsedMs: number }): React.JSX.Element {
	return (
		<Box borderColor="yellow" borderStyle="round" flexDirection="column" marginBottom={1} paddingX={1}>
			<Text bold color="yellow">
				⟳ Running Task
			</Text>
			<Box marginTop={1}>
				<Text>
					Command: <Text color="cyan">{command}</Text>
				</Text>
			</Box>
			<Text>
				Elapsed: <Text color="yellow">{formatDurationMs(elapsedMs)}</Text>
			</Text>
			<Text dimColor>▓▒░░░░░░░░░░░░░░░░░░ running...</Text>
		</Box>
	);
}

/**
 * Command History Panel
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
function CommandHistoryPanel({ session }: { session: Session }): React.JSX.Element {
	const commands = session.commands.slice(-10).reverse();

	return (
		<Box borderColor="white" borderStyle="round" flexDirection="column" marginBottom={1} paddingX={1}>
			<Text bold color="cyan">
				Commands Executed ({session.commands.length})
			</Text>
			{commands.length === 0 ? (
				<Text dimColor>No commands executed yet</Text>
			) : (
				commands.map((cmd, index) => (
					<Box flexDirection="column" key={index} marginTop={index > 0 ? 1 : 0}>
						<Box>
							<Text color={cmd.success ? 'green' : 'red'}>{cmd.success ? '✓' : '✗'}</Text>
							<Text> {cmd.command}</Text>
							{cmd.duration_ms != null && cmd.duration_ms > 0 && (
								<Text dimColor> ({formatDurationMs(cmd.duration_ms)})</Text>
							)}
							{cmd.tokens_used != null && cmd.tokens_used > 0 && (
								<Text color="cyan"> {formatNumber(cmd.tokens_used)} tokens</Text>
							)}
						</Box>
						<Text dimColor> {new Date(cmd.timestamp).toLocaleString()}</Text>
						{cmd.error && <Text color="red"> Error: {cmd.error}</Text>}
					</Box>
				))
			)}
			{session.commands.length > 10 && (
				<Box marginTop={1}>
					<Text dimColor>... and {session.commands.length - 10} more commands</Text>
				</Box>
			)}
		</Box>
	);
}

/**
 * Worktree Stats Panel - Shows worktree usage statistics for a session
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
function WorktreeStatsPanel({ stats }: { stats: WorktreeUsageStats }): React.JSX.Element {
	return (
		<Box borderColor="yellow" borderStyle="round" flexDirection="column" marginBottom={1} paddingX={1}>
			<Text bold color="yellow">
				Worktree Usage
			</Text>
			<Box flexDirection="column" marginTop={1}>
				<Box>
					<Text dimColor>Created: </Text>
					<Text bold>{stats.total_created}</Text>
					<Text> </Text>
					<Text dimColor>Max Concurrent: </Text>
					<Text bold>{stats.max_concurrent}</Text>
				</Box>
				<Box>
					<Text dimColor>Total Duration: </Text>
					<Text bold color="cyan">
						{formatDurationMs(stats.total_duration_ms)}
					</Text>
				</Box>
				{stats.exploration_ids.length > 0 && (
					<Box>
						<Text dimColor>Explorations: </Text>
						<Text color="cyan">{stats.exploration_ids.join(', ')}</Text>
					</Box>
				)}
			</Box>
			{stats.worktree_summaries.length > 0 && (
				<Box flexDirection="column" marginTop={1}>
					{stats.worktree_summaries.map((summary, index) => {
						const statusIcon =
							summary.status === 'completed' ? '\u2713' : summary.status === 'failed' ? '\u2717' : '\u25cb';
						const statusColor =
							summary.status === 'completed' ? 'green' : summary.status === 'failed' ? 'red' : 'yellow';
						const duration =
							summary.duration_ms != null
								? formatDurationMs(summary.duration_ms)
								: summary.status === 'failed'
									? 'fail'
									: '';

						return (
							<Box key={index}>
								<Text color={statusColor}>{statusIcon}</Text>
								<Text> </Text>
								<Text>{summary.branch_name}</Text>
								{duration && <Text dimColor> {duration}</Text>}
							</Box>
						);
					})}
				</Box>
			)}
		</Box>
	);
}

/**
 * Exploration Worktree Row
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
function ExplorationWorktreeRow({ worktree }: { worktree: Exploration['worktrees'][number] }): React.JSX.Element {
	return (
		<Box key={worktree.index}>
			<Text dimColor> {worktree.index}. </Text>
			<Text color={getExplorationStatusColor(worktree.status)}>[{worktree.status}]</Text>
			<Text> {worktree.strategy ?? `branch-${worktree.index}`}</Text>
			<Text dimColor> ({worktree.branch_name.replace(/^refs\/heads\//, '')})</Text>
		</Box>
	);
}

/**
 * Exploration Info Panel - Shows linked exploration details in session view.
 * Looks up the exploration by explorationId (from session context) or by sessionId match.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
function ExplorationInfoPanel({
	explorationId,
	sessionId
}: {
	explorationId?: string;
	sessionId: string;
}): React.JSX.Element {
	const [exploration, setExploration] = useState<Exploration | null>(null);
	const [stateManager] = useState(() => new ExplorationStateManager());

	useEffect(() => {
		if (explorationId) {
			stateManager
				.loadExploration(explorationId)
				.then(setExploration)
				.catch(() => setExploration(null));
		} else {
			stateManager
				.findBySessionId(sessionId)
				.then(setExploration)
				.catch(() => setExploration(null));
		}
	}, [explorationId, sessionId, stateManager]);

	// Don't render if no exploration found and no explicit ID
	if (!exploration && !explorationId) {
		return <></>;
	}

	return (
		<Box borderColor="magenta" borderStyle="round" flexDirection="column" marginBottom={1} paddingX={1}>
			<Text bold color="magenta">
				Exploration
			</Text>
			<Box flexDirection="column" marginTop={1}>
				<Box>
					<Text dimColor>Exploration ID: </Text>
					<Text bold color="cyan">
						{exploration?.id ?? explorationId}
					</Text>
				</Box>
				{exploration && (
					<>
						<Box>
							<Text dimColor>Task: </Text>
							<Text>{exploration.task}</Text>
						</Box>
						<Box>
							<Text dimColor>Status: </Text>
							<Text bold color={getExplorationStatusColor(exploration.status)}>
								{exploration.status.toUpperCase()}
							</Text>
						</Box>
						<Box>
							<Text dimColor>Branches: </Text>
							<Text>
								{exploration.completed_branches}/{exploration.branches}
							</Text>
						</Box>
						{exploration.duration_ms != null && (
							<Box>
								<Text dimColor>Duration: </Text>
								<Text>{formatDurationMs(exploration.duration_ms)}</Text>
							</Box>
						)}
						{exploration.worktrees.length > 0 && (
							<Box flexDirection="column" marginTop={1}>
								<Text dimColor>Worktrees:</Text>
								{exploration.worktrees.map((wt) => (
									<ExplorationWorktreeRow key={wt.index} worktree={wt} />
								))}
							</Box>
						)}
					</>
				)}
			</Box>
		</Box>
	);
}

/**
 * Session Details View
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
function SessionDetailsView({
	onBack,
	onExit,
	session
}: {
	onBack: () => void;
	onExit: () => void;
	session: Session;
}): React.JSX.Element {
	const [, setTick] = useState(0);

	// Update every second for live elapsed time
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

	const isRunning = session.status === 'active';
	const elapsedMs = isRunning ? Date.now() - new Date(session.updated_at).getTime() : 0;
	const worktreeStats = session.context?.['worktree_stats'] as undefined | WorktreeUsageStats;
	const explorationId = session.context?.['exploration_id'] as string | undefined;

	return (
		<Box flexDirection="column" paddingX={1}>
			<Box borderColor="cyan" borderStyle="round" marginBottom={1} paddingX={1}>
				<Text bold color="cyan">
					Session Details: {session.session_id}
				</Text>
			</Box>

			<SessionInfoPanel session={session} />

			{isRunning && session.current_command && (
				<RunningTaskPanel command={session.current_command} elapsedMs={elapsedMs} />
			)}

			<ExplorationInfoPanel explorationId={explorationId} sessionId={session.session_id} />

			<CommandHistoryPanel session={session} />

			{worktreeStats && worktreeStats.total_created > 0 && <WorktreeStatsPanel stats={worktreeStats} />}

			<Box borderColor="white" borderStyle="round" paddingX={1}>
				<Text dimColor>Press q or Esc to go back</Text>
			</Box>
		</Box>
	);
}

/**
 * Help Bar
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
function HelpBar({ mode }: { mode: 'dashboard' | 'details' }): React.JSX.Element {
	return (
		<Box borderColor="white" borderStyle="round" paddingX={1}>
			{mode === 'dashboard' ? (
				<Text>
					<Text color="cyan">j/k</Text>: Navigate <Text color="cyan">Enter</Text>: View Details{' '}
					<Text color="cyan">r</Text>: Refresh <Text color="cyan">q</Text>: Quit
				</Text>
			) : (
				<Text>
					<Text color="cyan">j/k/↑/↓</Text>: Scroll <Text color="cyan">Esc/q</Text>: Back{' '}
					<Text color="cyan">Ctrl+C</Text>: Quit
				</Text>
			)}
		</Box>
	);
}

/**
 * Main Dashboard Component
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
function Dashboard(): React.JSX.Element {
	const { exit } = tui.useApp();
	const [startTime] = useState(() => Date.now());
	const [data, setData] = useState<DashboardData>({
		activeSessions: [],
		backgroundTasks: [],
		recentCommands: [],
		systemHealth: {
			apiStatus: 'healthy',
			diskUsage: '0 MB',
			sessionsCount: 0,
			uptime: 0
		},
		worktrees: []
	});
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [viewMode, setViewMode] = useState<'dashboard' | 'details'>('dashboard');
	const [selectedSession, setSelectedSession] = useState<null | Session>(null);
	const [sessionStore] = useState(() => new SessionStore());
	const [worktreeManager] = useState(() => new WorktreeManager());
	const [explorationStateManager] = useState(() => new ExplorationStateManager());

	// Refs to track timers for cleanup (prevents memory leaks)
	const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
	const exitTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const selectedSessionRef = useRef<null | Session>(null);

	// Keep ref in sync with state for use in interval callbacks
	selectedSessionRef.current = selectedSession;

	// Fetch dashboard data (memoised to avoid stale closures)
	const fetchData = useCallback(async (): Promise<void> => {
		try {
			const [sessions, rawWorktrees, activeExplorations] = await Promise.all([
				sessionStore.listSessions(),
				worktreeManager.listWorktrees().catch(() => []),
				explorationStateManager.getActiveExplorations().catch(() => [])
			]);

			// Transform worktrees into diagram entries
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

			// Show recent sessions (top 10 most recent, regardless of status)
			const activeSessions = sessions.slice(0, 10);

			// Use session summaries for recent commands instead of loading full sessions
			// This prevents massive memory usage from loading 10 full sessions every second
			const recentCommands: RecentCommand[] = sessions
				.slice(0, 10)
				.filter((s) => s.last_command)
				.map(
					(s): RecentCommand => ({
						agent: 'default',
						command: s.last_command!,
						// Session summaries don't have per-command success status, use session status as proxy
						status: s.status === 'failed' ? 'failed' : s.status === 'active' ? 'running' : 'success',
						timestamp: s.updated_at
					})
				)
				.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
				.slice(0, 5);

			// Calculate disk usage
			const totalBytes = sessions.reduce((sum, s) => sum + (s.size_bytes || 0), 0);
			const mb = (totalBytes / 1024 / 1024).toFixed(2);

			// Find running sessions and convert to background tasks (deduplicated)
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
					progress: -1, // Indeterminate progress (running)
					startedAt: s.updated_at,
					status: 'running' as const
				}));

			setData({
				activeSessions,
				backgroundTasks,
				recentCommands,
				systemHealth: {
					apiStatus: 'healthy',
					diskUsage: `${mb} MB`,
					sessionsCount: sessions.length,
					uptime: Date.now() - startTime
				},
				worktrees: worktreeEntries
			});

			// Reset selection if out of bounds
			if (selectedIndex >= activeSessions.length && activeSessions.length > 0) {
				setSelectedIndex(activeSessions.length - 1);
			}
		} catch {
			// Silent fail for refresh errors
		}
	}, [sessionStore, worktreeManager, explorationStateManager, startTime, selectedIndex]);

	// Auto-refresh every second
	useEffect(() => {
		void fetchData();

		// Clear any existing interval before creating a new one
		if (refreshIntervalRef.current) {
			clearInterval(refreshIntervalRef.current);
		}

		refreshIntervalRef.current = setInterval(() => {
			if (viewMode === 'dashboard') {
				void fetchData();
			} else if (viewMode === 'details' && selectedSessionRef.current) {
				// Use ref to avoid stale closure on selectedSession
				const currentSession = selectedSessionRef.current;
				// Refresh session details for live updates
				sessionStore
					.loadSession(currentSession.session_id)
					.then((refreshedSession) => {
						setSelectedSession(refreshedSession);
					})
					.catch(() => {
						// Ignore errors during refresh
					});
			}
		}, 1000);

		return () => {
			if (refreshIntervalRef.current) {
				clearInterval(refreshIntervalRef.current);
				refreshIntervalRef.current = null;
			}
		};
	}, [viewMode, fetchData, sessionStore]);

	// Cleanup all timers on unmount to prevent memory leaks
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

	// Handle exit - tracks timeout to prevent accumulation on multiple calls
	const handleExit = useCallback((): void => {
		// Clear refresh interval immediately
		if (refreshIntervalRef.current) {
			clearInterval(refreshIntervalRef.current);
			refreshIntervalRef.current = null;
		}

		// Prevent multiple exit timeouts from accumulating
		if (exitTimeoutRef.current) {
			return; // Already exiting
		}

		exit();
		// Force exit after short delay to ensure cleanup
		exitTimeoutRef.current = setTimeout(() => {
			process.exit(0);
		}, 100);
	}, [exit]);

	// Handle navigation down
	const handleNavigateDown = (): void => {
		if (data.activeSessions.length > 0) {
			setSelectedIndex((prev) => Math.min(prev + 1, data.activeSessions.length - 1));
		}
	};

	// Handle navigation up
	const handleNavigateUp = (): void => {
		if (data.activeSessions.length > 0) {
			setSelectedIndex((prev) => Math.max(prev - 1, 0));
		}
	};

	// Handle viewing session details
	const handleViewSessionDetails = (): void => {
		if (data.activeSessions.length === 0) {
			return;
		}

		const session = data.activeSessions[selectedIndex];
		if (!session) {
			return;
		}

		sessionStore
			.loadSession(session.session_id)
			.then((fullSession) => {
				setSelectedSession(fullSession);
				setViewMode('details');
			})
			.catch((error) => {
				// Log error but don't crash - stay on dashboard view
				console.error(`Failed to load session ${session.session_id}:`, error);
			});
	};

	// Check if should exit
	const shouldExit = (input: string, key: { ctrl?: boolean; escape?: boolean }): boolean => {
		// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- Using OR for multiple boolean conditions
		return (key.ctrl && input === 'c') || input === 'q' || Boolean(key.escape);
	};

	// Handle keyboard input
	const handleKeyboardInput = (
		input: string,
		key: { ctrl?: boolean; downArrow?: boolean; escape?: boolean; return?: boolean; upArrow?: boolean }
	): void => {
		if (shouldExit(input, key)) {
			handleExit();
			return;
		}

		if (input === 'r') {
			void fetchData();
		} else if (input === 'j' || key.downArrow) {
			handleNavigateDown();
		} else if (input === 'k' || key.upArrow) {
			handleNavigateUp();
		} else if (key.return) {
			handleViewSessionDetails();
		}
	};

	// Keyboard input handling
	tui.useInput((input, key) => {
		// Details view handled by SessionDetailsView
		if (viewMode === 'details') {
			return;
		}

		handleKeyboardInput(input, key);
	});

	if (viewMode === 'details' && selectedSession) {
		return (
			<Box flexDirection="column">
				<Header />
				<SessionDetailsView
					onBack={() => {
						setViewMode('dashboard');
						setSelectedSession(null);
					}}
					onExit={handleExit}
					session={selectedSession}
				/>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" paddingX={1}>
			<Header />
			<Box flexGrow={1} marginTop={1}>
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
					<Box marginTop={1}>
						<RecentCommandsPanel commands={data.recentCommands} />
					</Box>
				</Box>
			</Box>
			<Box marginTop={1}>
				<HelpBar mode={viewMode} />
			</Box>
		</Box>
	);
}

/**
 * Start the dashboard
 */
export function startDashboard(): void {
	const { clear, unmount, waitUntilExit } = tui.render(<Dashboard />);

	// Handle process signals for clean exit
	const handleSignal = (): void => {
		clear();
		unmount();
		process.exit(0);
	};

	process.on('SIGINT', handleSignal);
	process.on('SIGTERM', handleSignal);

	// Wait for exit and cleanup
	void waitUntilExit().then(() => {
		process.removeListener('SIGINT', handleSignal);
		process.removeListener('SIGTERM', handleSignal);
	});
}
