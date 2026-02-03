/**
 * Session store - file-based persistence
 */

import type { Session, SessionCommand, SessionSummary } from 'types/session.types';

import { getSessionCleanupScheduler } from 'cleanup/coordinator';
import { SESSION_CLEANUP_DAYS } from 'config/constants';
import { getLogger } from 'output/logger';
import * as path from 'path';
import { decryptSessionData, encryptSessionData } from 'utils/encryption';
import { SessionError } from 'utils/error-handler';
import { ensureDir, listFiles, readJSON, resolveAIPath, writeFile } from 'utils/file-utils';
import { generateSessionId } from 'utils/id-generator';

import type { SessionCleanupScheduler } from './cleanup-scheduler';

/**
 * Session Snapshot - lightweight version of session for fast resume
 * Contains only essential data needed to quickly restore session state
 */
export interface SessionSnapshot {
	created_at: string;
	last_command?: string;
	session_id: string;
	status: Session['status'];
	total_tokens_used?: number;
	updated_at: string;
	/** Last N commands for quick context */
	recent_commands: SessionCommand[];
	/** Essential context keys for optimization */
	essential_context: {
		_loaderCache?: unknown;
		_stageOutputs?: unknown;
	};
	/** Snapshot metadata */
	full_command_count: number;
	snapshot_version: number;
}

/** Number of recent commands to include in snapshot */
const SNAPSHOT_RECENT_COMMANDS = 3;
/** Current snapshot format version */
const SNAPSHOT_VERSION = 1;

/**
 * Session Store - File-based session persistence with automatic cleanup
 *
 * IMPORTANT: Background cleanup is managed by the unified cleanup coordinator.
 * The coordinator initializes both log and session cleanup schedulers together.
 * The scheduler will:
 * - Run every N hours (configured in config.json: cleanup_interval_hours)
 * - Compress sessions older than compress_after_days
 * - Delete sessions older than max_age_days
 * - Enforce max_count and max_size_mb limits
 *
 * To disable automatic cleanup:
 * - Set NODE_ENV=test or AI_TEST_MODE=true environment variables
 * - Set sessions.enabled=false in config.json
 * - MCP mode automatically disables cleanup
 *
 * See: .ai/.bin/docs/SESSION-RETENTION.md for full documentation
 * See: cleanup/coordinator.ts for unified scheduler initialization
 */
export class SessionStore {
	private initialized = false;
	private sessionsDir: string;

	constructor(sessionsDir?: string) {
		this.sessionsDir = sessionsDir ?? resolveAIPath('sessions');
		// Defer initialization to prevent multiple concurrent calls
		this.deferInitialize();
	}

	/**
	 * Defer initialization to prevent race conditions
	 */
	private deferInitialize(): void {
		if (this.initialized) return;

		// Use nextTick to ensure environment variables are set
		process.nextTick(() => {
			void this.initialize();
		});
	}

	/**
	 * Initialize session store
	 *
	 * Note: Cleanup scheduler is initialized separately via cleanup/coordinator.ts
	 */
	private initialize(): void {
		if (this.initialized) return;
		this.initialized = true;

		// Note: Cleanup schedulers are now initialized via unified coordinator
		// See: cleanup/coordinator.ts and cli/index.ts for initialization
		// This prevents circular dependencies and provides centralized management
		// of both log and session cleanup schedulers
	}

	/**
	 * Create a new session
	 */
	async createSession(sessionId?: string): Promise<Session> {
		await ensureDir(this.sessionsDir);

		const session: Session = {
			commands: [],
			context: {},
			created_at: new Date().toISOString(),
			session_id: sessionId ?? generateSessionId(),
			status: 'active',
			updated_at: new Date().toISOString()
		};

		await this.saveSession(session);
		return session;
	}

	/**
	 * Load a session by ID
	 */
	async loadSession(sessionId: string): Promise<Session> {
		const filePath = this.getSessionPath(sessionId);
		const logger = getLogger();

		try {
			const encryptedSession = await readJSON<Session>(filePath);

			// Decrypt sensitive data in the session
			const decryptedSession = decryptSessionData(encryptedSession);

			// Create new session with required fields with defaults (immutable pattern)
			const sessionWithDefaults: Session = {
				...decryptedSession,
				commands: decryptedSession.commands ?? [],
				context: decryptedSession.context ?? {},
				created_at: decryptedSession.created_at ?? new Date().toISOString(),
				session_id: decryptedSession.session_id ?? sessionId,
				status: decryptedSession.status ?? 'active',
				updated_at: decryptedSession.updated_at ?? new Date().toISOString()
			};

			logger.debug(`Session loaded and decrypted: ${sessionId}`, {
				commandCount: sessionWithDefaults.commands.length,
				hasContext: !!sessionWithDefaults.context,
				sessionId
			});

			return sessionWithDefaults;
		} catch (error) {
			// Use debug level for FileNotFoundError (expected during cleanup/listing)
			// Use error level for other errors (decryption, parse errors, etc.)
			const isFileNotFound = error instanceof Error && error.message.includes('File not found');

			if (isFileNotFound) {
				logger.debug(`Session file not found: ${sessionId}`, {
					sessionId
				});
			} else {
				logger.error(`Failed to load/decrypt session: ${sessionId}`, error as Error, {
					sessionId
				});
			}

			throw new SessionError(`Failed to load session: ${sessionId}`, {
				error: (error as Error).message,
				sessionId
			});
		}
	}

	/**
	 * Save a session
	 */
	async saveSession(session: Session): Promise<void> {
		await ensureDir(this.sessionsDir);
		const logger = getLogger();

		const filePath = this.getSessionPath(session.session_id);

		// Create updated session with new timestamp (immutable pattern)
		const sessionToSave: Session = {
			...session,
			updated_at: new Date().toISOString()
		};

		try {
			// Encrypt sensitive data before saving
			const encryptedSession = encryptSessionData(sessionToSave);

			await writeFile(filePath, JSON.stringify(encryptedSession, null, 2));

			// Also save a lightweight snapshot for fast resume
			await this.saveSnapshot(sessionToSave);

			logger.debug(`Session saved with encryption: ${sessionToSave.session_id}`, {
				commandCount: sessionToSave.commands.length,
				hasContext: !!sessionToSave.context,
				sessionId: sessionToSave.session_id
			});
		} catch (error) {
			const isPermissionError =
				(error as NodeJS.ErrnoException)?.code === 'EPERM' || (error as NodeJS.ErrnoException)?.code === 'EACCES';
			const isSandboxed = process.env['AI_MCP_ENABLED'] === 'true' || process.env['NODE_ENV'] === 'test';

			if (isPermissionError && isSandboxed) {
				// In sandboxed environments, continue without saving to disk
				logger.debug(`Session save skipped in sandboxed environment: ${session.session_id}`, {
					commandCount: session.commands.length,
					hasContext: !!session.context,
					sessionId: session.session_id
				});
				return; // Don't throw error, continue operating
			}

			logger.error(`Failed to encrypt/save session: ${session.session_id}`, error as Error, {
				sessionId: session.session_id
			});
			throw new SessionError(`Failed to save session: ${session.session_id}`, {
				error: (error as Error).message,
				sessionId: session.session_id
			});
		}
	}

	/**
	 * Delete a session
	 */
	async deleteSession(sessionId: string): Promise<void> {
		const filePath = this.getSessionPath(sessionId);

		try {
			const fs = await import('fs/promises');
			await fs.unlink(filePath);

			// Also delete the snapshot if it exists
			await this.deleteSnapshot(sessionId);
		} catch (error) {
			throw new SessionError(`Failed to delete session: ${sessionId}`, {
				error: (error as Error).message,
				sessionId
			});
		}
	}

	/**
	 * List all sessions
	 */
	async listSessions(): Promise<SessionSummary[]> {
		await ensureDir(this.sessionsDir);

		try {
			const allFiles = await listFiles(this.sessionsDir, '.json');
			// Filter out snapshot files - only process main session files
			const files = allFiles.filter((f) => !f.endsWith('.snapshot.json'));

			// Process all session files in parallel
			const summaries = (
				await Promise.allSettled(
					files.map(async (file) => {
						const session = await this.loadSession(file.replace('.json', ''));

						// Calculate file size
						const filePath = this.getSessionPath(session.session_id);
						let sizeBytes = 0;
						try {
							const fs = await import('fs/promises');
							const stats = await fs.stat(filePath);
							sizeBytes = stats.size;
						} catch {
							// Ignore size calculation errors
						}

						return {
							command_count: session.commands.length,
							context_window: session.context_window,
							created_at: session.created_at,
							current_command: session.current_command,
							last_active: session.updated_at,
							last_command: session.last_command,
							session_id: session.session_id,
							size_bytes: sizeBytes,
							status: session.status,
							total_tokens_used: session.total_tokens_used,
							updated_at: session.updated_at
						};
					})
				)
			).flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));

			// Sort by updated_at (most recent first)
			return summaries.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
		} catch (error) {
			throw new SessionError('Failed to list sessions', {
				error: (error as Error).message
			});
		}
	}

	/**
	 * Check if a session exists
	 */
	async sessionExists(sessionId: string): Promise<boolean> {
		const filePath = this.getSessionPath(sessionId);
		const fs = await import('fs/promises');

		try {
			await fs.access(filePath);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Get the most recent session
	 */
	async getRecentSession(): Promise<null | Session> {
		const summaries = await this.listSessions();

		const mostRecent = summaries[0];
		if (!mostRecent) {
			return null;
		}

		return this.loadSession(mostRecent.session_id);
	}

	/**
	 * Archive old sessions
	 */
	async archiveSessions(beforeDate: Date): Promise<number> {
		const sessions = await this.listSessions();

		// Filter sessions to archive
		const sessionsToArchive = sessions.filter((summary) => new Date(summary.updated_at) < beforeDate);

		// Archive all sessions in parallel
		await Promise.all(
			sessionsToArchive.map(async (summary) => {
				const session = await this.loadSession(summary.session_id);
				session.status = 'completed';
				await this.saveSession(session);
			})
		);

		return sessionsToArchive.length;
	}

	/**
	 * Clean up completed sessions older than specified days
	 */
	async cleanupOldSessions(daysOld = SESSION_CLEANUP_DAYS): Promise<number> {
		const sessions = await this.listSessions();
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - daysOld);

		// Filter sessions to delete with chained filters
		const sessionsToDelete = sessions
			.filter((summary) => summary.status === 'completed')
			.filter((summary) => new Date(summary.updated_at) < cutoffDate);

		// Delete all sessions in parallel
		await Promise.all(sessionsToDelete.map((summary) => this.deleteSession(summary.session_id)));

		return sessionsToDelete.length;
	}

	/**
	 * Get session file path
	 */
	private getSessionPath(sessionId: string): string {
		return path.join(this.sessionsDir, `${sessionId}.json`);
	}

	/**
	 * Get snapshot file path
	 */
	private getSnapshotPath(sessionId: string): string {
		return path.join(this.sessionsDir, `${sessionId}.snapshot.json`);
	}

	/**
	 * Get sessions directory
	 */
	getSessionsDir(): string {
		return this.sessionsDir;
	}

	/**
	 * Get the session cleanup scheduler instance
	 * Note: Scheduler is now initialized via cleanup/coordinator.ts
	 */
	getCleanupScheduler(): null | SessionCleanupScheduler {
		// Import and delegate to coordinator
		return getSessionCleanupScheduler();
	}

	/**
	 * Create a snapshot from a full session
	 * Snapshots contain lightweight data for fast resume
	 */
	private createSnapshot(session: Session): SessionSnapshot {
		// Get the last N commands
		const recentCommands = session.commands.slice(-SNAPSHOT_RECENT_COMMANDS);

		// Extract essential context keys
		const essentialContext: SessionSnapshot['essential_context'] = {};
		if (session.context['_loaderCache']) {
			essentialContext._loaderCache = session.context['_loaderCache'];
		}
		if (session.context['_stageOutputs']) {
			essentialContext._stageOutputs = session.context['_stageOutputs'];
		}

		return {
			created_at: session.created_at,
			essential_context: essentialContext,
			full_command_count: session.commands.length,
			last_command: session.last_command,
			recent_commands: recentCommands,
			session_id: session.session_id,
			snapshot_version: SNAPSHOT_VERSION,
			status: session.status,
			total_tokens_used: session.total_tokens_used,
			updated_at: session.updated_at
		};
	}

	/**
	 * Save a session snapshot for fast resume
	 */
	async saveSnapshot(session: Session): Promise<void> {
		const logger = getLogger();
		const snapshotPath = this.getSnapshotPath(session.session_id);

		try {
			const snapshot = this.createSnapshot(session);
			await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2));

			logger.debug(`Session snapshot saved: ${session.session_id}`, {
				commandCount: snapshot.full_command_count,
				recentCommands: snapshot.recent_commands.length,
				sessionId: session.session_id
			});
		} catch (error) {
			// Snapshot save failure is non-critical, log but don't throw
			logger.debug(`Failed to save session snapshot: ${session.session_id}`, {
				error: (error as Error).message,
				sessionId: session.session_id
			});
		}
	}

	/**
	 * Load a session snapshot (fast resume)
	 * Returns null if snapshot doesn't exist or is invalid
	 */
	async loadSnapshot(sessionId: string): Promise<null | SessionSnapshot> {
		const logger = getLogger();
		const snapshotPath = this.getSnapshotPath(sessionId);

		try {
			const data = await readJSON<Record<string, unknown>>(snapshotPath);
			const snapshot = data as unknown as SessionSnapshot;

			// Validate snapshot version
			if (snapshot.snapshot_version !== SNAPSHOT_VERSION) {
				logger.debug(`Snapshot version mismatch, ignoring: ${sessionId}`, {
					expected: SNAPSHOT_VERSION,
					found: snapshot.snapshot_version
				});
				return null;
			}

			logger.debug(`Session snapshot loaded: ${sessionId}`, {
				commandCount: snapshot.full_command_count,
				recentCommands: snapshot.recent_commands.length,
				sessionId
			});

			return snapshot;
		} catch {
			// Snapshot not found or invalid - not an error, just fall back to full load
			return null;
		}
	}

	/**
	 * Check if a snapshot is sufficient for the current operation
	 * Snapshots are sufficient for quick context access, but not for full history
	 */
	isSnapshotSufficient(snapshot: SessionSnapshot, needsFullHistory: boolean): boolean {
		if (needsFullHistory) {
			return false;
		}
		// Snapshot is sufficient if it's recent (within 5 minutes)
		const snapshotAge = Date.now() - new Date(snapshot.updated_at).getTime();
		const MAX_SNAPSHOT_AGE_MS = 5 * 60 * 1000; // 5 minutes
		return snapshotAge < MAX_SNAPSHOT_AGE_MS;
	}

	/**
	 * Delete a session snapshot
	 */
	async deleteSnapshot(sessionId: string): Promise<void> {
		const snapshotPath = this.getSnapshotPath(sessionId);

		try {
			const fs = await import('fs/promises');
			await fs.unlink(snapshotPath);
		} catch {
			// Ignore errors when deleting snapshot (may not exist)
		}
	}
}
