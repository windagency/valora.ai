/**
 * Session Browser - Interactive session navigation with actions
 */

import type { Session, SessionSummary } from 'types/session.types';

import { getSessionFormatter } from 'cli/session-formatter';
import { getColorAdapter } from 'output/color-adapter.interface';
import { getConsoleOutput } from 'output/console-output';
import { getHeaderFormatter } from 'output/header-formatter';
import { createArchiveAdapter } from 'session/archive-adapter';
import { SessionExporter } from 'session/session-exporter';
import { SessionStore } from 'session/store';
import { getPromptAdapter } from 'ui/prompt-adapter.interface';
import { getSpinnerAdapter } from 'ui/spinner-adapter.interface';

import { SessionResumeService } from './session-resume';

const prompt = getPromptAdapter();
const spinner = getSpinnerAdapter();

export class SessionBrowser {
	private formatter: ReturnType<typeof getSessionFormatter>;
	private sessionStore: SessionStore;

	constructor(sessionStore?: SessionStore) {
		this.sessionStore = sessionStore ?? new SessionStore();
		this.formatter = getSessionFormatter();
	}

	/**
	 * Show interactive session browser
	 */
	async show(): Promise<void> {
		const consoleOut = getConsoleOutput();

		const browseSession = async (): Promise<boolean> => {
			const color = getColorAdapter();
			// Load sessions
			const sessions = await this.sessionStore.listSessions();

			if (sessions.length === 0) {
				consoleOut.blank();
				consoleOut.warn('No sessions found.');
				consoleOut.dim('  Sessions are created automatically when you run commands');
				consoleOut.blank();
				return false;
			}

			// Show header
			process.stdout.write('\x1B[2J\x1B[0f'); // Clear screen without using console.clear
			const headerFormatter = getHeaderFormatter();
			consoleOut.print(headerFormatter.formatHeader('📂 Session Browser', { width: 58 }));

			// Group sessions by status
			const groupedSessions = this.groupSessionsByStatus(sessions);

			// Build choices using functional pattern
			const choices: Array<
				InstanceType<typeof prompt.Separator> | { name: string; short?: string; value: null | string }
			> = [];

			// Helper to add session group
			const addSessionGroup = (sessions: SessionSummary[], label: string, limit?: number): void => {
				if (sessions.length === 0) return;

				choices.push(new prompt.Separator(label));

				const displaySessions = limit ? sessions.slice(0, limit) : sessions;
				const sessionChoices = displaySessions.map((session) => ({
					name: this.formatSessionChoice(session),
					short: session.session_id,
					value: session.session_id
				}));
				choices.push(...sessionChoices);

				if (limit && sessions.length > limit) {
					choices.push({
						name: color.gray(`  ... and ${sessions.length - limit} more`),
						value: null
					});
				}

				choices.push(new prompt.Separator());
			};

			// Add session groups
			addSessionGroup(groupedSessions.active, color.getRawFn('bold.green')('Active Sessions:'));
			addSessionGroup(groupedSessions.paused, color.getRawFn('bold.yellow')('Paused Sessions:'));
			addSessionGroup(
				groupedSessions.completed,
				color.getRawFn('bold.gray')(`Completed Sessions (${groupedSessions.completed.length}):`),
				5
			);
			addSessionGroup(groupedSessions.failed, color.getRawFn('bold.red')('Failed Sessions:'));

			// Add exit option
			choices.push({
				name: color.gray('Exit'),
				value: '__EXIT__'
			});

			// Prompt for session selection
			try {
				const answer = await prompt.prompt<{ sessionId: string }>([
					{
						choices,
						loop: false,
						message: 'Select a session:',
						name: 'sessionId',
						pageSize: 20,
						type: 'list'
					}
				]);

				if (answer.sessionId === '__EXIT__' || !answer.sessionId) {
					return false;
				}

				// Show session actions
				return await this.showSessionActions(answer.sessionId);
			} catch {
				// User cancelled (Ctrl+C)
				return false;
			}
		};

		// Keep browsing until user exits
		let shouldContinue = true;
		while (shouldContinue) {
			shouldContinue = await browseSession();
		}
	}

	/**
	 * Show actions for selected session
	 */
	private async showSessionActions(sessionId: string): Promise<boolean> {
		const color = getColorAdapter();
		const consoleOut = getConsoleOutput();
		// Load full session
		const session = await this.sessionStore.loadSession(sessionId);

		// Show session preview
		consoleOut.blank();
		consoleOut.print(this.formatter.formatSessionDetails(session));

		// Prompt for action
		const actions = [
			{
				name: color.cyan('Resume this session'),
				value: 'resume'
			},
			{
				name: color.cyan('Export as ZIP'),
				value: 'export'
			},
			{
				name: color.cyan('Archive (mark completed)'),
				value: 'archive'
			},
			{
				name: color.red('Delete session'),
				value: 'delete'
			},
			new prompt.Separator(),
			{
				name: color.gray('Back to session list'),
				value: 'back'
			},
			{
				name: color.gray('Exit'),
				value: 'exit'
			}
		];

		try {
			const answer = await prompt.prompt<{ action: string }>([
				{
					choices: actions,
					message: 'What would you like to do?',
					name: 'action',
					type: 'list'
				}
			]);

			const actionHandlers: Record<string, () => Promise<boolean>> = {
				archive: async () => {
					await this.archiveSession(sessionId);
					return true; // Continue browsing
				},
				back: () => Promise.resolve(true), // Continue browsing
				delete: async () => {
					await this.deleteSession(sessionId);
					return true; // Continue browsing
				},
				exit: () => Promise.resolve(false), // Exit browser
				export: async () => {
					await this.exportSession(sessionId);
					return true; // Continue browsing
				},
				resume: async () => {
					await this.resumeSession(session);
					return false; // Exit browser after resume
				}
			};

			const handler = actionHandlers[answer.action];
			return handler ? await handler() : true;
		} catch {
			// User cancelled
			return false;
		}
	}

	/**
	 * Resume session action
	 */
	private async resumeSession(session: Session): Promise<void> {
		const color = getColorAdapter();
		const consoleOut = getConsoleOutput();
		const resumeService = new SessionResumeService(this.sessionStore);
		const action = await resumeService.promptResume(session.session_id);

		if (action) {
			consoleOut.blank();
			consoleOut.print(`${color.cyan('→')} ${color.bold(action)}`);
			consoleOut.blank();
			consoleOut.dim('Run this command to continue');
			consoleOut.blank();
		}
	}

	/**
	 * Export session action
	 */
	private async exportSession(sessionId: string): Promise<void> {
		const color = getColorAdapter();
		const consoleOut = getConsoleOutput();
		const loading = spinner.create('Exporting session...').start();

		try {
			const exporter = new SessionExporter(this.sessionStore, createArchiveAdapter());
			const exportPath = await exporter.exportSession(sessionId);

			loading.succeed(color.green('Session exported successfully'));
			consoleOut.dim(`  Output: ${exportPath}`);

			// Prompt to continue
			await prompt.prompt([
				{
					message: 'Press Enter to continue...',
					name: 'continue',
					type: 'input'
				}
			]);
		} catch (error) {
			loading.fail(color.red('Failed to export session'));
			consoleOut.error((error as Error).message);

			await prompt.prompt([
				{
					message: 'Press Enter to continue...',
					name: 'continue',
					type: 'input'
				}
			]);
		}
	}

	/**
	 * Archive session action
	 */
	private async archiveSession(sessionId: string): Promise<void> {
		const consoleOut = getConsoleOutput();
		try {
			const session = await this.sessionStore.loadSession(sessionId);
			session.status = 'completed';
			await this.sessionStore.saveSession(session);

			consoleOut.blank();
			consoleOut.success('Session archived successfully');
			consoleOut.blank();

			await prompt.prompt([
				{
					message: 'Press Enter to continue...',
					name: 'continue',
					type: 'input'
				}
			]);
		} catch (error) {
			consoleOut.error(`Failed to archive session: ${(error as Error).message}`);
			consoleOut.blank();

			await prompt.prompt([
				{
					message: 'Press Enter to continue...',
					name: 'continue',
					type: 'input'
				}
			]);
		}
	}

	/**
	 * Delete session action
	 */
	private async deleteSession(sessionId: string): Promise<void> {
		const color = getColorAdapter();
		const consoleOut = getConsoleOutput();
		// Confirm deletion
		const confirm = await prompt.prompt([
			{
				default: false,
				message: color.red(`Are you sure you want to delete ${sessionId}? This cannot be undone.`),
				name: 'confirmed',
				type: 'confirm'
			}
		]);

		if (!confirm['confirmed']) {
			consoleOut.warn('Deletion cancelled');
			consoleOut.blank();
			return;
		}

		try {
			await this.sessionStore.deleteSession(sessionId);
			consoleOut.blank();
			consoleOut.success('Session deleted');
			consoleOut.blank();

			await prompt.prompt([
				{
					message: 'Press Enter to continue...',
					name: 'continue',
					type: 'input'
				}
			]);
		} catch (error) {
			consoleOut.error(`Failed to delete session: ${(error as Error).message}`);
			consoleOut.blank();

			await prompt.prompt([
				{
					message: 'Press Enter to continue...',
					name: 'continue',
					type: 'input'
				}
			]);
		}
	}

	/**
	 * Group sessions by status
	 */
	private groupSessionsByStatus(sessions: SessionSummary[]): {
		active: SessionSummary[];
		completed: SessionSummary[];
		failed: SessionSummary[];
		paused: SessionSummary[];
	} {
		return {
			active: sessions.filter((s) => s.status === 'active'),
			completed: sessions.filter((s) => s.status === 'completed'),
			failed: sessions.filter((s) => s.status === 'failed'),
			paused: sessions.filter((s) => s.status === 'paused')
		};
	}

	/**
	 * Format session choice for list
	 */
	private formatSessionChoice(session: SessionSummary): string {
		const color = getColorAdapter();
		const age = this.formatAge(session.last_active);
		const commandCount = color.gray(`(${session.command_count} cmd${session.command_count !== 1 ? 's' : ''})`);

		return `  ${color.cyan(session.session_id.padEnd(25))} ${color.gray(age.padEnd(15))} ${commandCount}`;
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

		return unit ? `${unit.value} ${unit.label}${unit.value > 1 ? 's' : ''} ago` : 'just now';
	}
}
