/**
 * Session command definitions for CLI
 */

import type { CommandAdapter } from 'cli/command-adapter.interface';
import type { SessionSummary } from 'types/session.types';

import { SessionBrowser } from 'cli/session-browser';
import { CLIUIAdapter } from 'cli/session-cleanup-adapter';
import { getSessionFormatter } from 'cli/session-formatter';
import { SessionResumeService } from 'cli/session-resume';
import { getColorAdapter } from 'output/color-adapter.interface';
import { createArchiveAdapter } from 'session/archive-adapter';
import { SessionLifecycle } from 'session/lifecycle';
import { SessionCleanupUI } from 'session/session-cleanup-ui';
import { SessionExporter } from 'session/session-exporter';
import { SessionStore } from 'session/store';
import { getPromptAdapter } from 'ui/prompt-adapter.interface';
import { getSpinnerAdapter } from 'ui/spinner-adapter.interface';
import { formatError } from 'utils/error-handler';

const prompt = getPromptAdapter();
const spinner = getSpinnerAdapter();

/**
 * CLI options for session cleanup command
 */
interface SessionCleanupOptions extends Record<string, unknown> {
	dryRun?: boolean;
	force?: boolean;
	interactive?: boolean;
	olderThan?: string;
	retention?: boolean;
	status?: string;
}

/**
 * Format bytes to human readable size
 */
function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Cleanup criteria interface (local version before conversion)
 */
interface CleanupCriteria {
	minAgeDays?: number;
	status?: Array<'active' | 'completed' | 'failed' | 'paused'>;
}

/**
 * Build cleanup criteria from command options
 */
function buildCleanupCriteria(options: SessionCleanupOptions): CleanupCriteria {
	const criteria: CleanupCriteria = {};
	const color = getColorAdapter();

	if (options['olderThan']) {
		const days = parseInt(options['olderThan'] as string, 10);
		if (isNaN(days) || days < 0) {
			console.error(color.red('Invalid age: must be a positive number'));
			process.exit(1);
		}
		criteria.minAgeDays = days;
	}

	if (options['status'] && typeof options['status'] === 'string') {
		const statuses = (options['status'] as string).split(',').map((s) => s.trim());
		const validStatuses = ['active', 'paused', 'completed', 'failed'];
		const invalidStatus = statuses.find((status) => !validStatuses.includes(status));
		if (invalidStatus) {
			console.error(color.red(`Invalid status: ${invalidStatus}. Must be one of: ${validStatuses.join(', ')}`));
			process.exit(1);
		}
		criteria.status = statuses as Array<'active' | 'completed' | 'failed' | 'paused'>;
	}

	return criteria;
}

/**
 * Handle retention policy cleanup
 */
async function handleRetentionPolicyCleanup(dryRun: boolean): Promise<void> {
	const color = getColorAdapter();
	const { runRetentionPolicy } = await import('session/retention-policy-runner');
	const result = await runRetentionPolicy(dryRun);

	console.log(`
${color.bold('Session Retention Policy Results:')}
  Deleted:       ${color.cyan(result.deletedSessions.length.toString())} sessions
  Compressed:    ${color.cyan(result.compressedSessions.length.toString())} sessions
  Size Before:   ${color.cyan(formatBytes(result.totalSizeBefore))}
  Size After:    ${color.cyan(formatBytes(result.totalSizeAfter))}
  Size Saved:    ${color.cyan(formatBytes(result.totalSizeBefore - result.totalSizeAfter))}
${result.errors.length > 0 ? `  Errors:        ${color.red(result.errors.length.toString())}` : ''}
`);

	if (result.errors.length > 0) {
		console.log(color.red('Errors:'));
		result.errors.forEach((err) => console.log(color.red(`  - ${err}`)));
	}

	if (dryRun) {
		console.log(color.gray('  (Dry run - no changes made)'));
	} else {
		console.log(color.green('✓ Cleanup complete'));
	}
}

/**
 * Confirm cleanup with user
 */
async function confirmCleanup(
	toDeleteCount: number,
	totalSessions: number,
	options: SessionCleanupOptions
): Promise<boolean> {
	const color = getColorAdapter();

	// Skip confirmation if force flag is set
	if (options['force']) {
		return true;
	}

	// Warn if deleting more than 50% of sessions
	if (totalSessions > 0 && toDeleteCount / totalSessions > 0.5) {
		console.log(
			color.yellow(
				`\n⚠️  WARNING: This will delete ${toDeleteCount} of ${totalSessions} sessions (${Math.round((toDeleteCount / totalSessions) * 100)}%)`
			)
		);

		const answer = await prompt.prompt<{ confirmed: boolean }>([
			{
				default: false,
				message: color.red('Are you sure you want to proceed?'),
				name: 'confirmed',
				type: 'confirm'
			}
		]);

		if (!answer.confirmed) {
			console.log(color.yellow('\nCleanup cancelled\n'));
			return false;
		}
	}

	// Show confirmation for any cleanup
	if (toDeleteCount > 0) {
		const answer = await prompt.prompt<{ confirmed: boolean }>([
			{
				default: false,
				message: color.red(`Delete ${toDeleteCount} session${toDeleteCount !== 1 ? 's' : ''}? This cannot be undone.`),
				name: 'confirmed',
				type: 'confirm'
			}
		]);

		if (!answer.confirmed) {
			console.log(color.yellow('\nCleanup cancelled\n'));
			return false;
		}
	}

	return true;
}

/**
 * Handle non-interactive cleanup with criteria
 */
async function handleNonInteractiveCleanup(
	cleanupUI: SessionCleanupUI,
	criteria: CleanupCriteria,
	options: SessionCleanupOptions
): Promise<void> {
	const color = getColorAdapter();

	// Check if any criteria provided
	if (Object.keys(criteria).length === 0) {
		console.error(color.red('No cleanup criteria provided. Use --older-than or --status'));
		console.log(color.gray('  Or run without options for interactive mode'));
		process.exit(1);
	}

	// Preview the cleanup first
	const preview = await cleanupUI.previewCleanup(criteria);
	const toDeleteCount = preview.sessionsToDelete.length;

	// Safety check and confirmation
	if (!options.dryRun) {
		const totalSessions = (await cleanupUI.getAllSessions()).length;
		const confirmed = await confirmCleanup(toDeleteCount, totalSessions, options);

		if (!confirmed) {
			return;
		}

		// Show preview before execution
		if (toDeleteCount > 0 && !options['force']) {
			console.log(color.bold('\n📋 Cleanup Preview:\n'));
			cleanupUI.displayPreviewPublic(preview);
		}
	}

	const deleted = await cleanupUI.cleanupByCriteria(criteria, options.dryRun ?? false);

	if (options.dryRun) {
		console.log(`
${color.cyan(`Would delete ${deleted} session${deleted !== 1 ? 's' : ''}`)}
${color.gray('  Run without --dry-run to actually delete')}
`);
	} else {
		console.log(color.green(`\n✓ Deleted ${deleted} session${deleted !== 1 ? 's' : ''}\n`));
	}
}

/**
 * Configure session command
 */
export function configureSessionCommand(program: CommandAdapter): void {
	const sessionCmd = program.command('session').description('Manage sessions');

	sessionCmd
		.command('list')
		.description('List all sessions')
		.option('-v, --verbose', 'Show detailed session information')
		.option('--status <status>', 'Filter by status')
		.option('--sort <field>', 'Sort by field (date, size)', 'date')
		.action(async (options) => {
			const color = getColorAdapter();
			try {
				const sessionStore = new SessionStore();
				const formatter = getSessionFormatter();
				let sessions = await sessionStore.listSessions();

				// Filter by status if provided
				if (options['status']) {
					sessions = sessions.filter((s) => s.status === options['status']);
				}

				const sortFunctions: Record<string, (a: SessionSummary, b: SessionSummary) => number> = {
					date: (a, b) =>
						new Date(b.last_active || b.updated_at).getTime() - new Date(a.last_active || a.updated_at).getTime(),
					size: (a, b) => (b.size_bytes ?? 0) - (a.size_bytes ?? 0)
				};

				const sortBy = options['sort'] ?? 'date';
				const sortFunction = sortFunctions[sortBy as keyof typeof sortFunctions] ?? sortFunctions['date'];
				sessions.sort(sortFunction);

				// Use formatter for rich display

				console.log(formatter.formatSessionList(sessions));
			} catch (error) {
				console.error(color.red('Failed to list sessions:'), formatError(error as Error));
				process.exit(1);
			}
		});

	sessionCmd
		.command('resume [sessionId]')
		.description('Resume a session with smart suggestions')
		.option('--auto', 'Auto-select most recent session')
		.action(async (...args: Array<Record<string, unknown>>) => {
			const sessionId = args[0] as unknown as string | undefined;
			const options = args[1] as unknown as Record<string, unknown>;
			const color = getColorAdapter();
			try {
				const resumeService = new SessionResumeService();
				let targetSessionId: string | undefined = sessionId;

				// If auto flag is set and no sessionId, get last active
				if (options['auto'] && !targetSessionId) {
					const lastSession = await resumeService.getLastActiveSession();
					if (!lastSession) {
						console.log(`${color.yellow('No active sessions found')}
${color.gray('  Start a new session with any command')}`);
						return;
					}
					targetSessionId = lastSession.session_id;
				}

				// Show interactive resume prompt
				const action = await resumeService.promptResume(targetSessionId);

				if (action) {
					console.log(`
${color.cyan('→')} ${color.bold(action)}

${color.gray('Run this command to continue')}
`);
				}
			} catch (error) {
				console.error(color.red('Failed to resume session:'), formatError(error as Error));
				process.exit(1);
			}
		});

	sessionCmd
		.command('browse')
		.alias('b')
		.description('Interactive session browser')
		.action(async () => {
			const color = getColorAdapter();
			try {
				const browser = new SessionBrowser();
				await browser.show();
			} catch (error) {
				console.error(color.red('Failed to browse sessions:'), formatError(error as Error));
				process.exit(1);
			}
		});

	sessionCmd
		.command('clean')
		.alias('cleanup')
		.description('Interactive session cleanup with preview')
		.option('--older-than <days>', 'Delete sessions older than N days')
		.option('--status <status>', 'Delete sessions with specific status (comma-separated)')
		.option('--retention', 'Use configured retention policy from config.json')
		.option('--dry-run', 'Preview without deleting')
		.option('--force', 'Skip confirmation prompts (dangerous!)')
		.option('--no-interactive', 'Non-interactive mode (use with other options)')
		.action(async (options) => {
			const color = getColorAdapter();
			try {
				const ui = new CLIUIAdapter();
				const cleanupUI = new SessionCleanupUI(ui);

				// Retention policy mode
				if (options['retention']) {
					await handleRetentionPolicyCleanup((options['dryRun'] as boolean | undefined) ?? false);
					return;
				}

				// Check if user provided any criteria (implies non-interactive)
				const hasCriteria = options['olderThan'] ?? options['status'];

				// Interactive mode (default when no criteria provided)
				if (options['interactive'] !== false && !hasCriteria) {
					await cleanupUI.interactiveCleanup();
					return;
				}

				// Non-interactive mode with criteria
				const criteria = buildCleanupCriteria(options);
				await handleNonInteractiveCleanup(cleanupUI, criteria, options);
			} catch (error) {
				console.error(color.red('Failed to clean sessions:'), formatError(error as Error));
				process.exit(1);
			}
		});

	sessionCmd
		.command('clear')
		.description('Clear all inactive sessions (deprecated, use "clean")')
		.action(async () => {
			const color = getColorAdapter();
			try {
				console.log(color.yellow('Note: "clear" is deprecated, use "valora session clean" instead\n'));

				const sessionLifecycle = new SessionLifecycle(new SessionStore());
				const clearedCount = await sessionLifecycle.cleanupOldSessions();

				console.log(color.green(`✓ Cleared ${clearedCount} inactive sessions\n`));
			} catch (error) {
				console.error(color.red('Failed to clear sessions:'), formatError(error as Error));
				process.exit(1);
			}
		});

	sessionCmd
		.command('archive <sessionId>')
		.description('Archive a session (mark as completed)')
		.action(async (...args: Array<Record<string, unknown>>) => {
			const sessionId = args[0] as unknown as string;
			const color = getColorAdapter();
			try {
				const sessionStore = new SessionStore();
				const session = await sessionStore.loadSession(sessionId);

				// Mark as completed
				session.status = 'completed';
				await sessionStore.saveSession(session);

				console.log(`${color.green(`✓ Session ${sessionId} archived successfully`)}
${color.gray('  Status changed to: completed')}`);
			} catch (error) {
				console.error(color.red(`Failed to archive session ${sessionId}:`), formatError(error as Error));
				process.exit(1);
			}
		});

	sessionCmd
		.command('delete <sessionId>')
		.description('Delete a specific session')
		.option('-f, --force', 'Skip confirmation prompt')
		.action(async (...args: Array<Record<string, unknown>>) => {
			const sessionId = args[0] as unknown as string;
			const options = args[1] as unknown as Record<string, unknown>;
			const color = getColorAdapter();
			try {
				const sessionStore = new SessionStore();

				// Load session to show details before deletion
				let sessionInfo = '';
				try {
					const session = await sessionStore.loadSession(sessionId);
					sessionInfo = `
  Created:       ${new Date(session.created_at).toLocaleString()}
  Commands:      ${session.commands.length} executed
  Status:        ${session.status}
`;
				} catch {
					// Session might not exist or be corrupted
				}

				// Confirm deletion unless force flag is set
				if (!options['force']) {
					const answer = await prompt.prompt<{ confirm: boolean }>([
						{
							default: false,
							message: `Are you sure you want to delete session ${color.cyan(sessionId)}?${sessionInfo}\n  ${color.red('This action CANNOT be undone!')}`,
							name: 'confirm',
							type: 'confirm'
						}
					]);

					if (!answer.confirm) {
						console.log(color.yellow('Deletion cancelled'));
						return;
					}
				}

				await sessionStore.deleteSession(sessionId);

				console.log(`${color.green(`✓ Session ${sessionId} deleted`)}
${color.gray("  💡 Tip: Use 'valora session archive' to mark sessions as completed instead")}`);
			} catch (error) {
				console.error(color.red(`Failed to delete session ${sessionId}:`), formatError(error as Error));
				process.exit(1);
			}
		});

	sessionCmd
		.command('export <sessionId> [outputPath]')
		.description('Export session as ZIP archive')
		.option('--no-artifacts', 'Exclude session artifacts')
		.action(async (...args: Array<Record<string, unknown>>) => {
			const sessionId = args[0] as unknown as string;
			const outputPath = args[1] as unknown as string | undefined;
			const options = args[2] as unknown as Record<string, unknown>;
			const color = getColorAdapter();
			const loading = spinner.create('Exporting session...').start();

			try {
				const sessionStore = new SessionStore();
				const exporter = new SessionExporter(sessionStore, createArchiveAdapter());

				const exportPath = await exporter.exportSession(sessionId, {
					includeArtifacts: options['artifacts'] !== false,
					outputPath
				});

				loading.succeed(color.green(`Session exported successfully`));

				// Show export stats
				const stats = await exporter.getExportStats(exportPath);
				console.log(`
${color.bold('Export Details:')}
  Session ID:    ${color.cyan(stats.sessionId)}
  Output File:   ${color.cyan(exportPath)}
  Size:          ${color.cyan(formatBytes(stats.size))}
  Commands:      ${color.cyan(stats.commandCount.toString())}
  Artifacts:     ${color.cyan(stats.artifactCount.toString())}
  Exported At:   ${color.cyan(new Date(stats.exportedAt).toLocaleString())}

${color.gray('💡 Share this file to transfer the session to another machine')}
${color.gray('   Import with: valora session import ' + exportPath)}
`);
			} catch (error) {
				loading.fail(color.red('Failed to export session'));
				console.error(formatError(error as Error));
				process.exit(1);
			}
		});

	sessionCmd
		.command('import <zipPath> [sessionId]')
		.description('Import session from ZIP archive')
		.option('--overwrite', 'Overwrite existing session with same ID')
		.action(async (...args: Array<Record<string, unknown>>) => {
			const zipPath = args[0] as unknown as string;
			const sessionId = args[1] as unknown as string | undefined;
			const options = args[2] as unknown as Record<string, unknown>;
			const color = getColorAdapter();
			const loading = spinner.create('Importing session...').start();

			try {
				const sessionStore = new SessionStore();
				const exporter = new SessionExporter(sessionStore, createArchiveAdapter());

				// Preview import
				loading.text = 'Reading archive...';
				const stats = await exporter.getExportStats(zipPath);

				loading.text = 'Extracting and validating...';
				const session = await exporter.importSession(zipPath, {
					overwrite: (options['overwrite'] as boolean | undefined) ?? false,
					targetSessionId: sessionId
				});

				loading.succeed(color.green(`Session imported successfully`));

				console.log(`
${color.bold('Import Details:')}
  Session ID:    ${color.cyan(session.session_id)}
  Commands:      ${color.cyan(stats.commandCount.toString())}
  Artifacts:     ${color.cyan(stats.artifactCount.toString())}
  Status:        ${color.cyan(session.status)}

${color.gray('💡 View details with: valora session show ' + session.session_id)}
${color.gray('   Resume with: valora session resume ' + session.session_id)}
`);
			} catch (error) {
				loading.fail(color.red('Failed to import session'));
				console.error(formatError(error as Error));
				process.exit(1);
			}
		});

	sessionCmd
		.command('show <sessionId>')
		.description('Show session details')
		.option('--files', 'Show detailed file changes')
		.option('--context', 'Show full context details')
		.option('--no-metrics', 'Hide metrics section')
		.action(async (...args: Array<Record<string, unknown>>) => {
			const sessionId = args[0] as unknown as string;
			const options = args[1] as unknown as Record<string, unknown>;
			const color = getColorAdapter();
			try {
				const sessionStore = new SessionStore();
				const formatter = getSessionFormatter();
				const session = await sessionStore.loadSession(sessionId);

				// Load artifacts from session directory if they exist
				const sessionDir = sessionStore.getSessionsDir();
				const sessionPath = `${sessionDir}/${sessionId}`;
				try {
					const fs = await import('fs/promises');
					const stats = await fs.stat(sessionPath);
					if (stats.isDirectory()) {
						// Read artifacts from directory
						const files = await fs.readdir(sessionPath);
						const artifacts = files
							.filter((f) => f.endsWith('.md') || f.endsWith('.json'))
							.map((f) => ({
								description: f.includes('plan')
									? 'Implementation plan'
									: f.includes('test')
										? 'Test results'
										: 'Session artifact',
								name: f,
								path: `${sessionPath}/${f}`
							}));

						if (artifacts.length > 0 && !session.context) {
							session.context = {};
						}
						if (artifacts.length > 0) {
							session.context!['artifacts'] = artifacts;
						}
					}
				} catch {
					// Session directory doesn't exist or can't be read - that's okay
				}

				// Use formatter for rich display
				console.log(
					formatter.formatSessionDetails(session, {
						showContext: options['context'] !== false,
						showFiles: options['files'] !== false
					})
				);

				// Show metrics unless disabled
				if (options['metrics'] !== false) {
					console.log('\n' + formatter.formatSessionMetrics(session));
				}

				// Show additional info
				const nextActionsTitle = '💡 NEXT ACTIONS';
				const separatorWidth = Math.min(nextActionsTitle.length, 60);
				console.log(`
${color.gray('─'.repeat(separatorWidth))}

${color.bold(nextActionsTitle)}

$ valora session resume ${sessionId}       Resume this session
$ valora session export ${sessionId}       Export as ZIP archive
$ valora session archive ${sessionId}      Mark as completed
$ valora session delete ${sessionId}       Delete this session
`);
			} catch (error) {
				console.error(color.red(`Failed to show session ${sessionId}:`), formatError(error as Error));
				process.exit(1);
			}
		});
}
