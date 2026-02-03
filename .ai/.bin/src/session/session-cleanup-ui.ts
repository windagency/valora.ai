/**
 * Session Cleanup UI - Interactive cleanup with preview and confirmation
 *
 * Architecture: Uses dependency injection to receive UIAdapter,
 * eliminating direct dependency on presentation libraries (inquirer, chalk)
 */

import type { SessionSummary } from 'types/session.types';
import type { UIAdapter } from 'types/ui.types';

import { SessionStore } from 'session/store';
import { isNonEmptyArray } from 'utils/type-guards';

export interface CleanupCriteria {
	minAgeDays?: number;
	minSizeMB?: number;
	status?: Array<'active' | 'completed' | 'failed' | 'paused'>;
}

export interface CleanupPreview {
	criteria: CleanupCriteria;
	sessionsToDelete: SessionSummary[];
	totalSizeBytes: number;
}

export class SessionCleanupUI {
	private sessionStore: SessionStore;
	private ui: UIAdapter;

	constructor(ui: UIAdapter, sessionStore?: SessionStore) {
		this.ui = ui;
		this.sessionStore = sessionStore ?? new SessionStore();
	}

	/**
	 * Interactive cleanup with preview and confirmation
	 */
	async interactiveCleanup(): Promise<number> {
		this.ui.displayHeader('🧹 Session Cleanup');

		// Step 1: Choose cleanup criteria
		const criteria = await this.promptCriteria();

		if (!criteria) {
			this.ui.displayWarning('Cleanup cancelled\n');
			return 0;
		}

		// Step 2: Preview what will be deleted
		const preview = await this.previewCleanup(criteria);

		if (preview.sessionsToDelete.length === 0) {
			this.ui.displaySuccess('\n✓ No sessions match the cleanup criteria\n');
			return 0;
		}

		// Step 3: Show preview and confirm
		this.displayPreview(preview);

		const confirmed = await this.confirmCleanup(preview.sessionsToDelete.length);

		if (!confirmed) {
			this.ui.displayWarning('\nCleanup cancelled\n');
			return 0;
		}

		// Step 4: Execute cleanup
		const deleted = await this.executeCleanup(preview.sessionsToDelete);

		this.ui.displaySuccess(`\n✓ Cleanup complete! Deleted ${deleted} session${deleted !== 1 ? 's' : ''}\n`);

		return deleted;
	}

	/**
	 * Display session statistics
	 */
	private displaySessionStats(
		allSessions: unknown[],
		stats: { active: number; completed: number; failed: number; paused: number; totalSize: number }
	): void {
		this.ui.display(this.ui.format('Current Sessions:', { bold: true }));
		this.ui.display(`  Total: ${this.ui.format(allSessions.length.toString(), { color: 'cyan' })}`);
		this.ui.display(`  Active: ${this.ui.format(stats.active.toString(), { color: 'green' })}`);
		this.ui.display(`  Paused: ${this.ui.format(stats.paused.toString(), { color: 'yellow' })}`);
		this.ui.display(`  Completed: ${this.ui.format(stats.completed.toString(), { color: 'gray' })}`);
		this.ui.display(`  Failed: ${this.ui.format(stats.failed.toString(), { color: 'red' })}`);
		this.ui.display(`  Total Size: ${this.ui.format(this.ui.formatBytes(stats.totalSize), { color: 'cyan' })}`);
		this.ui.display('');
	}

	/**
	 * Build cleanup criteria from user answers
	 */
	private buildCriteriaFromAnswers(answers: Record<string, unknown>): CleanupCriteria | null {
		const criteria: CleanupCriteria = {};

		this.applyMinAgeDaysCriteria(answers, criteria);
		this.applyStatusCriteria(answers, criteria);
		this.applyMinSizeMBCriteria(answers, criteria);

		if (this.hasNoCriteria(criteria)) {
			this.ui.displayWarning('\nNo criteria selected');
			return null;
		}

		return criteria;
	}

	/**
	 * Apply minimum age days criteria
	 */
	private applyMinAgeDaysCriteria(answers: Record<string, unknown>, criteria: CleanupCriteria): void {
		const minAgeDays = answers['minAgeDays'];
		if (typeof minAgeDays === 'number' && minAgeDays > 0) {
			criteria.minAgeDays = minAgeDays;
		}
	}

	/**
	 * Apply status criteria
	 */
	private applyStatusCriteria(answers: Record<string, unknown>, criteria: CleanupCriteria): void {
		const status = answers['status'];
		if (isNonEmptyArray(status)) {
			criteria.status = status as Array<'active' | 'completed' | 'failed' | 'paused'>;
		}
	}

	/**
	 * Apply minimum size MB criteria
	 */
	private applyMinSizeMBCriteria(answers: Record<string, unknown>, criteria: CleanupCriteria): void {
		const sizeValue = answers['minSizeMB'];

		if (!this.isValidSizeInput(sizeValue)) {
			return;
		}

		const sizeMB = parseFloat(sizeValue as string);
		if (!isNaN(sizeMB) && sizeMB > 0) {
			criteria.minSizeMB = sizeMB;
		}
	}

	/**
	 * Check if size input is valid
	 */
	private isValidSizeInput(value: unknown): boolean {
		return Boolean(value && typeof value === 'string' && value !== '');
	}

	/**
	 * Check if criteria has no values selected
	 */
	private hasNoCriteria(criteria: CleanupCriteria): boolean {
		return !criteria.minAgeDays && !criteria.status && !criteria.minSizeMB;
	}

	/**
	 * Prompt user for cleanup criteria
	 */
	private async promptCriteria(): Promise<CleanupCriteria | null> {
		// Get all sessions for statistics
		const allSessions = await this.sessionStore.listSessions();
		const stats = this.calculateStats(allSessions);

		this.displaySessionStats(allSessions, stats);

		const answers = await this.ui.prompt([
			{
				message: 'Delete sessions older than (days):',
				name: 'minAgeDays',
				type: 'number',
				validate: (value: unknown) => {
					if (value === '' || value === null || value === undefined) return true; // Allow skipping
					const num = typeof value === 'string' ? parseFloat(value) : typeof value === 'number' ? value : NaN;
					if (isNaN(num) || num < 0) return 'Age must be positive';
					return true;
				}
			},
			{
				choices: [
					{ checked: false, name: 'Active', value: 'active' },
					{ checked: false, name: 'Paused', value: 'paused' },
					{ checked: true, name: 'Completed', value: 'completed' },
					{ checked: true, name: 'Failed', value: 'failed' }
				],
				message: 'Delete sessions with status:',
				name: 'status',
				type: 'checkbox'
			},
			{
				default: '',
				message: 'Delete sessions larger than (MB, leave empty to skip):',
				name: 'minSizeMB',
				type: 'input',
				validate: (value: unknown) => {
					if (value === '' || value === null || value === undefined) return true; // Allow skipping
					const num = typeof value === 'string' ? parseFloat(value) : NaN;
					if (isNaN(num) || num < 0) return 'Size must be a positive number';
					return true;
				}
			}
		]);

		if (!answers) {
			// User cancelled
			return null;
		}

		return this.buildCriteriaFromAnswers(answers);
	}

	/**
	 * Preview cleanup - show what would be deleted
	 */
	async previewCleanup(criteria: CleanupCriteria): Promise<CleanupPreview> {
		const allSessions = await this.sessionStore.listSessions();

		// Filter sessions based on criteria using functional pattern
		const sessionsToDelete = allSessions.filter((session) => {
			// Check age criteria
			if (criteria.minAgeDays !== undefined) {
				const age = this.getSessionAgeDays(session.updated_at);
				if (age < criteria.minAgeDays) return false;
			}

			// Check status criteria
			if (criteria.status !== undefined && criteria.status.length > 0) {
				if (!criteria.status.includes(session.status as 'active' | 'completed' | 'failed' | 'paused')) return false;
			}

			// Check size criteria
			if (criteria.minSizeMB !== undefined) {
				const sizeMB = session.size_bytes / (1024 * 1024);
				if (sizeMB < criteria.minSizeMB) return false;
			}

			return true;
		});

		const totalSizeBytes = sessionsToDelete.reduce((sum, s) => sum + s.size_bytes, 0);

		return {
			criteria,
			sessionsToDelete,
			totalSizeBytes
		};
	}

	/**
	 * Get all sessions (public method)
	 */
	async getAllSessions(): Promise<SessionSummary[]> {
		return this.sessionStore.listSessions();
	}

	/**
	 * Display cleanup preview (public method)
	 */
	displayPreviewPublic(preview: CleanupPreview): void {
		this.displayPreview(preview);
	}

	/**
	 * Display cleanup preview
	 */
	private displayPreview(preview: CleanupPreview): void {
		const criteriaHandlers: Array<{
			condition: () => boolean;
			message: () => string;
		}> = [
			{
				condition: () => Boolean(preview.criteria.minAgeDays),
				message: () =>
					`  • Sessions older than ${this.ui.format(preview.criteria.minAgeDays!.toString(), { color: 'cyan' })} days`
			},
			{
				condition: () => Boolean(preview.criteria.status && preview.criteria.status.length > 0),
				message: () =>
					`  • Status: ${preview.criteria.status!.map((s) => this.ui.format(s, { color: 'cyan' })).join(', ')}`
			},
			{
				condition: () => Boolean(preview.criteria.minSizeMB),
				message: () =>
					`  • Size larger than ${this.ui.format(preview.criteria.minSizeMB!.toString(), { color: 'cyan' })} MB`
			}
		];

		const criteriaLines = criteriaHandlers.filter((handler) => handler.condition()).map((handler) => handler.message());

		const previewTitle = 'Cleanup Preview:';
		const separatorWidth = Math.min(previewTitle.length, 60);
		this.ui.display('');
		this.ui.display(this.ui.format(previewTitle, { bold: true }));
		this.ui.displaySeparator(separatorWidth, { color: 'gray' });
		this.ui.display('');
		this.ui.display(this.ui.format('Criteria:', { bold: true }));
		criteriaLines.forEach((line) => this.ui.display(line));
		this.ui.display('');
		this.ui.display(this.ui.format('Sessions to Delete:', { bold: true }));
		this.ui.display(`  Count: ${this.ui.format(preview.sessionsToDelete.length.toString(), { color: 'red' })}`);
		this.ui.display(`  Total Size: ${this.ui.format(this.ui.formatBytes(preview.totalSizeBytes), { color: 'cyan' })}`);
		this.ui.display('');

		// Show list of sessions (limit to 10)
		const displayCount = Math.min(preview.sessionsToDelete.length, 10);
		preview.sessionsToDelete.slice(0, displayCount).forEach((session, i) => {
			const age = this.getSessionAgeDays(session.updated_at);
			const status = this.getStatusColor(session.status);
			this.ui.display(
				`  ${this.ui.format((i + 1).toString().padStart(2), { color: 'gray' })}. ${this.ui.format(session.session_id.padEnd(25), { color: 'cyan' })} ${status.padEnd(20)} ${this.ui.format(age + ' days old', { color: 'gray' })}`
			);
		});

		if (preview.sessionsToDelete.length > 10) {
			this.ui.display(this.ui.format(`  ... and ${preview.sessionsToDelete.length - 10} more`, { color: 'gray' }));
		}

		this.ui.display('');
	}

	/**
	 * Confirm cleanup
	 */
	private async confirmCleanup(count: number): Promise<boolean> {
		const answers = await this.ui.prompt([
			{
				default: false,
				message: this.ui.format(`Delete ${count} session${count !== 1 ? 's' : ''}? This cannot be undone.`, {
					color: 'red'
				}),
				name: 'confirmed',
				type: 'confirm'
			}
		]);

		return answers ? Boolean(answers['confirmed']) : false;
	}

	/**
	 * Execute cleanup
	 */
	private async executeCleanup(sessions: SessionSummary[]): Promise<number> {
		// Delete all sessions in parallel
		const results = await Promise.allSettled(
			sessions.map((session) => this.sessionStore.deleteSession(session.session_id))
		);

		// Count successful deletions and log failures
		return results.reduce((deleted, result, index) => {
			if (result.status === 'fulfilled') {
				return deleted + 1;
			}

			const session = sessions[index];
			if (session) {
				const errorMessage = result.reason instanceof Error ? result.reason.message : String(result.reason);
				this.ui.displayError(`  Failed to delete ${session.session_id}: ${errorMessage}`);
			}
			return deleted;
		}, 0);
	}

	/**
	 * Cleanup by criteria (non-interactive)
	 */
	async cleanupByCriteria(criteria: CleanupCriteria, dryRun = false): Promise<number> {
		const preview = await this.previewCleanup(criteria);

		if (dryRun) {
			this.ui.display(this.ui.format('\n🔍 Dry Run - No sessions will be deleted\n', { bold: true }));
			this.displayPreview(preview);
			return preview.sessionsToDelete.length;
		}

		return this.executeCleanup(preview.sessionsToDelete);
	}

	/**
	 * Calculate session statistics
	 */
	private calculateStats(sessions: SessionSummary[]): {
		active: number;
		completed: number;
		failed: number;
		paused: number;
		totalSize: number;
	} {
		return {
			active: sessions.filter((s) => s.status === 'active').length,
			completed: sessions.filter((s) => s.status === 'completed').length,
			failed: sessions.filter((s) => s.status === 'failed').length,
			paused: sessions.filter((s) => s.status === 'paused').length,
			totalSize: sessions.reduce((sum, s) => sum + s.size_bytes, 0)
		};
	}

	/**
	 * Get session age in days
	 */
	private getSessionAgeDays(updatedAt: string): number {
		const now = Date.now();
		const updated = new Date(updatedAt).getTime();
		const diffMs = now - updated;
		return Math.floor(diffMs / (1000 * 60 * 60 * 24));
	}

	/**
	 * Get status with color
	 */
	private getStatusColor(status: string): string {
		const statusColors: Record<string, string> = {
			active: this.ui.format('Active', { color: 'green' }),
			completed: this.ui.format('Completed', { color: 'gray' }),
			failed: this.ui.format('Failed', { color: 'red' }),
			paused: this.ui.format('Paused', { color: 'yellow' })
		};

		return statusColors[status] ?? this.ui.format(status, { color: 'gray' });
	}
}
