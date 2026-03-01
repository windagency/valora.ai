/**
 * Enhanced Error Handling System
 *
 * Provides comprehensive error classification, recovery mechanisms,
 * and standardized error handling patterns.
 */

import { getLogger } from 'output/logger';

export interface ErrorContext {
	component: string;
	duration?: number;
	metadata?: Record<string, unknown>;
	operation: string;
	requestId?: string;
	retryCount?: number;
	sessionId?: string;
	timestamp: Date;
	userId?: string;
}

export interface RecoveryStrategy {
	backoffMs?: number;
	fallbackValue?: unknown;
	maxRetries?: number;
	timeoutMs?: number;
	type: 'circuit-breaker' | 'degradation' | 'fallback' | 'retry';
}

export class BaseError extends Error {
	public override readonly cause?: Error;
	public readonly context: ErrorContext;
	public readonly details?: Record<string, unknown>;
	public readonly docsLink?: string;
	public readonly fixSuggestions?: string[];
	public readonly recovery?: RecoveryStrategy;
	public readonly userMessage?: string;

	constructor(
		message: string,
		public readonly code: string,
		details?: Record<string, unknown>,
		context?: Partial<ErrorContext>,
		recovery?: RecoveryStrategy,
		cause?: Error,
		userMessage?: string,
		fixSuggestions?: string[],
		docsLink?: string
	) {
		super(message);
		this.name = this.constructor.name;
		this.details = details;
		this.context = {
			component: 'unknown',
			operation: 'unknown',
			timestamp: new Date(),
			...context
		};
		this.recovery = recovery;
		this.cause = cause;
		this.userMessage = userMessage;
		this.fixSuggestions = fixSuggestions;
		this.docsLink = docsLink;

		// Capture stack trace
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, this.constructor);
		}

		// Skip automatic logging in BaseError constructor to prevent infinite loops
		// during early initialization. Errors should be logged explicitly where needed.
	}
}

export class ConfigurationError extends BaseError {
	constructor(
		message: string,
		details?: Record<string, unknown>,
		context?: Partial<ErrorContext>,
		userMessage?: string,
		fixSuggestions?: string[],
		docsLink?: string
	) {
		super(
			message,
			'CONFIGURATION_ERROR',
			details,
			context,
			undefined,
			undefined,
			userMessage,
			fixSuggestions,
			docsLink
		);
	}
}

export class ExecutionError extends BaseError {
	constructor(
		message: string,
		details?: Record<string, unknown>,
		context?: Partial<ErrorContext>,
		recovery?: RecoveryStrategy,
		userMessage?: string,
		fixSuggestions?: string[],
		docsLink?: string
	) {
		super(message, 'EXECUTION_ERROR', details, context, recovery, undefined, userMessage, fixSuggestions, docsLink);
	}
}

export class NetworkError extends BaseError {
	constructor(
		message: string,
		details?: Record<string, unknown>,
		context?: Partial<ErrorContext>,
		recovery?: RecoveryStrategy,
		userMessage?: string,
		fixSuggestions?: string[],
		docsLink?: string
	) {
		const defaultRecovery: RecoveryStrategy = {
			backoffMs: 2000,
			maxRetries: 5,
			type: 'retry'
		};
		super(
			message,
			'NETWORK_ERROR',
			details,
			context,
			recovery ?? defaultRecovery,
			undefined,
			userMessage,
			fixSuggestions,
			docsLink
		);
	}
}

export class ProviderError extends BaseError {
	constructor(
		message: string,
		details?: Record<string, unknown>,
		context?: Partial<ErrorContext>,
		recovery?: RecoveryStrategy,
		userMessage?: string,
		fixSuggestions?: string[],
		docsLink?: string
	) {
		const defaultRecovery: RecoveryStrategy = {
			backoffMs: 1000,
			maxRetries: 3,
			type: 'retry'
		};
		super(
			message,
			'PROVIDER_ERROR',
			details,
			context,
			recovery ?? defaultRecovery,
			undefined,
			userMessage,
			fixSuggestions,
			docsLink
		);
	}
}

export class ResourceError extends BaseError {
	constructor(
		message: string,
		details?: Record<string, unknown>,
		context?: Partial<ErrorContext>,
		recovery?: RecoveryStrategy,
		userMessage?: string,
		fixSuggestions?: string[],
		docsLink?: string
	) {
		const defaultRecovery: RecoveryStrategy = {
			timeoutMs: 30000,
			type: 'circuit-breaker'
		};
		super(
			message,
			'RESOURCE_ERROR',
			details,
			context,
			recovery ?? defaultRecovery,
			undefined,
			userMessage,
			fixSuggestions,
			docsLink
		);
	}
}

export class SecurityError extends BaseError {
	constructor(
		message: string,
		details?: Record<string, unknown>,
		context?: Partial<ErrorContext>,
		userMessage?: string,
		fixSuggestions?: string[],
		docsLink?: string
	) {
		super(message, 'SECURITY_ERROR', details, context, undefined, undefined, userMessage, fixSuggestions, docsLink);
		// Security errors should be logged with high priority
		const logger = getLogger();
		logger.error('SECURITY EVENT', this, {
			alert: true,
			security: true
		});
	}
}

export class SessionError extends BaseError {
	constructor(
		message: string,
		details?: Record<string, unknown>,
		context?: Partial<ErrorContext>,
		userMessage?: string,
		fixSuggestions?: string[],
		docsLink?: string
	) {
		super(message, 'SESSION_ERROR', details, context, undefined, undefined, userMessage, fixSuggestions, docsLink);
	}
}

export class TimeoutError extends BaseError {
	constructor(
		message: string,
		details?: Record<string, unknown>,
		context?: Partial<ErrorContext>,
		recovery?: RecoveryStrategy,
		userMessage?: string,
		fixSuggestions?: string[],
		docsLink?: string
	) {
		const defaultRecovery: RecoveryStrategy = {
			backoffMs: 500,
			maxRetries: 2,
			type: 'retry'
		};
		super(
			message,
			'TIMEOUT_ERROR',
			details,
			context,
			recovery ?? defaultRecovery,
			undefined,
			userMessage,
			fixSuggestions,
			docsLink
		);
	}
}

export class ValidationError extends BaseError {
	constructor(
		message: string,
		details?: Record<string, unknown>,
		context?: Partial<ErrorContext>,
		userMessage?: string,
		fixSuggestions?: string[],
		docsLink?: string
	) {
		super(message, 'VALIDATION_ERROR', details, context, undefined, undefined, userMessage, fixSuggestions, docsLink);
	}
}

/**
 * Circuit Breaker State
 */
export type CircuitState = 'closed' | 'half-open' | 'open';

/**
 * Circuit Breaker for external service calls
 */
export class CircuitBreaker {
	private failureCount = 0;
	private nextAttemptTime = 0;
	private state: CircuitState = 'closed';

	constructor(
		private readonly failureThreshold: number = 5,
		private readonly recoveryTimeoutMs: number = 60000 // 1 minute
	) {}

	/**
	 * Execute operation with circuit breaker protection
	 */
	async execute<T>(operation: () => Promise<T>, context?: Partial<ErrorContext>): Promise<T> {
		if (this.state === 'open') {
			if (Date.now() < this.nextAttemptTime) {
				throw new ResourceError(
					'Circuit breaker is OPEN - service temporarily unavailable',
					{ nextAttempt: new Date(this.nextAttemptTime), state: this.state },
					context
				);
			}
			this.state = 'half-open';
		}

		try {
			const result = await operation();
			this.onSuccess();
			return result;
		} catch (error) {
			this.onFailure();
			throw error;
		}
	}

	getFailureCount(): number {
		return this.failureCount;
	}

	getState(): CircuitState {
		return this.state;
	}

	private onFailure(): void {
		if (this.state === 'half-open') {
			// In half-open state, any failure immediately returns to open
			this.state = 'open';
			this.nextAttemptTime = Date.now() + this.recoveryTimeoutMs;
			return;
		}

		this.failureCount++;

		if (this.failureCount >= this.failureThreshold) {
			this.state = 'open';
			this.nextAttemptTime = Date.now() + this.recoveryTimeoutMs;
		}
	}

	private onSuccess(): void {
		this.failureCount = 0;
		this.state = 'closed';
	}
}

/**
 * Retry utility with exponential backoff
 */
export async function withRetry<T>(
	operation: () => Promise<T>,
	options: {
		backoffFactor?: number;
		baseDelayMs?: number;
		context?: Partial<ErrorContext>;
		maxDelayMs?: number;
		maxRetries?: number;
		retryCondition?: (error: Error) => boolean;
	}
): Promise<T> {
	const {
		backoffFactor = 2,
		baseDelayMs = 1000,
		context,
		maxDelayMs = 30000,
		maxRetries = 3,
		retryCondition = isRetriableError
	} = options;

	const attempts = Array.from({ length: maxRetries + 1 }, (_, i) => i);
	let lastError: Error | undefined;

	for (const attempt of attempts) {
		try {
			return await operation();
		} catch (error) {
			lastError = error as Error;

			// Don't retry if this is the last attempt or error is not retriable
			if (attempt === maxRetries || !retryCondition(lastError)) {
				throw lastError;
			}

			// Calculate delay with exponential backoff
			const delay = Math.min(baseDelayMs * Math.pow(backoffFactor, attempt), maxDelayMs);

			const logger = getLogger();
			logger.warn(`Operation failed, retrying in ${delay}ms`, {
				attempt: attempt + 1,
				context,
				error: lastError.message,
				maxRetries
			});

			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}

	throw lastError!;
}

/**
 * Safe async operation wrapper
 */
export async function safeAsync<T>(
	operation: () => Promise<T>,
	fallback?: T,
	context?: Partial<ErrorContext>
): Promise<T | undefined> {
	try {
		return await operation();
	} catch (error) {
		const logger = getLogger();
		logger.error('Safe async operation failed', error as Error, { context });
		return fallback;
	}
}

/**
 * Safe synchronous operation wrapper
 */
export function safeSync<T>(operation: () => T, fallback?: T, context?: Partial<ErrorContext>): T | undefined {
	try {
		return operation();
	} catch (error) {
		const logger = getLogger();
		logger.error('Safe sync operation failed', error as Error, { context });
		return fallback;
	}
}

/**
 * Create error context helper
 */
export function createErrorContext(
	component: string,
	operation: string,
	additionalContext?: Record<string, unknown>
): Partial<ErrorContext> {
	return {
		component,
		operation,
		timestamp: new Date(),
		...additionalContext
	};
}

/**
 * Format error for display with enhanced context
 */
export function formatError(error: Error): string {
	if (error instanceof BaseError) {
		const parts = [`${error.name}: ${error.message}`];

		if (error.context) {
			parts.push(`Component: ${error.context.component}`);
			parts.push(`Operation: ${error.context.operation}`);
			parts.push(`Timestamp: ${error.context.timestamp.toISOString()}`);
		}

		if ((error as BaseError).details) {
			parts.push(`Details: ${JSON.stringify((error as BaseError).details, null, 2)}`);
		}

		if ((error as BaseError).recovery) {
			parts.push(`Recovery: ${(error as BaseError).recovery!.type}`);
		}

		return parts.join('\n');
	}
	return `${error.name}: ${error.message}`;
}

// Re-export formatErrorMessage from error-utils for backward compatibility
export { formatErrorMessage } from './error-utils';

/**
 * Check if error is retriable (enhanced version)
 */
export function isRetriableError(error: Error): boolean {
	// Check for BaseError with recovery strategy
	if (error instanceof BaseError && error.recovery) {
		return error.recovery.type === 'retry';
	}

	// Check error message patterns
	const retriableMessages = [
		'timeout',
		'ETIMEDOUT',
		'ECONNRESET',
		'ENOTFOUND',
		'rate limit',
		'too many requests',
		'service unavailable',
		'temporary failure',
		'network error',
		'connection refused'
	];

	return retriableMessages.some((msg) => error.message.toLowerCase().includes(msg.toLowerCase()));
}

/**
 * Check if error should trigger circuit breaker
 */
export function isCircuitBreakerError(error: Error): boolean {
	if (error instanceof BaseError && error.recovery) {
		return error.recovery.type === 'circuit-breaker';
	}

	const circuitBreakerMessages = [
		'service unavailable',
		'connection refused',
		'ECONNREFUSED',
		'ENOTFOUND',
		'timeout',
		'ETIMEDOUT',
		'rate limit exceeded'
	];

	return circuitBreakerMessages.some((msg) => error.message.toLowerCase().includes(msg.toLowerCase()));
}

// Global circuit breaker instances for different services
const circuitBreakers = new Map<string, CircuitBreaker>();

/**
 * Get or create circuit breaker for a service
 */
export function getCircuitBreaker(serviceName: string): CircuitBreaker {
	if (!circuitBreakers.has(serviceName)) {
		circuitBreakers.set(serviceName, new CircuitBreaker());
	}
	return circuitBreakers.get(serviceName)!;
}

/**
 * Execute operation with circuit breaker protection
 */
export async function withCircuitBreaker<T>(
	serviceName: string,
	operation: () => Promise<T>,
	context?: Partial<ErrorContext>
): Promise<T> {
	const breaker = getCircuitBreaker(serviceName);
	return breaker.execute(operation, context);
}
