/**
 * Error Scenario Tests
 *
 * Tests system robustness, error recovery, and failure handling
 * via the real utility modules (withRetry, safeAsync, CircuitBreaker).
 * All tests run against production code — no fake/stub CLIs.
 */

import { getCircuitBreaker, safeAsync, withRetry } from 'utils/error-handler';
import { describe, expect, it, vi } from 'vitest';

describe('Error Handling and Recovery Tests', () => {
	describe('Network Failure Recovery', () => {
		it('retries until success and returns the resolved value', async () => {
			let attempts = 0;
			const operation = vi.fn(async () => {
				attempts++;
				if (attempts < 3) throw new Error('Network timeout');
				return 'success';
			});

			const result = await withRetry(operation, { baseDelayMs: 10, maxRetries: 5 });

			expect(result).toBe('success');
			expect(attempts).toBe(3);
		});

		it('opens the circuit breaker after repeated failures and rejects fast', async () => {
			const breaker = getCircuitBreaker(`network-service-${Math.random()}`);

			for (let i = 0; i < 5; i++) {
				await expect(
					breaker.execute(async () => {
						throw new Error('Network error');
					})
				).rejects.toThrow();
			}

			expect(breaker.getState()).toBe('open');
			await expect(breaker.execute(async () => 'success')).rejects.toThrow();
		});
	});

	describe('Timeout Handling', () => {
		it('retries after a timeout and returns the value on second attempt', async () => {
			let attempts = 0;
			const operation = vi.fn(async () => {
				attempts++;
				if (attempts === 1) {
					await new Promise((resolve) => setTimeout(resolve, 20));
					throw new Error('Timeout');
				}
				return 'success after retry';
			});

			const result = await withRetry(operation, { baseDelayMs: 10, maxRetries: 3, timeoutMs: 200 });

			expect(result).toBe('success after retry');
			expect(attempts).toBe(2);
		});
	});

	describe('Process Crash Recovery', () => {
		it('retries after thrown errors and returns the recovered value', async () => {
			let attempts = 0;
			const operation = vi.fn(async () => {
				attempts++;
				if (attempts < 3) throw new Error('Connection refused');
				return 'recovered from crash';
			});

			const result = await withRetry(operation, { baseDelayMs: 20, maxRetries: 5 });

			expect(result).toBe('recovered from crash');
			expect(attempts).toBe(3);
		});
	});

	describe('Graceful Degradation', () => {
		it('returns the default value when the operation throws', async () => {
			const safeOperation = safeAsync(async () => {
				throw new Error('Service unavailable');
			}, 'default result');

			await expect(safeOperation).resolves.toBe('default result');
		});
	});

	describe('Recovery and Self-Healing', () => {
		it('circuit breaker closes again after a successful operation following the recovery window', async () => {
			vi.useFakeTimers();
			try {
				const { CircuitBreaker } = await import('utils/error-handler');
				const breaker = new CircuitBreaker(5, 500); // 5 failures, 500ms recovery

				for (let i = 0; i < 5; i++) {
					await expect(
						breaker.execute(async () => {
							throw new Error('Persistent failure');
						})
					).rejects.toThrow();
				}

				expect(breaker.getState()).toBe('open');

				await vi.advanceTimersByTimeAsync(600);

				const result = await breaker.execute(async () => 'success');
				expect(result).toBe('success');
				expect(breaker.getState()).toBe('closed');
			} finally {
				vi.useRealTimers();
			}
		});

		it('retries a database operation that initially fails with connection errors', async () => {
			let attempts = 0;
			const dbOperation = vi.fn(async () => {
				attempts++;
				if (attempts < 3) throw new Error('Connection refused');
				return { rows: [] };
			});

			const result = await withRetry(dbOperation, {
				baseDelayMs: 50,
				maxRetries: 5,
				retryCondition: (error) => error.message.includes('Connection refused')
			});

			expect(result.rows).toEqual([]);
			expect(attempts).toBe(3);
		});
	});
});
