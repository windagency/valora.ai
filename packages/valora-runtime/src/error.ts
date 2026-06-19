/**
 * Minimal error types shared across Valora packages.
 *
 * Structural mirror of the host's `BaseError`/`ProviderError`. The host's
 * versions have richer recovery/context handling; this module exposes just
 * enough for plugin packages to throw structured errors without dragging
 * in the host's error-handler module (which transitively pulls in logger).
 */

export interface ErrorContext {
	component: string;
	operation: string;
	timestamp: Date;
}

export interface RecoveryStrategy {
	backoffMs?: number;
	maxRetries?: number;
	type: 'fail-fast' | 'graceful-degradation' | 'manual' | 'retry';
}

export class BaseError extends Error {
	readonly code: string;
	readonly context: ErrorContext;
	readonly details: Record<string, unknown>;
	readonly recovery: RecoveryStrategy;

	constructor(
		message: string,
		code: string,
		details: Record<string, unknown> = {},
		context: Partial<ErrorContext> = {},
		recovery: RecoveryStrategy = { type: 'manual' }
	) {
		super(message);
		this.name = this.constructor.name;
		this.code = code;
		this.details = details;
		this.context = {
			component: context.component ?? 'unknown',
			operation: context.operation ?? 'unknown',
			timestamp: context.timestamp ?? new Date()
		};
		this.recovery = recovery;
	}
}

export class ProviderError extends BaseError {
	constructor(
		message: string,
		details: Record<string, unknown> = {},
		context: Partial<ErrorContext> = {},
		recovery: RecoveryStrategy = { backoffMs: 1000, maxRetries: 3, type: 'retry' }
	) {
		super(message, 'PROVIDER_ERROR', details, context, recovery);
	}
}
