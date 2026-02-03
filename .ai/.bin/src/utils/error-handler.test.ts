/**
 * Unit tests for error-handler.ts
 *
 * Tests error classification, recovery mechanisms, circuit breaker patterns,
 * and comprehensive error handling scenarios.
 */

import { getLogger } from 'output/logger';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	BaseError,
	CircuitBreaker,
	ConfigurationError,
	ErrorContext,
	ExecutionError,
	NetworkError,
	ProviderError,
	RecoveryStrategy,
	ResourceError,
	SecurityError,
	SessionError,
	TimeoutError,
	ValidationError,
	createErrorContext,
	formatError,
	getCircuitBreaker,
	isCircuitBreakerError,
	isRetriableError,
	safeAsync,
	safeSync,
	withCircuitBreaker,
	withRetry
} from './error-handler';

// Mock logger
vi.mock('output/logger', () => ({
	getLogger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warn: vi.fn()
	}))
}));

// Global mock logger for all tests
let mockLogger: any;

describe('BaseError', () => {
	beforeEach(() => {
		mockLogger = {
			debug: vi.fn(),
			error: vi.fn(),
			info: vi.fn(),
			warn: vi.fn()
		};
		vi.mocked(getLogger).mockReturnValue(mockLogger);
	});

	it('should create error with proper structure', () => {
		const message = 'Test error';
		const code = 'TEST_ERROR';
		const details = { key: 'value' };
		const context: Partial<ErrorContext> = {
			component: 'test-component',
			operation: 'test-operation',
			userId: 'user123'
		};
		const recovery: RecoveryStrategy = {
			maxRetries: 3,
			type: 'retry'
		};
		const cause = new Error('Original error');

		const error = new BaseError(message, code, details, context, recovery, cause);

		expect(error.message).toBe(message);
		expect(error.code).toBe(code);
		expect(error.name).toBe('BaseError');
		expect(error.details).toEqual(details);
		expect(error.recovery).toEqual(recovery);
		expect(error.cause).toBe(cause);
		expect(error.context.component).toBe('test-component');
		expect(error.context.operation).toBe('test-operation');
		expect(error.context.userId).toBe('user123');
		expect(error.context.timestamp).toBeInstanceOf(Date);
	});

	it('should set default context values', () => {
		const error = new BaseError('Test', 'TEST_ERROR');

		expect(error.context.component).toBe('unknown');
		expect(error.context.operation).toBe('unknown');
		expect(error.context.timestamp).toBeInstanceOf(Date);
	});

	it('should create error without automatic logging to prevent infinite loops', () => {
		const error = new BaseError('Test error', 'TEST_ERROR', { key: 'value' });

		expect(error).toBeInstanceOf(BaseError);
		expect(error.message).toBe('Test error');
		expect(error.code).toBe('TEST_ERROR');
		expect(error.details).toEqual({ key: 'value' });
		// Automatic logging is disabled to prevent infinite loops during initialization
		expect(mockLogger.error).not.toHaveBeenCalled();
	});

	it('should capture stack trace', () => {
		const error = new BaseError('Test', 'TEST_ERROR');

		expect(error.stack).toBeDefined();
		expect(error.stack).toContain('BaseError');
	});
});

describe('Specific Error Classes', () => {
	beforeEach(() => {
		mockLogger = {
			debug: vi.fn(),
			error: vi.fn(),
			info: vi.fn(),
			warn: vi.fn()
		};
		vi.mocked(getLogger).mockReturnValue(mockLogger);
	});
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('ConfigurationError should have correct code', () => {
		const error = new ConfigurationError('Config error');

		expect(error.code).toBe('CONFIGURATION_ERROR');
		expect(error.name).toBe('ConfigurationError');
	});

	it('ValidationError should have correct code', () => {
		const error = new ValidationError('Validation error');

		expect(error.code).toBe('VALIDATION_ERROR');
		expect(error.name).toBe('ValidationError');
	});

	it('ExecutionError should have correct code and recovery', () => {
		const recovery: RecoveryStrategy = { type: 'fallback' };
		const error = new ExecutionError('Execution error', undefined, undefined, recovery);

		expect(error.code).toBe('EXECUTION_ERROR');
		expect(error.name).toBe('ExecutionError');
		expect(error.recovery).toEqual(recovery);
	});

	it('ProviderError should have default retry recovery', () => {
		const error = new ProviderError('Provider error');

		expect(error.code).toBe('PROVIDER_ERROR');
		expect(error.name).toBe('ProviderError');
		expect(error.recovery).toEqual({
			backoffMs: 1000,
			maxRetries: 3,
			type: 'retry'
		});
	});

	it('SessionError should have correct code', () => {
		const error = new SessionError('Session error');

		expect(error.code).toBe('SESSION_ERROR');
		expect(error.name).toBe('SessionError');
	});

	it('SecurityError should trigger high-priority logging', () => {
		const error = new SecurityError('Security breach');

		expect(error.code).toBe('SECURITY_ERROR');
		expect(error.name).toBe('SecurityError');

		// Should log with security alert
		expect(mockLogger.error).toHaveBeenCalledWith(
			'SECURITY EVENT',
			error,
			expect.objectContaining({
				alert: true,
				security: true
			})
		);
	});

	it('NetworkError should have default retry recovery', () => {
		const error = new NetworkError('Network error');

		expect(error.code).toBe('NETWORK_ERROR');
		expect(error.recovery).toEqual({
			backoffMs: 2000,
			maxRetries: 5,
			type: 'retry'
		});
	});

	it('ResourceError should have default circuit breaker recovery', () => {
		const error = new ResourceError('Resource error');

		expect(error.code).toBe('RESOURCE_ERROR');
		expect(error.recovery).toEqual({
			timeoutMs: 30000,
			type: 'circuit-breaker'
		});
	});

	it('TimeoutError should have default retry recovery', () => {
		const error = new TimeoutError('Timeout error');

		expect(error.code).toBe('TIMEOUT_ERROR');
		expect(error.recovery).toEqual({
			backoffMs: 500,
			maxRetries: 2,
			type: 'retry'
		});
	});
});

describe('CircuitBreaker', () => {
	beforeEach(() => {
		mockLogger = {
			debug: vi.fn(),
			error: vi.fn(),
			info: vi.fn(),
			warn: vi.fn()
		};
		vi.mocked(getLogger).mockReturnValue(mockLogger);
	});
	let breaker: CircuitBreaker;

	beforeEach(() => {
		breaker = new CircuitBreaker(3, 1000); // 3 failures, 1 second timeout
	});

	it('should start in closed state', () => {
		expect(breaker.getState()).toBe('closed');
		expect(breaker.getFailureCount()).toBe(0);
	});

	it('should remain closed on success', async () => {
		await breaker.execute(async () => 'success');

		expect(breaker.getState()).toBe('closed');
		expect(breaker.getFailureCount()).toBe(0);
	});

	it('should transition to open after threshold failures', async () => {
		// Fail 3 times (threshold)
		for (let i = 0; i < 3; i++) {
			try {
				await breaker.execute(async () => {
					throw new Error('Test failure');
				});
			} catch (error) {
				// Expected
			}
		}

		expect(breaker.getState()).toBe('open');
		expect(breaker.getFailureCount()).toBe(3);
	});

	it('should throw ResourceError when open', async () => {
		// Force open state
		for (let i = 0; i < 3; i++) {
			try {
				await breaker.execute(async () => {
					throw new Error('Test failure');
				});
			} catch (error) {
				// Expected
			}
		}

		await expect(breaker.execute(async () => 'success')).rejects.toThrow(ResourceError);
	});

	it('should transition to half-open after timeout', async () => {
		// Force open state
		for (let i = 0; i < 3; i++) {
			try {
				await breaker.execute(async () => {
					throw new Error('Test failure');
				});
			} catch (error) {
				// Expected
			}
		}

		// Wait for recovery timeout
		await new Promise((resolve) => setTimeout(resolve, 1100));

		// Next call should transition to half-open
		try {
			await breaker.execute(async () => {
				throw new Error('Still failing');
			});
		} catch (error) {
			// Expected
		}

		expect(breaker.getState()).toBe('open'); // Failed in half-open, back to open
	});

	it('should reset on success after half-open', async () => {
		// Force open state
		for (let i = 0; i < 3; i++) {
			try {
				await breaker.execute(async () => {
					throw new Error('Test failure');
				});
			} catch (error) {
				// Expected
			}
		}

		// Wait for recovery and succeed
		await new Promise((resolve) => setTimeout(resolve, 1100));
		await breaker.execute(async () => 'success');

		expect(breaker.getState()).toBe('closed');
		expect(breaker.getFailureCount()).toBe(0);
	});
});

describe('withRetry', () => {
	beforeEach(() => {
		mockLogger = {
			debug: vi.fn(),
			error: vi.fn(),
			info: vi.fn(),
			warn: vi.fn()
		};
		vi.mocked(getLogger).mockReturnValue(mockLogger);
	});
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('should succeed on first attempt', async () => {
		const operation = vi.fn().mockResolvedValue('success');

		const result = await withRetry(operation, { maxRetries: 3 });

		expect(result).toBe('success');
		expect(operation).toHaveBeenCalledTimes(1);
	});

	it('should retry on failure and succeed', async () => {
		// Use real timers for this test since we need actual delays
		vi.useRealTimers();

		let callCount = 0;
		const operation = vi.fn(async () => {
			callCount++;
			if (callCount === 1) throw new Error('Connection timeout occurred');
			if (callCount === 2) throw new Error('Network error: connection refused');
			return 'success';
		});

		const result = await withRetry(operation, {
			// Only 2 retries to keep it simple
			baseDelayMs: 1,
			maxRetries: 2 // Very short delay for tests
		});

		expect(result).toBe('success');
		expect(callCount).toBe(3); // 1 initial + 2 retries
		expect(operation).toHaveBeenCalledTimes(3);

		// Restore fake timers
		vi.useFakeTimers();
	});

	it('should fail after max retries', async () => {
		// Use real timers for this test
		vi.useRealTimers();

		const operation = vi.fn().mockRejectedValue(new Error('Connection timeout'));

		await expect(
			withRetry(operation, {
				baseDelayMs: 1,
				maxRetries: 2 // Very short delay for tests
			})
		).rejects.toThrow('Connection timeout');

		expect(operation).toHaveBeenCalledTimes(3); // initial + 2 retries

		// Restore fake timers
		vi.useFakeTimers();
	});

	it('should respect exponential backoff', async () => {
		// Use real timers for this test
		vi.useRealTimers();

		const operation = vi.fn().mockRejectedValue(new Error('Connection timeout'));
		const delays: number[] = [];

		// Mock setTimeout to capture delays
		const originalSetTimeout = global.setTimeout;
		global.setTimeout = vi.fn((callback, delay) => {
			delays.push(delay as number);
			return originalSetTimeout(callback, 1); // Short delay
		}) as any;

		try {
			await expect(
				withRetry(operation, {
					// Short for tests
					backoffFactor: 2,
					baseDelayMs: 10,
					maxRetries: 2
				})
			).rejects.toThrow();
		} finally {
			global.setTimeout = originalSetTimeout;
		}

		expect(delays).toEqual([10, 20]); // 10ms, then 10*2=20ms

		// Restore fake timers
		vi.useFakeTimers();
	});

	it('should respect max delay limit', async () => {
		// Use real timers for this test
		vi.useRealTimers();

		const operation = vi.fn().mockRejectedValue(new Error('Connection timeout'));
		const delays: number[] = [];

		const originalSetTimeout = global.setTimeout;
		global.setTimeout = vi.fn((callback, delay) => {
			delays.push(delay as number);
			return originalSetTimeout(callback, 1); // Short delay
		}) as any;

		try {
			await expect(
				withRetry(operation, {
					// Short for tests
					backoffFactor: 4,
					baseDelayMs: 10,
					maxDelayMs: 50,
					maxRetries: 3 // Low cap
				})
			).rejects.toThrow();
		} finally {
			global.setTimeout = originalSetTimeout;
		}

		// Should cap at maxDelayMs: 10, 40, 50 (not 160)
		expect(delays).toEqual([10, 40, 50]);

		// Restore fake timers
		vi.useFakeTimers();
	});

	it('should use custom retry condition', async () => {
		const operation = vi.fn().mockRejectedValue(new Error('Non-retriable error'));

		await expect(
			withRetry(operation, {
				maxRetries: 2,
				retryCondition: () => false // Never retry
			})
		).rejects.toThrow('Non-retriable error');

		expect(operation).toHaveBeenCalledTimes(1); // No retries
	});
});

describe('safeAsync', () => {
	beforeEach(() => {
		mockLogger = {
			debug: vi.fn(),
			error: vi.fn(),
			info: vi.fn(),
			warn: vi.fn()
		};
		vi.mocked(getLogger).mockReturnValue(mockLogger);
	});
	it('should return result on success', async () => {
		const result = await safeAsync(async () => 'success');

		expect(result).toBe('success');
	});

	it('should return fallback on error', async () => {
		const result = await safeAsync(async () => {
			throw new Error('Test error');
		}, 'fallback');

		expect(result).toBe('fallback');
	});

	it('should return undefined when no fallback provided', async () => {
		const result = await safeAsync(async () => {
			throw new Error('Test error');
		});

		expect(result).toBeUndefined();
	});

	it('should log error with context', async () => {
		const context = { component: 'test' };

		await safeAsync(
			async () => {
				throw new Error('Test error');
			},
			undefined,
			context
		);

		expect(mockLogger.error).toHaveBeenCalledWith('Safe async operation failed', expect.any(Error), { context });
	});
});

describe('safeSync', () => {
	beforeEach(() => {
		mockLogger = {
			debug: vi.fn(),
			error: vi.fn(),
			info: vi.fn(),
			warn: vi.fn()
		};
		vi.mocked(getLogger).mockReturnValue(mockLogger);
	});
	it('should return result on success', () => {
		const result = safeSync(() => 'success');

		expect(result).toBe('success');
	});

	it('should return fallback on error', () => {
		const result = safeSync(() => {
			throw new Error('Test error');
		}, 'fallback');

		expect(result).toBe('fallback');
	});

	it('should log error with context', () => {
		const context = { component: 'test' };

		safeSync(
			() => {
				throw new Error('Test error');
			},
			undefined,
			context
		);

		expect(mockLogger.error).toHaveBeenCalledWith('Safe sync operation failed', expect.any(Error), { context });
	});
});

describe('createErrorContext', () => {
	it('should create error context with required fields', () => {
		const context = createErrorContext('test-component', 'test-operation');

		expect(context.component).toBe('test-component');
		expect(context.operation).toBe('test-operation');
		expect(context.timestamp).toBeInstanceOf(Date);
	});

	it('should include additional context', () => {
		const context = createErrorContext('test-component', 'test-operation', {
			sessionId: 'session456',
			userId: 'user123'
		});

		expect(context.userId).toBe('user123');
		expect(context.sessionId).toBe('session456');
	});
});

describe('formatError', () => {
	it('should format BaseError with full context', () => {
		const error = new BaseError(
			'Test error',
			'TEST_ERROR',
			{ key: 'value' },
			{
				component: 'test-component',
				operation: 'test-operation',
				userId: 'user123'
			},
			{ maxRetries: 3, type: 'retry' }
		);

		const formatted = formatError(error);

		expect(formatted).toContain('BaseError: Test error');
		expect(formatted).toContain('Component: test-component');
		expect(formatted).toContain('Operation: test-operation');
		expect(formatted).toContain('Timestamp:');
		expect(formatted).toContain('"key": "value"');
		expect(formatted).toContain('Recovery: retry');
	});

	it('should format regular Error', () => {
		const error = new Error('Regular error');

		const formatted = formatError(error);

		expect(formatted).toBe('Error: Regular error');
	});
});

describe('isRetriableError', () => {
	it('should return true for BaseError with retry recovery', () => {
		const error = new BaseError('Test', 'TEST_ERROR', undefined, undefined, { type: 'retry' });

		expect(isRetriableError(error)).toBe(true);
	});

	it('should return false for BaseError with non-retry recovery', () => {
		const error = new BaseError('Test', 'TEST_ERROR', undefined, undefined, { type: 'circuit-breaker' });

		expect(isRetriableError(error)).toBe(false);
	});

	it('should identify retriable error messages', () => {
		const retriableErrors = [
			new Error('Connection timeout'),
			new Error('ETIMEDOUT occurred'),
			new Error('ECONNRESET happened'),
			new Error('Rate limit exceeded'),
			new Error('Service unavailable'),
			new Error('Network error: connection refused')
		];

		retriableErrors.forEach((error) => {
			expect(isRetriableError(error)).toBe(true);
		});
	});

	it('should return false for non-retriable errors', () => {
		const nonRetriableErrors = [
			new Error('Invalid input'),
			new Error('Authentication failed'),
			new Error('Permission denied')
		];

		nonRetriableErrors.forEach((error) => {
			expect(isRetriableError(error)).toBe(false);
		});
	});
});

describe('isCircuitBreakerError', () => {
	it('should return true for BaseError with circuit-breaker recovery', () => {
		const error = new BaseError('Test', 'TEST_ERROR', undefined, undefined, { type: 'circuit-breaker' });

		expect(isCircuitBreakerError(error)).toBe(true);
	});

	it('should identify circuit breaker error messages', () => {
		const circuitBreakerErrors = [
			new Error('Service unavailable'),
			new Error('Connection refused'),
			new Error('ECONNREFUSED'),
			new Error('Rate limit exceeded')
		];

		circuitBreakerErrors.forEach((error) => {
			expect(isCircuitBreakerError(error)).toBe(true);
		});
	});
});

describe('Circuit Breaker Management', () => {
	beforeEach(() => {
		// Clear circuit breaker cache between tests
		vi.resetModules();
	});

	it('should return same instance for same service name', () => {
		const breaker1 = getCircuitBreaker('test-service');
		const breaker2 = getCircuitBreaker('test-service');

		expect(breaker1).toBe(breaker2);
	});

	it('should return different instances for different services', () => {
		const breaker1 = getCircuitBreaker('service1');
		const breaker2 = getCircuitBreaker('service2');

		expect(breaker1).not.toBe(breaker2);
	});

	it('withCircuitBreaker should use circuit breaker protection', async () => {
		const operation = vi.fn().mockResolvedValue('success');

		const result = await withCircuitBreaker('test-service', operation);

		expect(result).toBe('success');
		expect(operation).toHaveBeenCalledTimes(1);
	});

	it('withCircuitBreaker should propagate errors', async () => {
		const operation = vi.fn().mockRejectedValue(new Error('Test error'));

		await expect(withCircuitBreaker('test-service', operation)).rejects.toThrow('Test error');
	});
});
