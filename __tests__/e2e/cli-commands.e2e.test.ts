/**
 * End-to-End tests for CLI commands.
 *
 * Scope note: this file owns CLI-surface scenarios not covered by
 * __tests__/acceptance/user-workflows.acceptance.test.ts — flags and argument
 * handling (--version, --log-level, --output, --no-interactive, missing
 * required arguments) rather than that file's business-workflow scenarios
 * (data security, concurrency, resource management). Each CLI behavior is
 * asserted in exactly one of the two files, not both.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { execa } from 'execa';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('CLI Commands E2E', () => {
	let tempDir: string;
	let aiBinaryPath: string;

	/**
	 * Helper to run CLI commands via the built binary.
	 * NODE_OPTIONS is cleared so the VS Code inspector bootloader is not
	 * inherited by child processes, which would cause debugger-attach delays
	 * that push commands past their timeout limits.
	 */
	function cli(...args: string[]) {
		return [aiBinaryPath, ...args];
	}

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
		// Create temporary directory for testing
		tempDir = await fs.mkdtemp(path.join('/tmp', 'ai-cli-e2e-'));

		// Use the built CLI (requires `pnpm build` to have been run)
		aiBinaryPath = path.join(process.cwd(), 'dist', 'cli', 'index.js');
	}, 30000);

	afterAll(async () => {
		try {
			await fs.rm(tempDir, { force: true, recursive: true });
		} catch {
			// Ignore cleanup errors
		}
	}, 30000);

	describe('CLI Version', () => {
		it('should display version information', async () => {
			const { exitCode, stdout } = await execa('node', cli('--version'), {
				cwd: tempDir,
				env: cliEnv(),
				input: ''
			});

			expect(exitCode).toBe(0);
			expect(stdout).toMatch(/\d+\.\d+\.\d+/); // Version pattern
		}, 30000);
	});

	describe('Command Execution', () => {
		it('should surface --verbose output on an exec failure without changing the failure itself', async () => {
			const { exitCode, stderr } = await execa('node', cli('exec', 'nonexistent-command', '--verbose'), {
				cwd: tempDir,
				env: cliEnv({ AI_VERBOSE: 'true' }),
				reject: false,
				input: ''
			});

			// Should fail because command doesn't exist, regardless of --verbose
			expect(exitCode).toBe(1);
			expect(stderr).toContain('Failed to load command');
		}, 30000);
	});

	describe('Error Handling', () => {
		it('should handle missing required arguments', async () => {
			const { exitCode, stderr, stdout } = await execa(
				'node',
				cli('session', 'delete'), // Missing session ID
				{
					cwd: tempDir,
					env: cliEnv(),
					reject: false,
					input: ''
				}
			);

			expect(exitCode).not.toBe(0);
			expect(stderr || stdout).toMatch(/error|required|missing/i);
		}, 30000);
	});

	describe('Logging and Output', () => {
		it('should respect log levels', async () => {
			const { exitCode: debugExit, stdout: debugOutput } = await execa('node', cli('--log-level', 'debug', 'list'), {
				cwd: tempDir,
				env: cliEnv(),
				input: ''
			});

			expect(debugExit).toBe(0);

			const { exitCode: errorExit, stdout: errorOutput } = await execa('node', cli('--log-level', 'error', 'list'), {
				cwd: tempDir,
				env: cliEnv(),
				input: ''
			});

			expect(errorExit).toBe(0);
			// Error level should produce less output than debug level
			expect(errorOutput.length).toBeLessThanOrEqual(debugOutput.length);
		}, 30000);

		it('should exit cleanly with --output json, though the flag does not yet produce parseable JSON', async () => {
			// KNOWN GAP (found while tightening this test's original try/catch-swallowed
			// assertion): `--output json` does not actually change `session list`'s output to
			// JSON — verified directly (`node dist/cli/index.js --output json session list`),
			// stdout is the same box-drawing UI plus an unrelated "Auto-migrated config..."
			// info line, not JSON. Spot-checking `config show`/`list` shows the same gap across
			// commands. This is a real, pre-existing product gap (the flag exists but isn't
			// wired to any command's actual output formatting) — out of scope for a test
			// consolidation to fix, since it would mean auditing every command's output path.
			// This test only asserts what's actually true today (clean exit); do not tighten it
			// to assert valid JSON until the underlying --output json support is implemented.
			const { exitCode: jsonExit } = await execa('node', cli('--output', 'json', 'session', 'list'), {
				cwd: tempDir,
				env: cliEnv(),
				input: ''
			});

			expect(jsonExit).toBe(0);
		}, 30000);
	});

	describe('Interactive Mode', () => {
		it('should disable interactive features when requested', async () => {
			const { exitCode, stdout } = await execa('node', cli('--no-interactive', 'list'), {
				cwd: tempDir,
				env: cliEnv({ AI_INTERACTIVE: 'true' }), // Override env var
				input: ''
			});

			expect(exitCode).toBe(0);
			// Should not prompt for input
			expect(stdout).not.toContain('?'); // Common prompt character
		}, 30000);
	});

	describe('Resource Usage', () => {
		it('should handle memory-intensive operations within a bounded output buffer', async () => {
			const { exitCode, stdout } = await execa('node', cli('config', 'show'), {
				cwd: tempDir,
				env: cliEnv(),
				maxBuffer: 1024 * 1024, // 1MB buffer
				input: ''
			});

			expect(exitCode).toBe(0);
			expect(stdout.length).toBeGreaterThan(0);
			expect(stdout.length).toBeLessThan(1024 * 1024); // Should not exceed buffer
		}, 30000);
	});
});
