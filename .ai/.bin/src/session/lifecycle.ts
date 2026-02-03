/**
 * Session lifecycle management
 */

import type { SessionCreateOptions, SessionResumeOptions, SessionSummary } from 'types/session.types';

import {
	SESSION_ARCHIVE_DAYS,
	SESSION_CLEANUP_DAYS,
	SESSION_PERSIST_DEBOUNCE_MS,
	SESSION_PERSIST_EXTENDED_DEBOUNCE_MS,
	SESSION_RAPID_COMMAND_THRESHOLD_MS
} from 'config/constants';
import { getLogger } from 'output/logger';
import { SessionError } from 'utils/error-handler';

import type { SessionStore } from './store';

import { SessionContextManager } from './context';

// Debounce configuration (imported from constants)
const DEBOUNCE_DELAY_MS = SESSION_PERSIST_DEBOUNCE_MS;
const EXTENDED_DEBOUNCE_DELAY_MS = SESSION_PERSIST_EXTENDED_DEBOUNCE_MS;
const RAPID_COMMAND_THRESHOLD_MS = SESSION_RAPID_COMMAND_THRESHOLD_MS;

export class SessionLifecycle {
	private currentSession: null | SessionContextManager = null;
	private lastPersistSessionId: null | string = null;
	private lastPersistTime: number = 0;
	private persistTimer: NodeJS.Timeout | null = null;
	private store: SessionStore;

	constructor(store: SessionStore) {
		this.store = store;
	}

	/**
	 * Determine if we should use extended debounce for rapid same-session commands
	 */
	private shouldUseExtendedDebounce(): boolean {
		if (!this.currentSession) {
			return false;
		}

		const currentSessionId = this.currentSession.getSession().session_id;
		const now = Date.now();
		const timeSinceLastPersist = now - this.lastPersistTime;

		// Use extended debounce if:
		// 1. Same session as last persist
		// 2. Last persist was within the rapid command threshold window
		return this.lastPersistSessionId === currentSessionId && timeSinceLastPersist < RAPID_COMMAND_THRESHOLD_MS;
	}

	/**
	 * Create a new session
	 */
	async create(options: SessionCreateOptions = {}): Promise<SessionContextManager> {
		const logger = getLogger();
		logger.debug('Creating new session', {
			hasCustomId: !!options.sessionId,
			hasInitialContext: !!options.initialContext
		});

		const session = await this.store.createSession(options.sessionId);

		if (options.initialContext) {
			session.context = options.initialContext;
		}

		await this.store.saveSession(session);

		this.currentSession = new SessionContextManager(session);
		logger.info('Session created', {
			sessionId: session.session_id,
			status: session.status
		});

		return this.currentSession;
	}

	/**
	 * Resume an existing session
	 * Attempts to load snapshot first for essential context, then loads full session
	 */
	async resume(options: SessionResumeOptions): Promise<SessionContextManager> {
		const logger = getLogger();
		const startTime = Date.now();
		logger.debug('Resuming session', {
			resetContext: !!options.resetContext,
			sessionId: options.sessionId
		});

		const exists = await this.store.sessionExists(options.sessionId);
		if (!exists) {
			logger.warn('Session not found, cannot resume', { sessionId: options.sessionId });
			throw new SessionError(`Session not found: ${options.sessionId}`, {
				sessionId: options.sessionId
			});
		}

		// Try to load snapshot first for essential context (faster)
		const snapshot = await this.store.loadSnapshot(options.sessionId);
		if (snapshot) {
			const snapshotLoadTime = Date.now() - startTime;
			logger.debug('Loaded session snapshot for fast resume', {
				loadTimeMs: snapshotLoadTime,
				recentCommands: snapshot.recent_commands.length,
				sessionId: options.sessionId
			});
		}

		const session = await this.store.loadSession(options.sessionId);
		const fullLoadTime = Date.now() - startTime;
		logger.debug('Full session loaded', {
			commandCount: session.commands.length,
			loadTimeMs: fullLoadTime,
			sessionId: options.sessionId
		});

		if (options.resetContext) {
			session.context = {};
		}

		// Update status to active
		session.status = 'active';
		await this.store.saveSession(session);

		this.currentSession = new SessionContextManager(session);
		logger.info('Session resumed', {
			commandCount: session.commands.length,
			previousStatus: session.status,
			sessionId: session.session_id
		});

		return this.currentSession;
	}

	/**
	 * Get or create session
	 */
	async getOrCreate(sessionId?: string): Promise<SessionContextManager> {
		if (sessionId) {
			const exists = await this.store.sessionExists(sessionId);
			if (exists) {
				return this.resume({ sessionId });
			}
		}

		return this.create({ sessionId });
	}

	/**
	 * Persist current session with debouncing for performance
	 * @param immediate - If true, persist immediately; if false, debounce the persistence (fire-and-forget)
	 */
	persist(immediate?: false): void;
	persist(immediate: true): Promise<void>;
	persist(immediate = false): Promise<void> | void {
		if (immediate) {
			return this.persistImmediate();
		}

		// Debounce: persist after inactivity delay (fire-and-forget)
		if (this.persistTimer) {
			clearTimeout(this.persistTimer);
		}

		// Use extended debounce for rapid same-session commands to reduce I/O
		const debounceDelay = this.shouldUseExtendedDebounce() ? EXTENDED_DEBOUNCE_DELAY_MS : DEBOUNCE_DELAY_MS;

		const logger = getLogger();
		if (debounceDelay === EXTENDED_DEBOUNCE_DELAY_MS) {
			logger.debug('Using extended debounce for rapid same-session persistence', {
				debounceMs: debounceDelay,
				sessionId: this.currentSession?.getSession().session_id
			});
		}

		this.persistTimer = setTimeout(() => {
			void (async () => {
				try {
					// If there is no current session (e.g., it was completed/failed and cleared),
					// we should check before attempting to persist.
					if (this.currentSession) {
						await this.persistImmediate();
					}
				} catch (error) {
					const persistLogger = getLogger();
					persistLogger.error('Failed to persist session during debounce', error as Error);
				}
			})();
		}, debounceDelay);
	}

	/**
	 * Persist current session immediately (no debouncing)
	 */
	private async persistImmediate(): Promise<void> {
		if (!this.currentSession) {
			throw new SessionError('No active session to persist');
		}

		const session = this.currentSession.getSession();
		await this.store.saveSession(session);

		// Track persist time and session for adaptive debouncing
		this.lastPersistTime = Date.now();
		this.lastPersistSessionId = session.session_id;

		const logger = getLogger();
		logger.debug('Session persisted', {
			commandCount: session.commands.length,
			sessionId: session.session_id,
			status: session.status
		});
	}

	/**
	 * Complete current session
	 */
	async complete(): Promise<void> {
		if (!this.currentSession) {
			throw new SessionError('No active session to complete');
		}

		this.currentSession.setStatus('completed');
		// Critical: persist immediately on session completion
		await this.persist(true);

		const session = this.currentSession.getSession();
		const logger = getLogger();
		logger.info('Session completed successfully', {
			commandCount: session.commands.length,
			duration: Date.now() - new Date(session.created_at).getTime(),
			sessionId: session.session_id
		});

		this.currentSession = null;
	}

	/**
	 * Fail current session
	 */
	async fail(error?: string): Promise<void> {
		if (!this.currentSession) {
			throw new SessionError('No active session to fail');
		}

		this.currentSession.setStatus('failed');
		if (error) {
			this.currentSession.updateContext('error', error);
		}
		// Critical: persist immediately on session failure
		await this.persist(true);

		const session = this.currentSession.getSession();
		const logger = getLogger();
		logger.error('Session failed', error ? new Error(error) : new Error('Session failed'), {
			commandCount: session.commands.length,
			duration: Date.now() - new Date(session.created_at).getTime(),
			sessionId: session.session_id
		});

		this.currentSession = null;
	}

	/**
	 * Pause current session
	 */
	async pause(): Promise<void> {
		if (!this.currentSession) {
			throw new SessionError('No active session to pause');
		}

		this.currentSession.setStatus('paused');
		// Critical: persist immediately on session pause
		await this.persist(true);

		const session = this.currentSession.getSession();
		const logger = getLogger();
		logger.info('Session paused', {
			commandCount: session.commands.length,
			sessionId: session.session_id
		});
	}

	/**
	 * Get current session
	 */
	getCurrentSession(): null | SessionContextManager {
		return this.currentSession;
	}

	/**
	 * Has active session
	 */
	hasActiveSession(): boolean {
		return this.currentSession !== null;
	}

	/**
	 * Get recent session or create new one
	 */
	async getRecentOrCreate(): Promise<SessionContextManager> {
		const logger = getLogger();
		const recentSession = await this.store.getRecentSession();

		if (recentSession?.status === 'active') {
			logger.debug('Reusing recent active session', { sessionId: recentSession.session_id });
			this.currentSession = new SessionContextManager(recentSession);
			return this.currentSession;
		}

		logger.debug('No recent active session found, creating new session');
		return this.create();
	}

	/**
	 * List all sessions
	 */
	async listSessions(): Promise<SessionSummary[]> {
		return this.store.listSessions();
	}

	/**
	 * Archive old sessions
	 */
	async archiveOldSessions(daysOld = SESSION_ARCHIVE_DAYS): Promise<number> {
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - daysOld);

		return this.store.archiveSessions(cutoffDate);
	}

	/**
	 * Cleanup old sessions
	 */
	async cleanupOldSessions(daysOld = SESSION_CLEANUP_DAYS): Promise<number> {
		return this.store.cleanupOldSessions(daysOld);
	}

	/**
	 * Delete a session
	 */
	async deleteSession(sessionId: string): Promise<void> {
		return this.store.deleteSession(sessionId);
	}

	/**
	 * Flush any pending debounced persistence
	 * Should be called before destroying the SessionLifecycle instance
	 */
	async flushPendingPersistence(): Promise<void> {
		if (this.persistTimer) {
			clearTimeout(this.persistTimer);
			this.persistTimer = null;

			// Persist immediately if there's an active session
			if (this.currentSession) {
				try {
					await this.persistImmediate();
				} catch (error) {
					const logger = getLogger();
					logger.error('Failed to flush pending session persistence', error as Error);
				}
			}
		}
	}
}
