/**
 * Session context manager
 */

import type { OptimizationMetrics, QualityMetrics, Session, SessionCommand, SessionContext } from 'types/session.types';

import { SessionError } from 'utils/error-handler';

export class SessionContextManager {
	private session: Session;

	constructor(session: Session) {
		this.session = session;
	}

	/**
	 * Add a command to session history
	 */
	addCommand(
		command: string,
		args: string[],
		flags: Record<string, boolean | string | undefined>,
		outputs: Record<string, unknown>,
		success: boolean,
		durationMs: number,
		error?: string,
		tokensUsed?: number,
		optimizationMetrics?: OptimizationMetrics,
		qualityMetrics?: QualityMetrics
	): void {
		const sessionCommand: SessionCommand = {
			args,
			command,
			duration_ms: durationMs,
			error,
			flags,
			optimization_metrics: optimizationMetrics,
			outputs,
			quality_metrics: qualityMetrics,
			success,
			timestamp: new Date().toISOString(),
			tokens_used: tokensUsed
		};

		this.session.commands.push(sessionCommand);
		this.session.last_command = command;
		// Clear current_command since the command has completed
		this.session.current_command = undefined;
	}

	/**
	 * Set the currently running command
	 */
	setCurrentCommand(command: string): void {
		this.session.current_command = command;
		this.session.updated_at = new Date().toISOString();
	}

	/**
	 * Clear the currently running command
	 */
	clearCurrentCommand(): void {
		this.session.current_command = undefined;
	}

	/**
	 * Update session context
	 */
	updateContext(key: string, value: unknown): void {
		const keys = key.split('.');
		const lastKey = keys[keys.length - 1];

		if (!lastKey) {
			throw new SessionError('Invalid context key: key cannot be empty', { key });
		}

		// Navigate to the parent object
		const parentObj = keys.slice(0, -1).reduce(
			(obj: Record<string, unknown>, k: string) => {
				if (!obj[k] || typeof obj[k] !== 'object') {
					obj[k] = {};
				}
				return obj[k] as Record<string, unknown>;
			},
			this.session.context as Record<string, unknown>
		);

		// Set the value on the final key
		parentObj[lastKey] = value;
	}

	/**
	 * Get context value
	 */
	getContext(key: string): unknown {
		const keys = key.split('.');

		return keys.reduce((value: unknown, k: string) => {
			if (value && typeof value === 'object' && k in value) {
				return (value as Record<string, unknown>)[k];
			}
			return undefined;
		}, this.session.context);
	}

	/**
	 * Get all context
	 */
	getAllContext(): SessionContext {
		return { ...this.session.context };
	}

	/**
	 * Merge context
	 */
	mergeContext(context: SessionContext): void {
		this.session.context = SessionContextManager.deepMerge(
			this.session.context as Record<string, unknown>,
			context as Record<string, unknown>
		);
	}

	/**
	 * Clear specific context key
	 */
	clearContext(key: string): void {
		const keys = key.split('.');
		const lastKey = keys[keys.length - 1];
		if (!lastKey) return;

		if (keys.length === 1) {
			delete this.session.context[key];
			return;
		}

		const parent = keys.slice(0, -1).reduce((obj: unknown, k: string) => {
			if (obj && typeof obj === 'object') return (obj as Record<string, unknown>)[k];
			return undefined;
		}, this.session.context);

		if (parent && typeof parent === 'object') {
			delete (parent as Record<string, unknown>)[lastKey];
		}
	}

	/**
	 * Clear all context
	 */
	clearAllContext(): void {
		this.session.context = {};
	}

	/**
	 * Get last command
	 */
	getLastCommand(): null | SessionCommand {
		if (this.session.commands.length === 0) {
			return null;
		}
		return this.session.commands[this.session.commands.length - 1] ?? null;
	}

	/**
	 * Get command history
	 */
	getCommandHistory(): SessionCommand[] {
		return [...this.session.commands];
	}

	/**
	 * Get commands by name
	 */
	getCommandsByName(commandName: string): SessionCommand[] {
		return this.session.commands.filter((cmd) => cmd.command === commandName);
	}

	/**
	 * Get successful commands
	 */
	getSuccessfulCommands(): SessionCommand[] {
		return this.session.commands.filter((cmd) => cmd.success);
	}

	/**
	 * Get failed commands
	 */
	getFailedCommands(): SessionCommand[] {
		return this.session.commands.filter((cmd) => !cmd.success);
	}

	/**
	 * Get session statistics
	 */
	getStatistics(): {
		average_duration_ms: number;
		failed_commands: number;
		successful_commands: number;
		total_commands: number;
		total_duration_ms: number;
	} {
		const commands = this.session.commands;
		const successful = commands.filter((cmd) => cmd.success);
		const failed = commands.filter((cmd) => !cmd.success);
		const totalDuration = commands.reduce((sum, cmd) => sum + cmd.duration_ms, 0);

		return {
			average_duration_ms: commands.length > 0 ? totalDuration / commands.length : 0,
			failed_commands: failed.length,
			successful_commands: successful.length,
			total_commands: commands.length,
			total_duration_ms: totalDuration
		};
	}

	/**
	 * Update session status
	 */
	setStatus(status: 'active' | 'completed' | 'failed' | 'paused'): void {
		this.session.status = status;
	}

	/**
	 * Get session status
	 */
	getStatus(): 'active' | 'completed' | 'failed' | 'paused' {
		return this.session.status;
	}

	/**
	 * Get session
	 */
	getSession(): Session {
		return this.session;
	}

	/**
	 * Check if context has key
	 */
	hasContext(key: string): boolean {
		return this.getContext(key) !== undefined;
	}

	/**
	 * Get context keys
	 */
	getContextKeys(): string[] {
		return Object.keys(this.session.context);
	}

	/**
	 * Validate context has required keys
	 */
	validateContext(requiredKeys: string[]): void {
		const missing = requiredKeys.filter((key) => !this.hasContext(key));
		if (missing.length > 0) {
			throw new SessionError('Missing required context keys', {
				available: this.getContextKeys(),
				missing
			});
		}
	}

	/**
	 * Get filtered context containing only specified keys
	 * Useful for reducing token usage by only passing context that's actually referenced
	 */
	private static buildNestedFromPath(path: string, value: unknown): Record<string, unknown> {
		const keys = path.split('.').reverse();
		return keys.reduce((acc, k) => ({ [k]: acc }), value as Record<string, unknown>);
	}

	private static deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
		const result = { ...target };
		for (const [key, value] of Object.entries(source)) {
			const existing = result[key];
			if (
				value !== null &&
				typeof value === 'object' &&
				!Array.isArray(value) &&
				existing !== null &&
				typeof existing === 'object' &&
				!Array.isArray(existing)
			) {
				result[key] = SessionContextManager.deepMerge(
					existing as Record<string, unknown>,
					value as Record<string, unknown>
				);
			} else {
				result[key] = value;
			}
		}
		return result;
	}

	getFilteredContext(keys: string[]): SessionContext {
		if (keys.length === 0) {
			return {};
		}

		let filtered: Record<string, unknown> = {};
		for (const key of keys) {
			const value = this.getContext(key);
			if (value !== undefined) {
				const nested = SessionContextManager.buildNestedFromPath(key, value);
				filtered = SessionContextManager.deepMerge(filtered, nested);
			}
		}

		return filtered as SessionContext;
	}

	/**
	 * Extract $CONTEXT_* variable references from a value (string, object, or array)
	 * Returns a set of context keys that are referenced
	 */
	static extractContextReferences(value: unknown): Set<string> {
		const references = new Set<string>();
		const variablePattern = /\$CONTEXT_([a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*)/g;

		const extract = (val: unknown): void => {
			if (typeof val === 'string') {
				let match;
				while ((match = variablePattern.exec(val)) !== null) {
					if (match[1]) {
						references.add(match[1]);
					}
				}
				// Reset lastIndex since we're reusing the regex
				variablePattern.lastIndex = 0;
			} else if (Array.isArray(val)) {
				val.forEach(extract);
			} else if (typeof val === 'object' && val !== null) {
				Object.values(val).forEach(extract);
			}
		};

		extract(value);
		return references;
	}
}
