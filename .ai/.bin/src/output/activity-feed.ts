/**
 * Real-time activity feed for tracking AI agent activities
 */

import { writeFile } from 'utils/file-utils';

import { getColorAdapter } from './color-adapter.interface';
import { getHeaderFormatter } from './header-formatter';

export interface ActivityEntry {
	agent?: string;
	message: string;
	status?: ActivityStatus;
	timestamp: Date;
}

export type ActivityStatus = 'error' | 'info' | 'success' | 'warning';

export class ActivityFeed {
	private entries: ActivityEntry[] = [];
	private maxEntries: number;

	constructor(maxEntries = 50) {
		this.maxEntries = maxEntries;
	}

	/**
	 * Add an entry to the feed
	 */
	addEntry(timestamp: Date, agent: string, message: string, status?: ActivityStatus): void {
		this.entries.push({
			agent,
			message,
			status,
			timestamp
		});

		// Trim to max entries (keep most recent)
		if (this.entries.length > this.maxEntries) {
			this.entries = this.entries.slice(-this.maxEntries);
		}
	}

	/**
	 * Add a simple message entry
	 */
	addMessage(message: string, status?: ActivityStatus): void {
		this.entries.push({
			message,
			status,
			timestamp: new Date()
		});

		if (this.entries.length > this.maxEntries) {
			this.entries = this.entries.slice(-this.maxEntries);
		}
	}

	/**
	 * Render the feed as a string
	 */
	render(): string {
		const color = getColorAdapter();
		if (this.entries.length === 0) {
			return color.gray('No activity yet...');
		}

		const lines: string[] = [];

		// Header
		const headerFormatter = getHeaderFormatter();
		const header = headerFormatter.formatHeader('🤖 AI ACTIVITY', { centered: false, minWidth: 57 });
		lines.push(header.trim());

		// Entries (show last 20 for display)
		const displayEntries = this.entries.slice(-20);

		lines.push(...displayEntries.map((entry) => this.formatEntry(entry)));

		lines.push('', color.gray(`  ℹ️  Showing last ${displayEntries.length} of ${this.entries.length} entries`), '');

		return lines.join('\n');
	}

	/**
	 * Get all entries
	 */
	getEntries(): ActivityEntry[] {
		return [...this.entries];
	}

	/**
	 * Clear all entries
	 */
	clear(): void {
		this.entries = [];
	}

	/**
	 * Export activity log to file
	 */
	async export(filepath: string): Promise<void> {
		const lines: string[] = [
			'# Activity Log',
			`Generated: ${new Date().toISOString()} Total Entries: ${this.entries.length}`,
			'',
			...this.entries.map((entry) => {
				const timestamp = entry.timestamp.toISOString();
				const agent = entry.agent ? `[${entry.agent}]` : '';
				const status = entry.status ? `[${entry.status.toUpperCase()}]` : '';
				return `${timestamp} ${agent} ${status} ${entry.message}`;
			})
		];

		await writeFile(filepath, lines.join('\n'));
	}

	/**
	 * Format a single entry
	 */
	private formatEntry(entry: ActivityEntry): string {
		const color = getColorAdapter();
		const time = color.gray(this.formatTime(entry.timestamp));
		const statusIcon = this.getStatusIcon(entry.status);
		const agentColor = this.getAgentColor(entry.agent);

		const agentDisplay = entry.agent ? agentColor(entry.agent.padEnd(20)) : ' '.repeat(20);

		const statusDisplay = statusIcon ? `${statusIcon} ` : '';
		const message = this.formatMessage(entry.message, entry.status);

		return `  ${time}  ${agentDisplay}  ${statusDisplay}${message}`;
	}

	/**
	 * Format timestamp
	 */
	private formatTime(timestamp: Date): string {
		return timestamp.toTimeString().substring(0, 8); // HH:MM:SS
	}

	/**
	 * Get status icon
	 */
	private getStatusIcon(status?: ActivityStatus): string {
		const color = getColorAdapter();
		const statusIcons: Record<ActivityStatus, string> = {
			error: color.red('✗'),
			info: color.blue('ℹ'),
			success: color.green('✓'),
			warning: color.yellow('⚠')
		};

		const normalizedStatus: ActivityStatus = status ?? 'info';
		return statusIcons[normalizedStatus];
	}

	/**
	 * Get agent color function
	 */
	private getAgentColor(agent?: string): (text: string) => string {
		const color = getColorAdapter();
		if (!agent) return color.gray.bind(color);

		// Assign consistent colors based on agent name
		const colorMap: Record<string, (text: string) => string> = {
			'@asserter': color.yellow.bind(color),
			'@lead': color.cyan.bind(color),
			'@platform-engineer': color.blue.bind(color),
			'@product-manager': color.magenta.bind(color),
			'@qa': color.green.bind(color),
			'@secops-engineer': color.red.bind(color),
			'@software-engineer': color.blue.bind(color),
			'@ui-ux-designer': color.magenta.bind(color)
		};

		// Find matching color (supports partial matches)
		const matchedColor = Object.entries(colorMap).find(([key]) => agent.includes(key))?.[1];

		return matchedColor ?? color.white.bind(color);
	}

	/**
	 * Format message with color based on status
	 */
	private formatMessage(message: string, status?: ActivityStatus): string {
		const color = getColorAdapter();
		const statusColors: Record<ActivityStatus, (text: string) => string> = {
			error: color.red.bind(color),
			info: color.white.bind(color),
			success: color.green.bind(color),
			warning: color.yellow.bind(color)
		};

		const normalizedStatus: ActivityStatus = status ?? 'info';
		return statusColors[normalizedStatus](message);
	}
}

/**
 * Singleton instance
 */
let feedInstance: ActivityFeed | null = null;

export function getActivityFeed(): ActivityFeed {
	feedInstance ??= new ActivityFeed();
	return feedInstance;
}

export function setActivityFeed(feed: ActivityFeed): void {
	feedInstance = feed;
}
