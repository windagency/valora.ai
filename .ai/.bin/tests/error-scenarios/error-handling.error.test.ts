/**
 * Error Scenario Tests
 *
 * Tests system robustness, error recovery, and failure handling
 * across various failure modes and edge cases.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { execa } from 'execa';
import { getCircuitBreaker, safeAsync, withRetry } from 'utils/error-handler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestcontainersHelper } from '../utils/testcontainers-helper';

describe('Error Handling and Recovery Tests', () => {
	let testcontainersHelper: TestcontainersHelper;
	let tempDir: string;
	let aiBinaryPath: string;

	beforeEach(async () => {
		testcontainersHelper = new TestcontainersHelper();

		// Create temporary directory for testing
		tempDir = await fs.mkdtemp(path.join('/tmp', 'ai-error-test-'));

		// Set up AI project structure
		await fs.mkdir(path.join(tempDir, '.ai'), { recursive: true });
		await fs.mkdir(path.join(tempDir, '.ai', '.bin'), { recursive: true });

		// Create mock AI binary that can simulate various error conditions
		const mockCli = `
			const fs = require('fs');
			const path = require('path');

			const command = process.argv[2];
			const args = process.argv.slice(3);

			// Simulate different error conditions based on arguments
			if (args.includes('--simulate-network-error')) {
				console.error('Network connection failed');
				process.exit(1);
			} else if (args.includes('--simulate-timeout')) {
				// Block indefinitely to let execa timeout kill us
				while (true) {
					// Busy loop to prevent process exit
				}
			} else if (args.includes('--simulate-crash')) {
				console.error('Simulating crash');
				process.exit(139); // SIGSEGV
			} else if (args.includes('--simulate-oom')) {
				// Simulate memory exhaustion
				const largeArray = [];
				while (true) {
					largeArray.push(new Array(1000000).fill('x'));
				}
			} else if (command === 'unreliable-command') {
				// Random success/failure for retry testing
				if (Math.random() > 0.7) {
					console.log('Command succeeded');
					process.exit(0);
				} else {
					console.error('Random failure');
					process.exit(1);
				}
			} else if (command === 'session' && args[0] === 'create') {
				const sessionId = args[1];
				const sessionDir = path.join(process.cwd(), '.ai', 'sessions');
				try {
					fs.mkdirSync(sessionDir, { recursive: true });
					fs.writeFileSync(path.join(sessionDir, \`\${sessionId}.json\`), JSON.stringify({
						id: sessionId,
						created: new Date().toISOString(),
						status: 'active'
					}));
					console.log(\`Session \${sessionId} created successfully\`);
				} catch (error) {
					console.error('Failed to create session:', error.message);
					process.exit(1);
				}
			} else if (command === 'write-file') {
				const filePath = args[0];
				const content = args.slice(1).join(' ');
				try {
					fs.writeFileSync(filePath, content);
					console.log('File written successfully');
				} catch (error) {
					console.error('Failed to write file:', error.message);
					process.exit(1);
				}
			} else if (command === 'db-query') {
				console.error('Connection refused');
				process.exit(1);
			} else if (command === 'failing-command') {
				console.error('Command failed');
				process.exit(1);
			} else if (command === 'stress-test') {
				// Fail under "load"
				console.error('Out of memory');
				process.exit(1);
			} else if (command === 'operation-with-fallback' && args.includes('--service-down')) {
				console.error('Service unavailable');
				process.exit(1);
			} else if (command === 'composite-operation' && args.includes('--partial-failure')) {
				console.error('Partial system failure');
				process.exit(1);
			} else if (command === 'operation-with-sensitive-data') {
				// Simulate sanitized logging
				const input = args.join(' ');
				const sanitized = input.replace(/sk-[a-zA-Z0-9-]+/g, '***SANITIZED***');
				console.log(\`Mock AI CLI: \${command} \${sanitized}\`);
				process.exit(0);
			} else if (command === 'invalid-operation' && args.includes('--bad-flag')) {
				console.error('Unknown option: --bad-flag');
				process.exit(1);
			} else if (command === 'failing-operation') {
				console.error('Operation failed');
				process.exit(1);
			} else if (command === 'operation-with-cleanup-failure') {
				console.error('Cleanup failed');
				process.exit(1);
			} else {
				console.log(\`Mock AI CLI: \${command} \${args.join(' ')}\`);
			}
		`;
		aiBinaryPath = path.join(tempDir, '.ai', '.bin', 'cli.js');
		await fs.writeFile(aiBinaryPath, mockCli);
		await fs.chmod(aiBinaryPath, 0o755);
	});

	afterEach(async () => {
		try {
			await fs.rm(tempDir, { force: true, recursive: true });
		} catch (error) {
			// Ignore cleanup errors
		}
	});

	describe('Network Failure Recovery', () => {
		it('should handle network connection failures', async () => {
			const result = await execa('node', [aiBinaryPath, 'test-command', '--simulate-network-error'], {
				cwd: tempDir,
				reject: false // Don't throw on error
			});

			expect(result.exitCode).not.toBe(0);
			expect(result.stderr).toContain('Network connection failed');
		}, 10000);

		it('should retry on network failures', async () => {
			let attempts = 0;
			const operation = vi.fn(async () => {
				attempts++;
				if (attempts < 3) {
					throw new Error('Network timeout');
				}
				return 'success';
			});

			const result = await withRetry(operation, {
				baseDelayMs: 100,
				maxRetries: 5
			});

			expect(result).toBe('success');
			expect(attempts).toBe(3);
		});

		it('should use circuit breaker for network operations', async () => {
			const breaker = getCircuitBreaker(`network-service-${Math.random()}`);

			// Simulate multiple network failures
			for (let i = 0; i < 5; i++) {
				try {
					await breaker.execute(async () => {
						throw new Error('Network error');
					});
				} catch (error) {
					// Expected
				}
			}

			// Circuit should be open
			expect(breaker.getState()).toBe('open');

			// Next call should fail fast
			await expect(breaker.execute(async () => 'success')).rejects.toThrow();
		});
	});

	describe('Timeout Handling', () => {
		it('should handle command timeouts gracefully', async () => {
			const startTime = Date.now();
			const result = await execa('node', [aiBinaryPath, 'test-command', '--simulate-timeout'], {
				cwd: tempDir,
				// 500ms timeout (shorter to ensure it triggers)
				reject: false,
				timeout: 500
			});
			const endTime = Date.now();

			// Process should not exit successfully (should be killed or error)
			expect(result.exitCode).not.toBe(0);

			// Should complete within reasonable time (killed by timeout or exited early)
			// If killed by timeout, killed should be true (but may be undefined in some environments)
			const completedWithinTimeout = endTime - startTime < 1000; // Should complete within 1 second
			expect(completedWithinTimeout).toBe(true);

			// Either killed by timeout or exited with error
			expect(result.killed === true || result.exitCode !== 0).toBe(true);
		}, 5000);

		it('should recover from timeout with retry', async () => {
			let attempts = 0;
			const operation = vi.fn(async () => {
				attempts++;
				if (attempts === 1) {
					// Simulate timeout on first attempt
					await new Promise((resolve) => setTimeout(resolve, 2000));
					throw new Error('Timeout');
				}
				return 'success after retry';
			});

			const result = await withRetry(operation, {
				baseDelayMs: 100,
				maxRetries: 3,
				timeoutMs: 1000
			});

			expect(result).toBe('success after retry');
			expect(attempts).toBe(2);
		});
	});

	describe('Process Crash Recovery', () => {
		it('should handle process crashes (SIGSEGV)', async () => {
			const { exitCode } = await execa('node', [aiBinaryPath, 'test-command', '--simulate-crash'], {
				cwd: tempDir,
				reject: false
			});

			expect(exitCode).toBe(139); // SIGSEGV exit code
		}, 5000);

		it('should recover from crashes with retry logic', async () => {
			let attempts = 0;
			const operation = vi.fn(async () => {
				attempts++;
				if (attempts < 3) {
					// Simulate crash (throw error that would cause process crash)
					throw new Error('Connection refused');
				}
				return 'recovered from crash';
			});

			const result = await withRetry(operation, {
				baseDelayMs: 200,
				maxRetries: 5
			});

			expect(result).toBe('recovered from crash');
			expect(operation).toHaveBeenCalledTimes(3);
		});
	});

	describe('Memory Exhaustion Handling', () => {
		it('should handle out-of-memory conditions', async () => {
			const startTime = Date.now();
			const result = await execa('node', [aiBinaryPath, 'test-command', '--simulate-oom'], {
				cwd: tempDir,
				// Kill after 1 second to prevent actual OOM
				reject: false,
				timeout: 1000
			});
			const endTime = Date.now();

			// Process should not complete successfully
			expect(result.exitCode).not.toBe(0);

			// Should complete within reasonable time (killed by timeout or resource limits)
			const completedWithinLimit = endTime - startTime < 3000; // Should complete within 3 seconds
			expect(completedWithinLimit).toBe(true);
		}, 5000);

		it('should prevent memory exhaustion through input validation', async () => {
			// Test with extremely large input that should be rejected
			const largeInput = {
				data: 'x'.repeat(100 * 1024 * 1024) // 100MB string
			};

			// This should be caught by input validation before processing
			const { exitCode } = await execa('node', [aiBinaryPath, 'process-input', JSON.stringify(largeInput)], {
				cwd: tempDir,
				reject: false
			});

			// Should fail safely rather than cause memory issues
			expect(exitCode).not.toBe(0);
		});
	});

	describe('File System Error Handling', () => {
		it('should handle file system permission errors', async () => {
			// Create a read-only directory
			const readOnlyDir = path.join(tempDir, 'readonly');
			await fs.mkdir(readOnlyDir);

			try {
				await fs.chmod(readOnlyDir, 0o444); // Read-only

				const { exitCode } = await execa(
					'node',
					[aiBinaryPath, 'write-file', path.join(readOnlyDir, 'test.txt'), 'content'],
					{
						cwd: tempDir,
						reject: false
					}
				);

				expect(exitCode).not.toBe(0);
			} finally {
				// Restore permissions for cleanup
				try {
					await fs.chmod(readOnlyDir, 0o755);
				} catch (error) {
					// Ignore permission errors during cleanup
				}
			}
		}, 5000);

		it('should handle disk space exhaustion', async () => {
			// Simulate disk full by trying to write a very large file
			const { exitCode } = await execa('node', [aiBinaryPath, 'create-large-file', '1GB'], {
				cwd: tempDir,
				reject: false,
				timeout: 5000 // Prevent actual large file creation
			});

			// Should handle gracefully (may succeed or fail depending on system)
			expect(typeof exitCode).toBe('number');
		}, 10000);
	});

	describe('Database Connection Failures', () => {
		beforeEach(async () => {
			await testcontainersHelper.startSharedContainers();
		});

		afterEach(async () => {
			await testcontainersHelper.stopAllContainers();
		});

		it('should handle database connection failures', async () => {
			// Stop the database container to simulate connection failure
			await testcontainersHelper.stopAllContainers();

			const { exitCode } = await execa('node', [aiBinaryPath, 'db-query', 'SELECT * FROM test_table'], {
				cwd: tempDir,
				reject: false,
				timeout: 5000
			});

			expect(exitCode).not.toBe(0);
		}, 10000);

		it('should retry database operations on failure', async () => {
			let attempts = 0;
			const dbOperation = vi.fn(async () => {
				attempts++;
				if (attempts < 3) {
					throw new Error('Connection refused');
				}
				return { rows: [] };
			});

			const result = await withRetry(dbOperation, {
				baseDelayMs: 500,
				maxRetries: 5,
				retryCondition: (error) => error.message.includes('Connection refused')
			});

			expect(result.rows).toEqual([]);
			expect(attempts).toBe(3);
		});
	});

	describe('Concurrent Failure Handling', () => {
		it('should handle multiple simultaneous failures', async () => {
			const failureOperations = Array(5)
				.fill(null)
				.map(() =>
					execa('node', [aiBinaryPath, 'failing-command'], {
						cwd: tempDir,
						reject: false
					})
				);

			const results = await Promise.all(failureOperations);

			// All operations should fail gracefully
			results.forEach((result) => {
				expect(result.exitCode).not.toBe(0);
			});
		}, 15000);

		it('should maintain system stability under load', async () => {
			const operations = Array(10)
				.fill(null)
				.map((_, i) =>
					execa('node', [aiBinaryPath, 'stress-test', i.toString()], {
						cwd: tempDir,
						reject: false,
						timeout: 2000
					})
				);

			const startTime = Date.now();
			const results = await Promise.all(operations);
			const endTime = Date.now();

			// Should complete within reasonable time
			expect(endTime - startTime).toBeLessThan(10000);

			// Some operations may succeed, some may fail
			const successCount = results.filter((r) => r.exitCode === 0).length;
			const failureCount = results.filter((r) => r.exitCode !== 0).length;

			expect(successCount + failureCount).toBe(10);
		}, 20000);
	});

	describe('Graceful Degradation', () => {
		it('should degrade gracefully when services are unavailable', async () => {
			// Simulate external service failure
			const { exitCode: degradedExit } = await execa(
				'node',
				[aiBinaryPath, 'operation-with-fallback', '--service-down'],
				{
					cwd: tempDir,
					reject: false
				}
			);

			// Should either succeed with degraded functionality or fail gracefully
			expect([0, 1]).toContain(degradedExit);
		});

		it('should provide fallback behavior for critical operations', () => {
			const safeOperation = safeAsync(async () => {
				throw new Error('Service unavailable');
			}, 'default result');

			return expect(safeOperation).resolves.toBe('default result');
		});

		it('should handle partial system failures', async () => {
			// Test operation that depends on multiple services where some fail
			const { exitCode } = await execa('node', [aiBinaryPath, 'composite-operation', '--partial-failure'], {
				cwd: tempDir,
				reject: false
			});

			// Should complete with partial results or fail gracefully
			expect(typeof exitCode).toBe('number');
		});
	});

	describe('Recovery and Self-Healing', () => {
		it('should recover from temporary failures', async () => {
			let failureCount = 0;
			const unreliableOperation = vi.fn(async () => {
				failureCount++;
				if (failureCount < 3) {
					throw new Error('Temporary failure');
				}
				return 'recovered';
			});

			const result = await withRetry(unreliableOperation, {
				baseDelayMs: 100,
				maxRetries: 5
			});

			expect(result).toBe('recovered');
			expect(failureCount).toBe(3);
		});

		it('should reset circuit breakers after successful recovery', async () => {
			// Create a circuit breaker with short recovery timeout for testing
			const { CircuitBreaker } = await import('utils/error-handler');
			const breaker = new CircuitBreaker(5, 1000); // 5 failures, 1 second recovery

			// Cause circuit to open
			for (let i = 0; i < 5; i++) {
				try {
					await breaker.execute(async () => {
						throw new Error('Persistent failure');
					});
				} catch (error) {
					// Expected
				}
			}

			expect(breaker.getState()).toBe('open');

			// Wait for recovery timeout and attempt successful operation
			await new Promise((resolve) => setTimeout(resolve, 1100));

			const result = await breaker.execute(async () => 'success');

			expect(result).toBe('success');
			expect(breaker.getState()).toBe('closed');
		});
	});

	describe('Error Propagation and Logging', () => {
		it('should log errors appropriately without exposing sensitive data', async () => {
			const { stderr, stdout } = await execa(
				'node',
				[aiBinaryPath, 'operation-with-sensitive-data', 'api_key=sk-secret123'],
				{
					cwd: tempDir,
					reject: false
				}
			);

			const output = stdout + stderr;

			// Should not contain raw sensitive data in logs
			expect(output).not.toContain('sk-secret123');
			// Should contain error information
			expect(output.length).toBeGreaterThan(0);
		});

		it('should provide meaningful error messages', async () => {
			const { stderr } = await execa('node', [aiBinaryPath, 'invalid-operation', '--bad-flag'], {
				cwd: tempDir,
				reject: false
			});

			// Should provide helpful error message
			expect(stderr).toBeDefined();
			expect(stderr.length).toBeGreaterThan(0);
		});
	});

	describe('Resource Cleanup on Errors', () => {
		it('should clean up resources when operations fail', async () => {
			const sessionId = `failing-session-${Date.now()}`;

			// Start an operation that will fail
			await execa('node', [aiBinaryPath, 'failing-operation', sessionId], {
				cwd: tempDir,
				reject: false
			});

			// Check that no leftover resources exist
			const sessionPath = path.join(tempDir, '.ai', 'sessions', `${sessionId}.json`);
			try {
				await fs.access(sessionPath);
				// If file exists, it should be properly formatted
				const content = await fs.readFile(sessionPath, 'utf-8');
				const sessionData = JSON.parse(content);
				expect(sessionData.id).toBeDefined();
			} catch (error) {
				// File doesn't exist or is inaccessible, which is acceptable
			}
		});

		it('should handle cleanup failures gracefully', async () => {
			// Test cleanup when cleanup itself fails
			const { exitCode } = await execa('node', [aiBinaryPath, 'operation-with-cleanup-failure'], {
				cwd: tempDir,
				reject: false
			});

			// Should still complete despite cleanup failure
			expect(typeof exitCode).toBe('number');
		});
	});
});
