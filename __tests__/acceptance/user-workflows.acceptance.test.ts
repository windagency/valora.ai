/**
 * Acceptance Tests for User Workflows
 *
 * Validates complete user journeys and business requirements
 * using the real compiled CLI binary.
 */

import * as fs from 'fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'path';
import { execa } from 'execa';
import { getDataSanitizer } from 'utils/data-sanitizer';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const cliBuilt = existsSync(path.join(process.cwd(), 'dist', 'cli', 'index.js'));

describe.skipIf(!cliBuilt)('User Workflow Acceptance Tests', () => {
	let tempDir: string;
	let aiBinaryPath: string;

	/**
	 * Build a sanitised env for child processes.
	 * NODE_OPTIONS is cleared so the VS Code inspector bootloader is not
	 * inherited, which would cause debugger-attach delays that push commands
	 * past their timeout limits.
	 */
	function cliEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
		return {
			...process.env,
			AI_INTERACTIVE: 'false',
			AI_MCP_ENABLED: 'false',
			AI_TEST_MODE: 'true',
			NODE_OPTIONS: '',
			...overrides
		};
	}

	beforeAll(async () => {
		const realBin = path.resolve(process.cwd(), 'dist', 'cli', 'index.js');
		const binExists = await fs
			.access(realBin)
			.then(() => true)
			.catch(() => false);
		if (!binExists) {
			throw new Error(`Acceptance tests require a built binary at ${realBin}. Run 'pnpm build' first.`);
		}
		aiBinaryPath = realBin;

		tempDir = await fs.mkdtemp(path.join('/tmp', 'ai-acceptance-test-'));
		await fs.mkdir(path.join(tempDir, '.valora'), { recursive: true });
	}, 30000);

	afterAll(async () => {
		try {
			await fs.rm(tempDir, { force: true, recursive: true });
		} catch (error) {
			// Ignore cleanup errors
		}
	}, 30000);

	beforeEach(async () => {
		// Nothing to reset — no containers in use
	});

	describe('First-Time User Setup', () => {
		it('should display help and expose the configuration path', async () => {
			const { exitCode: helpExit, stdout: helpOutput } = await execa('node', [aiBinaryPath, '--help'], {
				cwd: tempDir,
				env: cliEnv(),
				input: ''
			});

			expect(helpExit).toBe(0);
			expect(helpOutput).toContain('valora');
			expect(helpOutput).toContain('AI-Assisted Development');

			// Verify configuration path is reachable
			const { exitCode: configExit, stdout: configOutput } = await execa('node', [aiBinaryPath, 'config', 'path'], {
				cwd: tempDir,
				env: cliEnv({ AI_LOG_LEVEL: 'info' }),
				input: ''
			});

			expect(configExit).toBe(0);
			expect(configOutput.trim().length).toBeGreaterThan(0);
		}, 30000);
	});

	describe('Session Management Workflow', () => {
		it('should list sessions and clear inactive ones', async () => {
			// List sessions — works even when there are none
			const { exitCode: listExit, stdout: listOutput } = await execa('node', [aiBinaryPath, 'session', 'list'], {
				cwd: tempDir,
				env: cliEnv(),
				input: ''
			});

			expect(listExit).toBe(0);
			expect(listOutput).toMatch(/No sessions found|ACTIVE SESSIONS/);

			// Clear any inactive sessions
			const { exitCode: clearExit, stdout: clearOutput } = await execa('node', [aiBinaryPath, 'session', 'clear'], {
				cwd: tempDir,
				env: cliEnv(),
				input: ''
			});

			expect(clearExit).toBe(0);
			expect(clearOutput).toContain('Cleared');
		}, 30000);

		it('should expose delete subcommand with --force option', async () => {
			const { exitCode, stdout } = await execa('node', [aiBinaryPath, 'session', 'delete', '--help'], {
				cwd: tempDir,
				env: cliEnv(),
				input: ''
			});

			expect(exitCode).toBe(0);
			expect(stdout).toContain('--force');
		}, 15000);
	});

	describe('Command Orchestration', () => {
		it('should list available commands and plugins', async () => {
			const { exitCode, stdout } = await execa('node', [aiBinaryPath, 'list'], {
				cwd: tempDir,
				env: cliEnv(),
				input: ''
			});

			expect(exitCode).toBe(0);
			expect(stdout).toBeDefined();
		}, 30000);

		it('should reject unknown exec commands with a clear error', async () => {
			const { exitCode, stderr } = await execa('node', [aiBinaryPath, 'exec', 'nonexistent-command', '--dry-run'], {
				cwd: tempDir,
				env: cliEnv({ AI_DRY_RUN: 'true' }),
				input: '',
				reject: false
			});

			expect(exitCode).toBe(1);
			expect(stderr).toContain('Failed to load command');
		}, 30000);
	});

	describe('Configuration Management', () => {
		it('should display current configuration', async () => {
			const { exitCode: showExit, stdout: showOutput } = await execa('node', [aiBinaryPath, 'config', 'show'], {
				cwd: tempDir,
				env: cliEnv(),
				input: ''
			});

			expect(showExit).toBe(0);
			expect(showOutput).toContain('Configuration');
		}, 25000);

		it('should report the configuration file path', async () => {
			const { exitCode, stdout } = await execa('node', [aiBinaryPath, 'config', 'path'], {
				cwd: tempDir,
				env: cliEnv(),
				input: ''
			});

			expect(exitCode).toBe(0);
			expect(stdout.trim().length).toBeGreaterThan(0);
		}, 15000);
	});

	describe('Error Recovery and Resilience', () => {
		it('should handle and recover from errors gracefully', async () => {
			// Test with invalid command
			const { exitCode: invalidExit } = await execa('node', [aiBinaryPath, 'invalid-command-12345'], {
				cwd: tempDir,
				env: cliEnv(),
				input: '',
				reject: false
			});

			expect(invalidExit).not.toBe(0);

			// System should still be functional after error
			const { exitCode: helpExit, stdout: helpOutput } = await execa('node', [aiBinaryPath, '--help'], {
				cwd: tempDir,
				env: cliEnv(),
				input: ''
			});

			expect(helpExit).toBe(0);
			expect(helpOutput).toContain('valora');
		}, 20000);

		it('should fail with a non-zero exit code for unknown exec commands', async () => {
			const { exitCode } = await execa('node', [aiBinaryPath, 'exec', 'unknown-command'], {
				cwd: tempDir,
				env: cliEnv({ AI_NETWORK_TIMEOUT: '5000' }),
				input: '',
				reject: false
			});

			expect(exitCode).toBe(1);
		}, 15000);
	});

	describe('Performance Requirements', () => {
		it('should meet performance expectations for common operations', async () => {
			const operations = [
				{ command: ['--help'], name: 'help display' },
				{ command: ['config', 'path'], name: 'config path' },
				{ command: ['session', 'list'], name: 'session listing' }
			];

			for (const operation of operations) {
				const startTime = Date.now();

				const { exitCode } = await execa('node', [aiBinaryPath, ...operation.command], {
					cwd: tempDir,
					env: cliEnv(),
					input: '',
					timeout: 20000
				});

				const endTime = Date.now();
				const duration = endTime - startTime;

				expect(exitCode).toBe(0);
				expect(duration).toBeLessThan(20000); // Should complete within 20 seconds
			}
		}, 90000);
	});

	describe('Data Security and Privacy', () => {
		it('should protect sensitive data throughout workflows', async () => {
			// Test data sanitization directly using the sanitizer
			const sanitizer = getDataSanitizer();

			// Test configuration with sensitive data
			const configWithSecrets = {
				database: {
					url: 'postgresql://user:password@localhost/db'
				},
				providers: {
					openai: { apiKey: 'sk-1234567890abcdef1234567890abcdef' }
				}
			};

			const sanitized = sanitizer.sanitize(configWithSecrets);

			// Verify sensitive data is masked
			expect(sanitized.providers?.openai?.apiKey).toBe('************');
			expect(sanitized.database?.url).toBe('postgresql://***SANITIZED***:***SANITIZED***@localhost/db');

			// Test string sanitization
			const logWithSecrets = 'API key: sk-1234567890abcdef, token: secret-token-123';
			const sanitizedLog = sanitizer.sanitize(logWithSecrets);

			expect(sanitizedLog).toContain('API key: ***SANITIZED***');
			expect(sanitizedLog).toContain('token=***SANITIZED***');
			expect(sanitizedLog).not.toContain('sk-1234567890abcdef');
			expect(sanitizedLog).not.toContain('secret-token-123');

			// Test various sensitive data patterns
			expect(sanitizer.sanitize('Bearer sk-test123')).toBe('Bearer ***SANITIZED***');
			expect(sanitizer.sanitize('password=mysecretpass')).toBe('password=***SANITIZED***');
			expect(sanitizer.sanitize('Authorization: Bearer token123')).toBe('Authorization: ***SANITIZED***');
		});
	});

	describe('Concurrent Usage', () => {
		it('should handle multiple concurrent read-only operations', async () => {
			const operationCount = 3;
			const operations = Array.from({ length: operationCount }, () =>
				execa('node', [aiBinaryPath, 'session', 'list'], {
					cwd: tempDir,
					env: cliEnv(),
					input: ''
				})
			);

			const results = await Promise.all(operations);

			results.forEach((result) => {
				expect(result.exitCode).toBe(0);
				expect(result.stdout).toMatch(/No sessions found|ACTIVE SESSIONS/);
			});
		}, 45000);
	});

	describe('Resource Management', () => {
		it('should complete multiple sequential operations without resource exhaustion', async () => {
			const operations = Array(5)
				.fill(null)
				.map(() =>
					execa('node', [aiBinaryPath, 'config', 'show'], {
						cwd: tempDir,
						env: cliEnv(),
						input: ''
					})
				);

			// Run sequentially to avoid overwhelming the system in this env
			for (const op of operations) {
				const result = await op;
				expect(result.exitCode).toBe(0);
			}
		}, 40000);
	});
});
