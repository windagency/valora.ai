/**
 * Dashboard formatting utilities
 */

/**
 * Format duration with hours, minutes, seconds
 */
export function formatDurationMs(ms: number): string {
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
export function formatAge(timestamp: string): string {
	const diff = Date.now() - new Date(timestamp).getTime();
	const seconds = Math.floor(diff / 1000);

	if (seconds < 60) return 'just now';
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
	if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
	return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * Get context usage color based on percentage
 */
export function getContextColor(percent: number): 'green' | 'red' | 'yellow' {
	if (percent > 80) return 'red';
	if (percent > 50) return 'yellow';
	return 'green';
}

/**
 * Get status color for session status
 */
export function getStatusColor(status: string): 'gray' | 'green' | 'red' | 'yellow' {
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
 * Get worktree status icon
 */
export function getWorktreeStatusIcon(status?: string): string {
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
export function getExplorationStatusColor(status: string): 'green' | 'red' | 'yellow' {
	if (status === 'running') return 'yellow';
	if (status === 'completed') return 'green';
	return 'red';
}
