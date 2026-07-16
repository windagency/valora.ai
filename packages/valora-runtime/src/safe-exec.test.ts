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

		it('escalates to SIGKILL when the process ignores SIGTERM, killing it well before it would exit naturally', async () => {
			// A single-process target (no forked grandchildren, unlike a shell
			// `sleep` subprocess — a forked grandchild would keep the stdio
			// pipes open independently of its parent's death, muddying what
			// this test is trying to isolate) that installs a real SIGTERM
			// handler doing nothing, so the process itself ignores SIGTERM and
			// keeps running via a repeating interval. `child.killed` becomes
			// true as soon as `.kill()` successfully *sends* a signal — not
			// when the process actually dies — so checking `!child.killed`
			// before force-killing is a no-op once SIGTERM has already been
			// sent. Bounding elapsed wall-clock time proves the process was
			// actually force-killed via SIGKILL, not that the promise merely
			// resolved once it eventually exited on its own.
			const ignoreTermScript = 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);';
			const start = Date.now();

			await expect(SafeExecutor.execute(process.execPath, ['-e', ignoreTermScript], { timeout: 100 })).rejects.toThrow(
				/timed out after 100ms/
			);

			const elapsedMs = Date.now() - start;
			// SIGKILL fires HEALTH_CHECK_INTERVAL_MS (5s) after SIGTERM; allow
			// generous scheduling slack while still proving this isn't running
			// indefinitely (the process would otherwise never exit on its own).
			expect(elapsedMs).toBeLessThan(8000);
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
