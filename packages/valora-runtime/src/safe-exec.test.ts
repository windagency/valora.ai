import { existsSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CommandExecutionError, RetryExecutor, SafeExecutor } from './safe-exec';

describe('SafeExecutor.execute', () => {
	describe('shell:false — no shell interpolation', () => {
		it('passes an argument containing shell metacharacters through literally, without executing it', async () => {
			const dir = mkdtempSync(join(tmpdir(), 'valora-safe-exec-test-'));
			const markerPath = join(dir, 'should-not-exist.txt');
			try {
				const injectionAttempt = `hello; touch ${markerPath}; echo done`;

				const result = await SafeExecutor.execute('echo', [injectionAttempt]);

				expect(result.stdout.trim()).toBe(injectionAttempt);
				expect(existsSync(markerPath)).toBe(false);
			} finally {
				rmSync(dir, { force: true, recursive: true });
			}
		});

		it('fails with an execution error rather than falling back to a shell when the command name itself contains shell metacharacters', async () => {
			const dir = mkdtempSync(join(tmpdir(), 'valora-safe-exec-test-'));
			const markerPath = join(dir, 'should-not-exist.txt');
			try {
				await expect(SafeExecutor.execute(`echo hi; touch ${markerPath}`, [])).rejects.toThrow(/Failed to execute/);

				expect(existsSync(markerPath)).toBe(false);
			} finally {
				rmSync(dir, { force: true, recursive: true });
			}
		});
	});

	describe('successful execution', () => {
		it('resolves with stdout, stderr, and exitCode 0 on success', async () => {
			const result = await SafeExecutor.execute('echo', ['hello world']);

			expect(result.exitCode).toBe(0);
			expect(result.stdout.trim()).toBe('hello world');
			expect(result.stderr).toBe('');
		});

		it('respects the cwd option', async () => {
			const dir = mkdtempSync(join(tmpdir(), 'valora-safe-exec-test-'));
			try {
				const result = await SafeExecutor.execute('pwd', [], { cwd: dir });
				expect(result.stdout.trim()).toBe(dir);
			} finally {
				rmSync(dir, { force: true, recursive: true });
			}
		});
	});

	describe('non-zero exit', () => {
		it('rejects with a CommandExecutionError carrying the exit code and stderr', async () => {
			await expect(SafeExecutor.execute('sh', ['-c', 'echo failure-output 1>&2; exit 7'])).rejects.toMatchObject({
				exitCode: 7,
				stderr: expect.stringContaining('failure-output')
			});
		});

		it('is an instance of CommandExecutionError', async () => {
			expect.assertions(1);
			try {
				await SafeExecutor.execute('sh', ['-c', 'exit 1']);
			} catch (error) {
				expect(error).toBeInstanceOf(CommandExecutionError);
			}
		});
	});

	describe('timeout enforcement', () => {
		it('kills a long-running process and rejects with a timeout error once the timeout elapses', async () => {
			await expect(SafeExecutor.execute('sleep', ['5'], { timeout: 200 })).rejects.toThrow(/timed out after 200ms/);
		});

		it('escalates to SIGKILL when the process ignores SIGTERM', async () => {
			// A real process that traps SIGTERM and keeps running — proves the
			// force-kill escalation actually fires rather than leaving an
			// orphaned, unresponsive child around forever.
			const trapScript = 'trap "" TERM; sleep 10';

			await expect(SafeExecutor.execute('sh', ['-c', trapScript], { timeout: 100 })).rejects.toThrow(
				/timed out after 100ms/
			);
			// The escalation setTimeout fires HEALTH_CHECK_INTERVAL_MS (5s) after
			// SIGTERM; give the SIGKILL a moment to actually land before the test
			// process exits, otherwise Node may warn about a lingering handle.
		}, 12000);
	});

	describe('buffer exhaustion guard', () => {
		it('kills the process and rejects once stdout exceeds the 10MB buffer cap', async () => {
			const script = "process.stdout.write('x'.repeat(11 * 1024 * 1024))";

			await expect(SafeExecutor.execute(process.execPath, ['-e', script])).rejects.toThrow(
				/exceeded maximum buffer size/
			);
		});
	});
});

describe('SafeExecutor.executeGit / executeGitSimple', () => {
	it('executeGit runs git with the given args', async () => {
		const result = await SafeExecutor.executeGit(['--version']);
		expect(result.stdout).toContain('git version');
	});

	it('executeGitSimple returns only stdout', async () => {
		const stdout = await SafeExecutor.executeGitSimple(['--version']);
		expect(stdout).toContain('git version');
	});
});

describe('SafeExecutor.commandExists', () => {
	it('returns true for a command that exists on PATH', async () => {
		await expect(SafeExecutor.commandExists('echo')).resolves.toBe(true);
	});

	it('returns false for a command that does not exist', async () => {
		await expect(SafeExecutor.commandExists('definitely-not-a-real-command-xyz')).resolves.toBe(false);
	});
});

describe('RetryExecutor.withRetry', () => {
	it('returns the result on first success without retrying', async () => {
		const fn = async () => 'ok';

		const result = await RetryExecutor.withRetry(fn, 3, 5);

		expect(result).toBe('ok');
	});

	it('retries a transient failure and succeeds on a later attempt', async () => {
		let calls = 0;
		const fn = async () => {
			calls++;
			if (calls < 3) throw new Error('temporary network failure');
			return 'recovered';
		};

		const result = await RetryExecutor.withRetry(fn, 3, 5);

		expect(result).toBe('recovered');
		expect(calls).toBe(3);
	});

	it('does not retry a non-retriable "validation" error — fails on the first attempt', async () => {
		let calls = 0;
		const fn = async () => {
			calls++;
			throw new Error('validation failed: bad input');
		};

		await expect(RetryExecutor.withRetry(fn, 3, 5)).rejects.toThrow('validation failed');
		expect(calls).toBe(1);
	});

	it.each(['already exists', 'not found', 'permission denied', 'access denied'])(
		'does not retry a non-retriable "%s" error',
		async (message) => {
			let calls = 0;
			const fn = async () => {
				calls++;
				throw new Error(message);
			};

			await expect(RetryExecutor.withRetry(fn, 3, 5)).rejects.toThrow(message);
			expect(calls).toBe(1);
		}
	);

	it('exhausts retries and throws a descriptive error for a persistently-failing retriable error', async () => {
		let calls = 0;
		const fn = async () => {
			calls++;
			throw new Error('temporary glitch');
		};

		await expect(RetryExecutor.withRetry(fn, 2, 5)).rejects.toThrow(/Operation failed after 2 retries/);
		expect(calls).toBe(3); // initial attempt + 2 retries
	});
});
