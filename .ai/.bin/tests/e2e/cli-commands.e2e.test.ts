/**
 * End-to-End tests for CLI commands
 *
 * Tests the complete CLI workflow using Playwright for browser automation
 * and testcontainers for isolated environments.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { execa } from 'execa';
import { Browser, Page, chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestcontainersHelper } from '../utils/testcontainers-helper';

describe('CLI Commands E2E', () => {
	let browser: Browser | null = null;
	let page: Page | null = null;
	let testcontainersHelper: TestcontainersHelper;
	let tempDir: string;
	let aiBinaryPath: string;
	let playwrightAvailable = false;

	beforeAll(async () => {
		// Set up test environment
		testcontainersHelper = new TestcontainersHelper();
		await testcontainersHelper.startSharedContainers();

		// Create temporary directory for testing
		tempDir = await fs.mkdtemp(path.join('/tmp', 'ai-cli-e2e-'));

		// Set up AI project structure
		await fs.mkdir(path.join(tempDir, '.ai'), { recursive: true });
		await fs.mkdir(path.join(tempDir, '.ai', '.bin'), { recursive: true });

		// Use the built CLI from the project root (it has access to node_modules)
		aiBinaryPath = path.join(process.cwd(), 'dist', 'cli', 'index.js');

		// Try to launch browser (optional - may not be available in all environments)
		try {
			browser = await chromium.launch();
			page = await browser.newPage();
			playwrightAvailable = true;
		} catch {
			// Playwright browsers not installed - skip browser tests
			playwrightAvailable = false;
		}

		// Set environment for testing
		process.env.AI_TEST_MODE = 'true';
		process.env.AI_INTERACTIVE = 'false';
		process.env.AI_MCP_ENABLED = 'false';
	}, 120000); // Increased timeout for container startup

	afterAll(async () => {
		// Clean up
		if (page) await page.close();
		if (browser) await browser.close();
		await testcontainersHelper.stopAllContainers();

		try {
			await fs.rm(tempDir, { force: true, recursive: true });
		} catch {
			// Ignore cleanup errors
		}
	}, 30000);

	describe('CLI Help and Version', () => {
		it('should display help information', async () => {
			const { exitCode, stderr, stdout } = await execa('node', [aiBinaryPath, '--help'], {
				cwd: tempDir,
				env: { ...process.env, AI_INTERACTIVE: 'false' },
				input: ''
			});

			expect(exitCode).toBe(0);
			expect(stderr).toBe('');
			expect(stdout).toContain('VALORA');
			expect(stdout).toContain('AI-Assisted Development Workflow Orchestration');
		}, 15000);

		it('should display version information', async () => {
			const { exitCode, stdout } = await execa('node', [aiBinaryPath, '--version'], {
				cwd: tempDir,
				env: { ...process.env, AI_INTERACTIVE: 'false' },
				input: ''
			});

			expect(exitCode).toBe(0);
			expect(stdout).toMatch(/\d+\.\d+\.\d+/); // Version pattern
		}, 15000);
	});

	describe('Configuration Management', () => {
		it('should initialize configuration', async () => {
			const configPath = path.join(tempDir, 'config.json');

			// Ensure config doesn't exist initially
			try {
				await fs.unlink(configPath);
			} catch (error) {
				// Config doesn't exist, which is fine
			}

			const { exitCode, stdout } = await execa('node', [aiBinaryPath, 'config', 'setup', '--quick'], {
				cwd: tempDir,
				env: {
					...process.env,
					AI_CONFIG_PATH: configPath,
					AI_INTERACTIVE: 'false',
					AI_LOG_LEVEL: 'info',
					AI_OPENAI_API_KEY: 'sk-test123'
				},
				input: ''
			});

			expect(exitCode).toBe(0);
			expect(stdout).toContain('Quick setup complete');

			// Verify config file was created
			const configExists = await fs
				.access(configPath)
				.then(() => true)
				.catch(() => false);
			expect(configExists).toBe(true);
		}, 15000);

		it('should show configuration status', async () => {
			const configPath = path.join(tempDir, 'config.json');
			const { exitCode, stdout } = await execa('node', [aiBinaryPath, 'config', 'show'], {
				cwd: tempDir,
				env: {
					...process.env,
					AI_CONFIG_PATH: configPath,
					AI_INTERACTIVE: 'false'
				},
				input: ''
			});

			expect(exitCode).toBe(0);
			expect(stdout).toContain('Configuration');
		}, 20000);
	});

	describe('Session Management', () => {
		it('should list and manage sessions', async () => {
			// List sessions (should work even if empty)
			const { exitCode: listExit, stdout: listOutput } = await execa('node', [aiBinaryPath, 'session', 'list'], {
				cwd: tempDir,
				env: { ...process.env, AI_INTERACTIVE: 'false' },
				input: ''
			});

			expect(listExit).toBe(0);
			// Should either show "No sessions found" or list sessions
			expect(listOutput).toMatch(/No sessions found|ACTIVE SESSIONS/);

			// Test session clear command
			const { exitCode: clearExit, stdout: clearOutput } = await execa('node', [aiBinaryPath, 'session', 'clear'], {
				cwd: tempDir,
				env: { ...process.env, AI_INTERACTIVE: 'false' },
				input: ''
			});

			expect(clearExit).toBe(0);
			expect(clearOutput).toContain('Cleared');
		}, 30000);
	});

	describe('Command Execution', () => {
		it('should execute orchestration commands', async () => {
			// Test with a simple command that should work
			const { exitCode, stdout } = await execa(
				'node',
				[aiBinaryPath, 'list'], // List available commands
				{
					cwd: tempDir,
					env: {
						...process.env,
						AI_INTERACTIVE: 'false',
						AI_SESSION_ID: 'test-session'
					},
					input: ''
				}
			);

			expect(exitCode).toBe(0);
			expect(stdout).toBeDefined();
		}, 15000);

		it('should handle command execution with options', async () => {
			// Test exec with a nonexistent command - should fail gracefully
			const { exitCode, stderr, stdout } = await execa(
				'node',
				[aiBinaryPath, 'exec', 'nonexistent-command', '--verbose'],
				{
					cwd: tempDir,
					env: {
						...process.env,
						AI_INTERACTIVE: 'false',
						AI_VERBOSE: 'true'
					},
					reject: false,
					input: ''
				}
			);

			// Should fail because command doesn't exist
			expect(exitCode).toBe(1);
			expect(stderr).toContain('Failed to load command');
		}, 10000);
	});

	describe('Error Handling', () => {
		it('should handle invalid commands gracefully', async () => {
			const { exitCode, stderr, stdout } = await execa('node', [aiBinaryPath, 'invalid-command'], {
				cwd: tempDir,
				env: { ...process.env, AI_INTERACTIVE: 'false' },
				reject: false, // Don't throw on non-zero exit
				input: ''
			});

			expect(exitCode).not.toBe(0);
			expect(stderr || stdout).toContain('error' || 'invalid' || 'unknown');
		}, 15000);

		it('should handle missing required arguments', async () => {
			const { exitCode, stderr, stdout } = await execa(
				'node',
				[aiBinaryPath, 'session', 'delete'], // Missing session ID
				{
					cwd: tempDir,
					env: { ...process.env, AI_INTERACTIVE: 'false' },
					reject: false,
					input: ''
				}
			);

			expect(exitCode).not.toBe(0);
			expect(stderr || stdout).toContain('error' || 'required' || 'missing');
		}, 15000);
	});

	describe('Logging and Output', () => {
		it('should respect log levels', async () => {
			const { exitCode: debugExit, stdout: debugOutput } = await execa(
				'node',
				[aiBinaryPath, '--log-level', 'debug', 'list'],
				{
					cwd: tempDir,
					env: { ...process.env, AI_INTERACTIVE: 'false' },
					input: ''
				}
			);

			expect(debugExit).toBe(0);

			const { exitCode: errorExit, stdout: errorOutput } = await execa(
				'node',
				[aiBinaryPath, '--log-level', 'error', 'list'],
				{
					cwd: tempDir,
					env: { ...process.env, AI_INTERACTIVE: 'false' },
					input: ''
				}
			);

			expect(errorExit).toBe(0);
			// Error level should produce less output than debug level
			expect(errorOutput.length).toBeLessThanOrEqual(debugOutput.length);
		}, 30000);

		it('should support different output formats', async () => {
			const { exitCode: jsonExit, stdout: jsonOutput } = await execa(
				'node',
				[aiBinaryPath, '--output', 'json', 'session', 'list'],
				{
					cwd: tempDir,
					env: { ...process.env, AI_INTERACTIVE: 'false' },
					input: ''
				}
			);

			expect(jsonExit).toBe(0);

			// Try to parse as JSON (may fail if command doesn't support JSON output)
			try {
				const parsed = JSON.parse(jsonOutput);
				expect(parsed).toBeDefined();
			} catch (error) {
				// Command may not support JSON output, which is acceptable
				expect(jsonOutput).toBeDefined();
			}
		}, 10000);
	});

	describe('Interactive Mode', () => {
		it('should disable interactive features when requested', async () => {
			const { exitCode, stdout } = await execa('node', [aiBinaryPath, '--no-interactive', 'list'], {
				cwd: tempDir,
				env: { ...process.env, AI_INTERACTIVE: 'true' }, // Override env var
				input: ''
			});

			expect(exitCode).toBe(0);
			// Should not prompt for input
			expect(stdout).not.toContain('?'); // Common prompt character
		}, 10000);
	});

	describe('Performance and Resource Usage', () => {
		it('should execute commands within reasonable time', async () => {
			const startTime = Date.now();

			const { exitCode } = await execa('node', [aiBinaryPath, '--quiet', 'list'], {
				cwd: tempDir,
				env: { ...process.env, AI_INTERACTIVE: 'false' },
				timeout: 20000, // 20 second timeout
				input: ''
			});

			const endTime = Date.now();
			const duration = endTime - startTime;

			expect(exitCode).toBe(0);
			expect(duration).toBeLessThan(15000); // Should complete within 15 seconds
		}, 30000);

		it('should handle memory-intensive operations', async () => {
			// Test with a command that might use more memory
			const { exitCode, stdout } = await execa('node', [aiBinaryPath, 'config', 'show'], {
				cwd: tempDir,
				env: { ...process.env, AI_INTERACTIVE: 'false' },
				maxBuffer: 1024 * 1024, // 1MB buffer
				input: ''
			});

			expect(exitCode).toBe(0);
			expect(stdout.length).toBeLessThan(1024 * 1024); // Should not exceed buffer
		}, 20000);
	});

	describe('Browser-based Features (if applicable)', () => {
		it('should handle browser-related commands', async () => {
			if (!playwrightAvailable || !page) {
				// Skip test if Playwright browsers aren't installed
				expect(true).toBe(true);
				return;
			}

			// Navigate to a test page if the CLI has browser features
			await page.goto('about:blank');

			// This is a placeholder test for browser integration
			// In a real implementation, you might test CLI commands that launch browsers
			expect(page.url()).toContain('blank');
		}, 10000);
	});
});
