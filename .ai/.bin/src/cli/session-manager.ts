/**
 * CLI Session Manager - Handles session lifecycle and management for CLI commands
 */

import type { SessionContextManager } from 'session/context';
import type { SessionLifecycle } from 'session/lifecycle';
import type { ContextWindowUsage } from 'types/session.types';

import { getModelContextWindow } from 'config/providers.config';
import { getLogger } from 'output/logger';

import type { CommandExecutionOptions } from './command-executor';

/**
 * Result of session acquisition with resume status
 */
export interface SessionAcquisitionResult {
	/** Whether the session was resumed from an existing session */
	isResumed: boolean;
	/** The session context manager */
	sessionManager: SessionContextManager;
}

export class CLISessionManager {
	/** Track whether last session was resumed */
	private lastSessionResumed = false;

	constructor(private sessionLifecycle: SessionLifecycle) {}

	/**
	 * Get or create appropriate session for command execution
	 * Returns both the session manager and whether it was resumed
	 */
	async getOrCreateSession(options: CommandExecutionOptions): Promise<SessionContextManager> {
		const result = await this.getOrCreateSessionWithStatus(options);
		return result.sessionManager;
	}

	/**
	 * Get or create session with detailed status about whether it was resumed
	 */
	async getOrCreateSessionWithStatus(options: CommandExecutionOptions): Promise<SessionAcquisitionResult> {
		const logger = getLogger();

		if (options.sessionId) {
			// Try to resume specific session, create if it doesn't exist
			logger.debug(`Resuming or creating session: ${options.sessionId}`);
			try {
				const sessionManager = await this.sessionLifecycle.resume({ sessionId: options.sessionId });
				this.lastSessionResumed = true;
				return { isResumed: true, sessionManager };
			} catch (error) {
				if (error instanceof Error && error.message.includes('Session not found')) {
					logger.debug(`Session ${options.sessionId} not found, creating new session`);
					const sessionManager = await this.sessionLifecycle.create({ sessionId: options.sessionId });
					this.lastSessionResumed = false;
					return { isResumed: false, sessionManager };
				}
				throw error;
			}
		}

		if (options.flags['session_mode']) {
			// Get recent session or create new one
			logger.debug('Using recent session or creating new session');
			const sessionManager = await this.sessionLifecycle.getRecentOrCreate();
			// Check if we actually resumed (session has commands)
			const isResumed = sessionManager.getSession().commands.length > 0;
			this.lastSessionResumed = isResumed;
			return { isResumed, sessionManager };
		}

		// Create new session
		logger.debug('Creating new session');
		const sessionManager = await this.sessionLifecycle.create();
		this.lastSessionResumed = false;
		return { isResumed: false, sessionManager };
	}

	/**
	 * Check if the last session was resumed (vs newly created)
	 */
	wasLastSessionResumed(): boolean {
		return this.lastSessionResumed;
	}

	/**
	 * Add token usage to session and return total session tokens
	 */
	addTokenUsage(tokensUsed: number): number {
		const sessionManager = this.sessionLifecycle.getCurrentSession();
		if (!sessionManager) {
			return 0; // No active session
		}

		const session = sessionManager.getSession();
		const currentTotal = session.total_tokens_used ?? 0;
		const newTotal = currentTotal + tokensUsed;

		// Update session metadata
		session.total_tokens_used = newTotal;
		session.updated_at = new Date().toISOString();

		return newTotal;
	}

	/**
	 * Get current session token total
	 */
	getTotalSessionTokens(): number {
		const sessionManager = this.sessionLifecycle.getCurrentSession();
		if (!sessionManager) {
			return 0; // No active session
		}

		const session = sessionManager.getSession();
		return session.total_tokens_used ?? 0;
	}

	/**
	 * Update context window usage for the session
	 * @param model The model being used
	 * @param promptTokens Tokens used in the prompt/context
	 */
	updateContextWindowUsage(model: string, promptTokens: number): ContextWindowUsage | null {
		const sessionManager = this.sessionLifecycle.getCurrentSession();
		if (!sessionManager) {
			return null; // No active session
		}

		const session = sessionManager.getSession();
		const contextWindowSize = getModelContextWindow(model);

		// Calculate utilization
		const utilizationPercent = Math.min(100, (promptTokens / contextWindowSize) * 100);

		const usage: ContextWindowUsage = {
			context_window_size: contextWindowSize,
			model,
			tokens_used: promptTokens,
			utilization_percent: Math.round(utilizationPercent * 10) / 10 // Round to 1 decimal
		};

		// Update session metadata
		session.context_window = usage;
		session.updated_at = new Date().toISOString();

		return usage;
	}

	/**
	 * Get current context window usage
	 */
	getContextWindowUsage(): ContextWindowUsage | null {
		const sessionManager = this.sessionLifecycle.getCurrentSession();
		if (!sessionManager) {
			return null;
		}

		return sessionManager.getSession().context_window ?? null;
	}

	/**
	 * Persist session after command execution
	 */
	async persistSession(result: { success: boolean }): Promise<void> {
		if (result.success) {
			// Persist session asynchronously (fire-and-forget for performance)
			this.sessionLifecycle.persist();
		} else {
			// For failed commands, persist immediately to capture error state
			await this.sessionLifecycle.persist(true);
		}
	}

	/**
	 * Check if there's an active session
	 */
	hasActiveSession(): boolean {
		return this.sessionLifecycle.hasActiveSession();
	}

	/**
	 * Complete the active session
	 */
	async completeSession(): Promise<void> {
		await this.sessionLifecycle.complete();
	}
}
