/**
 * Rich formatting for session information
 *
 * NOTE: This is a CLI presentation layer component. It uses chalk for
 * terminal formatting and should not be imported by domain layers.
 * This formatter is specific to CLI output and lives in the CLI layer.
 */

import type { Session, SessionSummary } from 'types/session.types';

import { getColorAdapter } from 'output/color-adapter.interface';
import { getHeaderFormatter } from 'output/header-formatter';
import { formatDurationMs } from 'utils/number-format';

export class SessionFormatter {
	/**
	 * Format session list
	 */
	formatSessionList(sessions: SessionSummary[]): string {
		const color = getColorAdapter();
		if (sessions.length === 0) {
			return color.gray('\nNo sessions found.\n');
		}

		const headerFormatter = getHeaderFormatter();
		const headerText = '📂 ACTIVE SESSIONS';
		const width = Math.min(headerText.length + 4, 70);
		const totalSize = sessions.reduce((sum, s) => sum + (s.size_bytes ?? 0), 0);
		const sessionItems = sessions.map((session) => this.formatSessionItem(session)).join('\n\n');

		const header = headerFormatter.formatHeader(headerText, { centered: false, minWidth: width - 2 });

		return `${header}
${sessionItems}

${color.gray(`  ℹ️  ${sessions.length} session${sessions.length > 1 ? 's' : ''} • ${this.formatSize(totalSize)} total`)}
`;
	}

	/**
	 * Format single session item in list
	 */
	private formatSessionItem(session: SessionSummary): string {
		const color = getColorAdapter();
		const statusIcon = this.getStatusIcon(session.status);
		const age = this.formatAge(session.last_active || session.updated_at);

		const commands =
			session.command_count > 0 ? `\n${color.gray('  ├─ Commands: ')}${this.formatCommandFlow(session)}` : '';

		const fileChanges =
			session.file_changes && this.formatFileChanges(session.file_changes) !== color.gray('None yet')
				? `\n${color.gray('  ├─ Files: ')}${this.formatFileChanges(session.file_changes)}`
				: '';

		const statusMessage = (session as { status_message?: string }).status_message
			? `\n${color.gray('  ├─ Status: ')}${(session as { status_message?: string }).status_message}`
			: '';

		const size = session.size_bytes ? `\n${color.gray('  └─ Size: ')}${this.formatSize(session.size_bytes)}` : '';

		return `  ${statusIcon} ${color.cyan(session.session_id).padEnd(30)}  ${color.gray(age)}  ${this.getStatusLabel(session.status)}${commands}${fileChanges}${statusMessage}${size}`;
	}

	/**
	 * Format session details view
	 */
	formatSessionDetails(session: Session, options?: { showContext?: boolean; showFiles?: boolean }): string {
		const color = getColorAdapter();
		const width = this.calculateHeaderWidth(session.session_id);
		const showFiles = options?.showFiles ?? true;
		const showContext = options?.showContext ?? true;

		const sections = this.buildSessionSections(session, width, showFiles, showContext);
		const header = this.buildSessionHeader(session.session_id, width);
		const overview = this.buildOverviewSection(session, color, width);

		return `${header}${overview}${sections}`;
	}

	private buildArtifactsSection(session: Session, width: number): string {
		const artifacts = this.extractArtifacts(session);
		if (artifacts.length === 0) {
			return '';
		}

		const color = getColorAdapter();
		return `
${color.bold(`ARTIFACTS (${artifacts.length} items)`)}
${color.gray('─'.repeat(width))}
${this.formatArtifactsList(artifacts)}
`;
	}

	private buildCommandHistorySection(session: Session, width: number): string {
		if (session.commands.length === 0) {
			return '';
		}

		const color = getColorAdapter();
		return `
${color.bold(`COMMAND HISTORY (${session.commands.length} commands)`)}
${color.gray('─'.repeat(width))}
${this.formatCommandHistory(session.commands)}
`;
	}

	private buildContextSection(session: Session, width: number, showContext: boolean): string {
		if (!showContext || !session.context || Object.keys(session.context).length === 0) {
			return '';
		}

		const color = getColorAdapter();
		return `
${color.bold('SESSION CONTEXT')}
${color.gray('─'.repeat(width))}
${this.formatSessionContext(session.context)}
`;
	}

	private buildFilesSection(session: Session, width: number, showFiles: boolean): string {
		if (!showFiles) {
			return '';
		}

		const fileChanges = this.extractFileChanges(session);
		if (fileChanges.length === 0) {
			return '';
		}

		const color = getColorAdapter();
		return `
${color.bold(`FILES MODIFIED (${fileChanges.length} files)`)}
${color.gray('─'.repeat(width))}
${this.formatFileChangesList(fileChanges)}
`;
	}

	private buildOverviewSection(session: Session, color: ReturnType<typeof getColorAdapter>, width: number): string {
		return `
${color.bold('OVERVIEW')}
${color.gray('─'.repeat(width))}
Created:       ${color.cyan(this.formatDate(session.created_at))}
Last Active:   ${color.cyan(this.formatDate(session.updated_at))} ${color.gray('(' + this.formatAge(session.updated_at) + ')')}
Status:        ${this.getStatusLabel(session.status)}
`;
	}

	private buildSessionHeader(sessionId: string, width: number): string {
		const headerFormatter = getHeaderFormatter();
		return headerFormatter.formatHeader(`📂 SESSION: ${sessionId}`, {
			centered: false,
			maxWidth: width
		});
	}

	private buildSessionSections(session: Session, width: number, showFiles: boolean, showContext: boolean): string {
		const commandHistory = this.buildCommandHistorySection(session, width);
		const filesSection = this.buildFilesSection(session, width, showFiles);
		const artifactsSection = this.buildArtifactsSection(session, width);
		const contextSection = this.buildContextSection(session, width, showContext);

		return `${commandHistory}${filesSection}${artifactsSection}${contextSection}`;
	}

	private calculateHeaderWidth(sessionId: string): number {
		const headerText = `📂 SESSION: ${sessionId}`;
		return Math.min(headerText.length + 4, 70);
	}

	/**
	 * Format command history
	 */
	formatCommandHistory(commands: Array<{ command: string; success: boolean; timestamp?: string }>): string {
		const color = getColorAdapter();
		return commands
			.map((cmd, index) => {
				const icon = cmd.success ? color.green('✓') : color.red('✗');
				const time = cmd.timestamp ? color.gray(this.formatTime(cmd.timestamp)) : color.gray('--:--:--');
				return `  ${icon} ${index + 1}. ${color.cyan(cmd.command)} ${time}`;
			})
			.join('\n');
	}

	/**
	 * Format file changes
	 */
	formatFileChanges(changes: { created: number; deleted: number; modified: number }): string {
		const color = getColorAdapter();
		const parts = [
			changes.modified > 0 && color.yellow(`${changes.modified} modified`),
			changes.created > 0 && color.green(`${changes.created} created`),
			changes.deleted > 0 && color.red(`${changes.deleted} deleted`)
		].filter(Boolean);

		return parts.length > 0 ? parts.join(', ') : color.gray('None yet');
	}

	/**
	 * Format session metrics
	 */
	formatSessionMetrics(session: Session): string {
		const color = getColorAdapter();
		const duration = new Date(session.updated_at).getTime() - new Date(session.created_at).getTime();
		const metricsTitle = 'METRICS';
		const width = Math.min(metricsTitle.length, 60);

		return `${color.bold(metricsTitle)}
${color.gray('─'.repeat(width))}
Duration:      ${formatDurationMs(duration)}
Commands:      ${session.commands.length}
Success Rate:  ${this.calculateSuccessRate(session.commands)}%`;
	}

	/**
	 * Get status icon
	 */
	private getStatusIcon(status: string): string {
		const color = getColorAdapter();
		const statusIcons: Record<string, string> = {
			active: color.green('✓'),
			completed: color.green('✓'),
			failed: color.red('✗'),
			paused: color.yellow('⏸')
		};

		return statusIcons[status] ?? color.gray('○');
	}

	/**
	 * Get status label with color
	 */
	private getStatusLabel(status: string): string {
		const color = getColorAdapter();
		const statusLabels: Record<string, string> = {
			active: color.green('Active'),
			completed: color.green('Complete'),
			failed: color.red('Failed'),
			paused: color.yellow('Paused')
		};

		return statusLabels[status] ?? color.gray(status);
	}

	/**
	 * Format command flow
	 */
	private formatCommandFlow(session: SessionSummary): string {
		const color = getColorAdapter();
		// For now, just show count
		// In future, could parse actual command names from session
		return color.cyan(`${session.command_count} executed`);
	}

	/**
	 * Format age (relative time)
	 */
	private formatAge(timestamp: string): string {
		const diff = Date.now() - new Date(timestamp).getTime();
		const seconds = Math.floor(diff / 1000);

		const timeUnits = [
			{ label: 'day', value: Math.floor(seconds / 86400) },
			{ label: 'hour', value: Math.floor(seconds / 3600) },
			{ label: 'minute', value: Math.floor(seconds / 60) }
		];

		const unit = timeUnits.find((u) => u.value > 0);

		return unit ? `${unit.value} ${unit.label}${unit.value > 1 ? 's' : ''} ago` : 'Just now';
	}

	/**
	 * Format date
	 */
	private formatDate(timestamp: string): string {
		const date = new Date(timestamp);
		return date.toLocaleString();
	}

	/**
	 * Format time (HH:MM:SS)
	 */
	private formatTime(timestamp: string): string {
		const date = new Date(timestamp);
		const hours = String(date.getHours()).padStart(2, '0');
		const minutes = String(date.getMinutes()).padStart(2, '0');
		const seconds = String(date.getSeconds()).padStart(2, '0');
		return `${hours}:${minutes}:${seconds}`;
	}

	/**
	 * Format size in bytes
	 */
	private formatSize(bytes: number): string {
		const units = [
			{ divisor: 1024 ** 2, label: 'MB', threshold: 1024 ** 2 },
			{ divisor: 1024, label: 'KB', threshold: 1024 },
			{ divisor: 1, label: 'B', threshold: 0 }
		];

		const unit = units.find((u) => bytes >= u.threshold);

		if (!unit) return '0 B';

		const value = bytes / unit.divisor;
		return unit.label === 'B' ? `${value} ${unit.label}` : `${value.toFixed(1)} ${unit.label}`;
	}

	/**
	 * Calculate success rate
	 */
	private calculateSuccessRate(commands: Array<{ success: boolean }>): number {
		if (commands.length === 0) return 0;

		const successful = commands.filter((c) => c.success).length;
		return Math.round((successful / commands.length) * 100);
	}

	/**
	 * Extract file changes from session
	 */
	private extractFileChanges(
		session: Session
	): Array<{ additions?: number; deletions?: number; file: string; status: string }> {
		const changes: Array<{ additions?: number; deletions?: number; file: string; status: string }> = [];

		// Check if session has file_changes in context
		if (session.context?.['file_changes'] && Array.isArray(session.context['file_changes'])) {
			return session.context['file_changes'] as Array<{
				additions?: number;
				deletions?: number;
				file: string;
				status: string;
			}>;
		}

		// Check commands for file modifications using modern functional patterns
		const fileChanges = session.commands
			.filter((cmd) => cmd.outputs?.['modified_files'] && Array.isArray(cmd.outputs['modified_files']))
			.flatMap((cmd) => cmd.outputs['modified_files'] as Array<Record<string, unknown> | string>)
			.map((file) => {
				if (typeof file === 'string') {
					return { file, status: 'modified' };
				}
				if (typeof file === 'object' && file !== null && 'file' in file) {
					return file as { additions?: number; deletions?: number; file: string; status: string };
				}
				return null;
			})
			.filter((file): file is NonNullable<typeof file> => file !== null);

		changes.push(...fileChanges);

		return changes;
	}

	/**
	 * Format detailed file changes list
	 */
	private formatFileChangesList(
		changes: Array<{ additions?: number; deletions?: number; file: string; status: string }>
	): string {
		const color = getColorAdapter();
		return changes
			.map((change) => {
				const statusIcon =
					change.status === 'created' || change.status === 'added'
						? color.green('+')
						: change.status === 'deleted'
							? color.red('-')
							: color.yellow('~');

				const stats =
					change.additions !== undefined || change.deletions !== undefined
						? color.gray(
								` ${change.additions ? color.green('+' + change.additions) : ''} ${change.deletions ? color.red('-' + change.deletions) : ''}`.trim()
							)
						: '';

				return `  ${statusIcon} ${color.cyan(change.file)}${stats}`;
			})
			.join('\n');
	}

	/**
	 * Extract artifacts from session
	 */
	private extractArtifacts(session: Session): Array<{ description: string; name: string; path?: string }> {
		const artifacts: Array<{ description: string; name: string; path?: string }> = [];

		// Check if session has artifacts in context
		if (session.context?.['artifacts'] && Array.isArray(session.context['artifacts'])) {
			return session.context['artifacts'] as Array<{ description: string; name: string; path?: string }>;
		}

		// Infer common artifacts from commands using functional patterns
		const artifactMappings: Array<{
			checkOutput?: string;
			command: string;
			description: string;
			name: string;
			pathKey?: string;
		}> = [
			{ command: 'plan', description: 'Implementation plan', name: 'plan.md', pathKey: 'plan_file' },
			{
				checkOutput: 'test_results',
				command: 'test',
				description: 'Test execution report',
				name: 'test-results.json',
				pathKey: 'test_results_file'
			},
			{ command: 'review-code', description: 'Code review summary', name: 'review.md', pathKey: 'review_file' }
		];

		const inferredArtifacts = session.commands
			.filter((cmd) => cmd.success)
			.flatMap((cmd) => {
				return artifactMappings
					.filter((mapping) => {
						if (cmd.command !== mapping.command) return false;
						if (mapping.checkOutput && !cmd.outputs?.[mapping.checkOutput]) return false;
						return true;
					})
					.map((mapping) => ({
						description: mapping.description,
						name: mapping.name,
						path: mapping.pathKey ? (cmd.outputs?.[mapping.pathKey] as string | undefined) : undefined
					}));
			});

		artifacts.push(...inferredArtifacts);

		return artifacts;
	}

	/**
	 * Format artifacts list
	 */
	private formatArtifactsList(artifacts: Array<{ description: string; name: string; path?: string }>): string {
		const color = getColorAdapter();
		return artifacts
			.map((artifact) => {
				const location = artifact.path ? color.gray(` (${artifact.path})`) : '';
				return `  📄 ${color.cyan(artifact.name)}${location}\n     ${color.gray(artifact.description)}`;
			})
			.join('\n');
	}

	/**
	 * Format session context in a structured way
	 */
	private formatSessionContext(context: Record<string, unknown>): string {
		const color = getColorAdapter();
		const lines: string[] = [];

		// Common context fields to highlight
		const highlightFields = ['feature', 'task', 'description', 'dependencies', 'risks', 'agent', 'model'];

		// Process highlighted fields using functional pattern
		const highlightedLines = highlightFields
			.filter((field) => context[field])
			.map((field) => {
				const value = context[field];
				const fieldName = color.cyan(field.charAt(0).toUpperCase() + field.slice(1));
				const displayValue = Array.isArray(value) ? value.join(', ') : String(value);
				return `${fieldName}: ${displayValue}`;
			});

		lines.push(...highlightedLines);

		// Add other context fields not in highlights using functional pattern
		const otherLines = Object.entries(context)
			.filter(([key, value]) => {
				if (highlightFields.includes(key)) return false;
				if (value === undefined || value === null) return false;
				if (typeof value === 'object' && !Array.isArray(value)) return false;
				const displayValue = Array.isArray(value) ? value.join(', ') : String(value);
				return displayValue.length < 100;
			})
			.map(([key, value]) => {
				const displayValue = Array.isArray(value) ? value.join(', ') : String(value);
				return `${color.cyan(key)}: ${displayValue}`;
			});

		lines.push(...otherLines);

		return lines.join('\n');
	}
}

/**
 * Singleton instance
 */
let formatterInstance: null | SessionFormatter = null;

export function getSessionFormatter(): SessionFormatter {
	formatterInstance ??= new SessionFormatter();
	return formatterInstance;
}
