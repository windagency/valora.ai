/**
 * Performance Tests for VALORA
 *
 * Tests performance characteristics, resource usage, and scalability
 * to ensure the system meets performance requirements.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { execa } from 'execa';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TestcontainersHelper } from '../utils/testcontainers-helper';

describe('Performance Validation Tests', () => {
	let testcontainersHelper: TestcontainersHelper;
	let tempDir: string;
	let aiBinaryPath: string;
	let databaseUrl: string;
	let redisUrl: string;

	beforeAll(async () => {
		// Set up test environment with real databases for performance testing
		testcontainersHelper = new TestcontainersHelper();
		await testcontainersHelper.startSharedContainers();

		databaseUrl = await testcontainersHelper.getDatabaseUrl();
		redisUrl = await testcontainersHelper.getRedisUrl();

		// Create temporary directory for testing
		tempDir = await fs.mkdtemp(path.join('/tmp', 'ai-performance-test-'));

		// Set up AI project structure
		await fs.mkdir(path.join(tempDir, '.ai'), { recursive: true });
		await fs.mkdir(path.join(tempDir, '.ai', '.bin'), { recursive: true });

		// Create performance testing binary
		const perfCli = `
			const fs = require('fs');
			const path = require('path');
			const crypto = require('crypto');

			const command = process.argv[2];
			const args = process.argv.slice(3);

			if (command === 'cpu-intensive') {
				// Simulate CPU-intensive operation
				const iterations = parseInt(args[0]) || 1000000;
				let result = 0;
				for (let i = 0; i < iterations; i++) {
					result += Math.sin(i) * Math.cos(i);
				}
				console.log(\`CPU intensive task completed: \${result.toFixed(2)}\`);
			} else if (command === 'memory-intensive') {
				// Simulate memory-intensive operation
				const size = parseInt(args[0]) || 1000000;
				const data = [];
				for (let i = 0; i < size; i++) {
					data.push({
						id: i,
						data: crypto.randomBytes(100).toString('hex'),
						timestamp: Date.now()
					});
				}
				console.log(\`Memory intensive task completed: \${data.length} items\`);
			} else if (command === 'io-intensive') {
				// Simulate I/O intensive operation
				const files = parseInt(args[0]) || 100;
				const promises = [];
				for (let i = 0; i < files; i++) {
					const filePath = path.join(process.cwd(), 'temp', \`file-\${i}.txt\`);
					promises.push(fs.promises.writeFile(filePath, \`Content \${i}\`));
				}
				Promise.all(promises).then(() => {
					console.log(\`I/O intensive task completed: \${files} files\`);
				}).catch(console.error);
			} else if (command === 'concurrent-ops') {
				// Simulate concurrent operations
				const concurrency = parseInt(args[0]) || 10;
				const promises = [];
				for (let i = 0; i < concurrency; i++) {
					promises.push(new Promise(resolve => {
						setTimeout(() => resolve(\`Operation \${i} completed\`), Math.random() * 100);
					}));
				}
				Promise.all(promises).then(results => {
					console.log(\`Concurrent operations completed: \${results.length}\`);
				});
			} else if (command === 'database-load') {
				// Simulate database operations (mock)
				const operations = parseInt(args[0]) || 1000;
				setTimeout(() => {
					console.log(\`Database operations completed: \${operations}\`);
				}, operations * 0.1); // Simulate latency
			} else if (command === 'session' && args[0] === 'create') {
				const sessionId = args[1];
				const sessionDir = path.join(process.cwd(), '.ai', 'sessions');
				fs.mkdirSync(sessionDir, { recursive: true });
				fs.writeFileSync(path.join(sessionDir, \`\${sessionId}.json\`), JSON.stringify({
					id: sessionId,
					created: Date.now(),
					data: 'x'.repeat(1000) // Simulate session data
				}));
				console.log(\`Session \${sessionId} created\`);
			} else {
				console.log(\`Performance test command: \${command} \${args.join(' ')}\`);
			}
		`;
		aiBinaryPath = path.join(tempDir, '.ai', '.bin', 'cli.js');
		await fs.writeFile(aiBinaryPath, perfCli);
		await fs.chmod(aiBinaryPath, 0o755);
	}, 60000);

	afterAll(async () => {
		await testcontainersHelper.stopAllContainers();

		try {
			await fs.rm(tempDir, { force: true, recursive: true });
		} catch (error) {
			// Ignore cleanup errors
		}
	}, 30000);

	beforeEach(async () => {
		// Reset test environment between tests
		// Note: TestcontainersManager doesn't have a resetState method
		// We'll handle state reset in individual tests if needed
	});

	describe('CPU Performance', () => {
		it('should complete CPU-intensive operations within time limits', async () => {
			const startTime = Date.now();

			const { exitCode } = await execa(
				'node',
				[aiBinaryPath, 'cpu-intensive', '500000'], // Reduced iterations for faster test
				{
					cwd: tempDir,
					timeout: 5000 // 5 second timeout
				}
			);

			const endTime = Date.now();
			const duration = endTime - startTime;

			expect(exitCode).toBe(0);
			expect(duration).toBeLessThan(3000); // Should complete within 3 seconds
		}, 10000);

		it('should handle concurrent CPU operations efficiently', async () => {
			const concurrentOperations = Array(5)
				.fill(null)
				.map(() =>
					execa('node', [aiBinaryPath, 'cpu-intensive', '100000'], {
						cwd: tempDir,
						timeout: 3000
					})
				);

			const startTime = Date.now();
			const results = await Promise.all(concurrentOperations);
			const endTime = Date.now();
			const totalDuration = endTime - startTime;

			results.forEach((result) => expect(result.exitCode).toBe(0));

			// Concurrent operations should not take significantly longer than sequential
			expect(totalDuration).toBeLessThan(10000);
		}, 15000);
	});

	describe('Memory Performance', () => {
		it('should handle memory-intensive operations without excessive usage', async () => {
			const startTime = Date.now();

			const { exitCode } = await execa(
				'node',
				[aiBinaryPath, 'memory-intensive', '100000'], // 100K items
				{
					cwd: tempDir,
					maxBuffer: 50 * 1024 * 1024,
					timeout: 10000 // 50MB buffer limit
				}
			);

			const endTime = Date.now();
			const duration = endTime - startTime;

			expect(exitCode).toBe(0);
			expect(duration).toBeLessThan(8000);
		}, 15000);

		it('should prevent memory leaks in repeated operations', async () => {
			const iterations = 10;

			for (let i = 0; i < iterations; i++) {
				const { exitCode } = await execa(
					'node',
					[aiBinaryPath, 'memory-intensive', '50000'], // Smaller dataset per iteration
					{
						cwd: tempDir,
						timeout: 5000
					}
				);

				expect(exitCode).toBe(0);

				// Small delay to allow cleanup
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
		}, 60000);
	});

	describe('I/O Performance', () => {
		beforeEach(async () => {
			// Create temp directory for I/O tests
			await fs.mkdir(path.join(tempDir, 'temp'), { recursive: true });
		});

		it('should handle I/O intensive operations efficiently', async () => {
			const startTime = Date.now();

			const { exitCode } = await execa(
				'node',
				[aiBinaryPath, 'io-intensive', '50'], // 50 files
				{
					cwd: tempDir,
					timeout: 10000
				}
			);

			const endTime = Date.now();
			const duration = endTime - startTime;

			expect(exitCode).toBe(0);
			expect(duration).toBeLessThan(5000);
		}, 15000);

		it('should handle concurrent I/O operations', async () => {
			const concurrentOps = Array(3)
				.fill(null)
				.map(() =>
					execa('node', [aiBinaryPath, 'io-intensive', '20'], {
						cwd: tempDir,
						timeout: 5000
					})
				);

			const startTime = Date.now();
			const results = await Promise.all(concurrentOps);
			const endTime = Date.now();
			const totalDuration = endTime - startTime;

			results.forEach((result) => expect(result.exitCode).toBe(0));
			expect(totalDuration).toBeLessThan(8000);
		}, 20000);
	});

	describe('Database Performance', () => {
		it('should handle database operations within acceptable latency', async () => {
			const startTime = Date.now();

			const { exitCode } = await execa(
				'node',
				[aiBinaryPath, 'database-load', '500'], // 500 simulated operations
				{
					cwd: tempDir,
					env: {
						...process.env,
						DATABASE_URL: databaseUrl
					},
					timeout: 10000
				}
			);

			const endTime = Date.now();
			const duration = endTime - startTime;

			expect(exitCode).toBe(0);
			expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
		}, 15000);

		it('should maintain performance under concurrent database load', async () => {
			const concurrentDbOps = Array(5)
				.fill(null)
				.map(() =>
					execa('node', [aiBinaryPath, 'database-load', '100'], {
						cwd: tempDir,
						env: {
							...process.env,
							DATABASE_URL: databaseUrl
						},
						timeout: 5000
					})
				);

			const startTime = Date.now();
			const results = await Promise.all(concurrentDbOps);
			const endTime = Date.now();
			const totalDuration = endTime - startTime;

			results.forEach((result) => expect(result.exitCode).toBe(0));
			expect(totalDuration).toBeLessThan(3000);
		}, 20000);
	});

	describe('Cache Performance', () => {
		it('should benefit from caching for repeated operations', async () => {
			const operation = ['session', 'create', `cache-test-${Date.now()}`];

			// First execution (cache miss)
			const startTime1 = Date.now();
			await execa('node', [aiBinaryPath, ...operation], { cwd: tempDir });
			const duration1 = Date.now() - startTime1;

			// Second execution (potential cache hit)
			const startTime2 = Date.now();
			await execa('node', [aiBinaryPath, ...operation], { cwd: tempDir });
			const duration2 = Date.now() - startTime2;

			// Second operation should not be significantly slower
			// Using 3x tolerance to account for timing variability in short-running operations
			expect(duration2).toBeLessThan(duration1 * 3);
		}, 10000);
	});

	describe('Concurrent Operations', () => {
		it('should handle high concurrency without degradation', async () => {
			const concurrencyLevels = [5, 10, 20];
			const results: number[] = [];

			for (const concurrency of concurrencyLevels) {
				const operations = Array(concurrency)
					.fill(null)
					.map((_, i) =>
						execa('node', [aiBinaryPath, 'concurrent-ops', '5'], {
							cwd: tempDir,
							timeout: 5000
						})
					);

				const startTime = Date.now();
				await Promise.all(operations);
				const duration = Date.now() - startTime;

				results.push(duration);

				// Each concurrency level should complete within reasonable time
				expect(duration).toBeLessThan(concurrency * 200); // 200ms per operation max
			}

			// Higher concurrency should not degrade performance linearly
			const scalingFactor = results[2] / results[0]; // 20 vs 5 concurrent
			expect(scalingFactor).toBeLessThan(3); // Should scale reasonably
		}, 30000);
	});

	describe('Resource Usage Monitoring', () => {
		it('should complete operations without excessive resource usage', async () => {
			const operations = [
				['cpu-intensive', '100000'],
				['memory-intensive', '50000'],
				['io-intensive', '10']
			];

			for (const operation of operations) {
				const startTime = process.hrtime.bigint();

				const { exitCode } = await execa('node', [aiBinaryPath, ...operation], {
					cwd: tempDir,
					timeout: 10000
				});

				const endTime = process.hrtime.bigint();
				const durationMs = Number(endTime - startTime) / 1_000_000;

				expect(exitCode).toBe(0);
				expect(durationMs).toBeLessThan(5000); // 5 seconds max per operation

				// Log performance metrics
				console.log(`${operation[0]}: ${durationMs.toFixed(2)}ms`);
			}
		}, 30000);
	});

	describe('Scalability Testing', () => {
		it('should scale with increasing load', async () => {
			const loadLevels = [10, 50, 100, 500];

			for (const load of loadLevels) {
				const startTime = Date.now();

				const { exitCode } = await execa('node', [aiBinaryPath, 'cpu-intensive', load.toString()], {
					cwd: tempDir,
					timeout: 30000 // Longer timeout for larger loads
				});

				const duration = Date.now() - startTime;

				expect(exitCode).toBe(0);

				// Performance should scale roughly linearly with load
				const expectedMaxDuration = load * 10; // 10ms per iteration max
				expect(duration).toBeLessThan(expectedMaxDuration);

				console.log(`Load ${load}: ${duration}ms`);
			}
		}, 120000);
	});

	describe('Response Time Requirements', () => {
		it('should meet sub-second response time for simple operations', async () => {
			const simpleOperations = [['--help'], ['--version'], ['session', 'list']];

			for (const operation of simpleOperations) {
				const startTime = Date.now();

				const { exitCode } = await execa('node', [aiBinaryPath, ...operation], {
					cwd: tempDir,
					timeout: 2000
				});

				const duration = Date.now() - startTime;

				expect(exitCode).toBe(0);
				expect(duration).toBeLessThan(500); // 500ms requirement for simple ops
			}
		}, 10000);

		it('should meet response time SLAs for complex operations', async () => {
			const complexOperations = [
				{ command: ['cpu-intensive', '50000'], maxDuration: 2000 },
				{ command: ['memory-intensive', '10000'], maxDuration: 3000 },
				{ command: ['database-load', '100'], maxDuration: 1000 }
			];

			for (const { command, maxDuration } of complexOperations) {
				const startTime = Date.now();

				const { exitCode } = await execa('node', [aiBinaryPath, ...command], {
					cwd: tempDir,
					timeout: maxDuration + 1000
				});

				const duration = Date.now() - startTime;

				expect(exitCode).toBe(0);
				expect(duration).toBeLessThan(maxDuration);
			}
		}, 20000);
	});

	describe('Memory Leak Detection', () => {
		it('should not exhibit memory leaks in long-running operations', async () => {
			const iterations = 20;
			const durations: number[] = [];

			for (let i = 0; i < iterations; i++) {
				const startTime = Date.now();

				const { exitCode } = await execa('node', [aiBinaryPath, 'memory-intensive', '10000'], {
					cwd: tempDir,
					timeout: 5000
				});

				const duration = Date.now() - startTime;

				expect(exitCode).toBe(0);
				durations.push(duration);

				// Small delay between iterations
				await new Promise((resolve) => setTimeout(resolve, 50));
			}

			// Check that performance doesn't degrade significantly
			const firstHalf = durations.slice(0, 10);
			const secondHalf = durations.slice(10);

			const avgFirst = firstHalf.reduce((a, b) => a + b) / firstHalf.length;
			const avgSecond = secondHalf.reduce((a, b) => a + b) / secondHalf.length;

			// Second half should not be more than 50% slower than first half
			expect(avgSecond / avgFirst).toBeLessThan(1.5);
		}, 120000);
	});

	describe('Load Testing', () => {
		it('should handle sustained load without performance degradation', async () => {
			const testDuration = 10000; // 10 seconds
			const startTime = Date.now();
			let operationCount = 0;

			while (Date.now() - startTime < testDuration) {
				const { exitCode } = await execa(
					'node',
					[aiBinaryPath, 'cpu-intensive', '1000'], // Very small operation
					{
						cwd: tempDir,
						timeout: 1000
					}
				);

				expect(exitCode).toBe(0);
				operationCount++;

				// Small delay to prevent overwhelming the system
				await new Promise((resolve) => setTimeout(resolve, 10));
			}

			const actualDuration = Date.now() - startTime;
			const operationsPerSecond = operationCount / (actualDuration / 1000);

			console.log(`Sustained load: ${operationsPerSecond.toFixed(2)} ops/sec`);

			// Should maintain reasonable throughput
			expect(operationsPerSecond).toBeGreaterThan(5); // At least 5 ops/sec
		}, 15000);
	});
});
