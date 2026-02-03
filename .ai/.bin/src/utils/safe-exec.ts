/**
 * Safe Execution Utilities - Prevent command injection
 *
 * Provides safe wrappers for executing git commands without shell injection risks
 */

import { spawn } from 'child_process';
import { COMMAND_EXISTENCE_CHECK_TIMEOUT_MS, HEALTH_CHECK_INTERVAL_MS } from 'config/constants';

export interface ExecResult {
	exitCode: number;
	stderr: string;
	stdout: string;
}

export interface SpawnOptions {
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	timeout?: number; // milliseconds
}

/**
 * Custom error class for command execution failures
 */
export class CommandExecutionError extends Error {
	constructor(
		message: string,
		public readonly exitCode: number,
		public readonly stdout: string,
		public readonly stderr: string
	) {
		super(message);
		this.name = 'CommandExecutionError';
	}
}

/**
 * Safe command execution without shell
 *
 * Uses spawn with argument array instead of shell interpolation
 * to prevent command injection attacks
 */
export class SafeExecutor {
	/**
	 * Default timeout for git operations (30 seconds)
	 */
	private static readonly DEFAULT_TIMEOUT = 30000;

	/**
	 * Maximum buffer size for stdout/stderr (10MB)
	 */
	private static readonly MAX_BUFFER_SIZE = 10 * 1024 * 1024;

	/**
	 * Execute git command safely
	 *
	 * @param args - Command arguments (e.g., ['worktree', 'add', '-b', branch])
	 * @param options - Spawn options
	 * @returns Command output
	 */
	static async executeGit(args: string[], options: SpawnOptions = {}): Promise<ExecResult> {
		return this.execute('git', args, options);
	}

	/**
	 * Execute command safely using spawn
	 *
	 * @param command - Command to execute (e.g., 'git')
	 * @param args - Command arguments
	 * @param options - Spawn options
	 * @returns Command output
	 */
	static async execute(command: string, args: string[], options: SpawnOptions = {}): Promise<ExecResult> {
		return new Promise((resolve, reject) => {
			const timeout = options.timeout ?? this.DEFAULT_TIMEOUT;
			let stdout = '';
			let stderr = '';
			let timedOut = false;

			// Spawn process without shell
			const child = spawn(command, args, {
				cwd: options.cwd,
				env: options.env,
				shell: false, // CRITICAL: Never use shell
				stdio: ['ignore', 'pipe', 'pipe']
			});

			// Set timeout
			const timer = setTimeout(() => {
				timedOut = true;
				child.kill('SIGTERM');

				// Force kill after interval if still running
				setTimeout(() => {
					if (!child.killed) {
						child.kill('SIGKILL');
					}
				}, HEALTH_CHECK_INTERVAL_MS);
			}, timeout);

			// Collect stdout
			child.stdout?.on('data', (data: Buffer) => {
				stdout += data.toString();

				// Prevent memory exhaustion
				if (stdout.length > this.MAX_BUFFER_SIZE) {
					child.kill('SIGTERM');
					reject(new Error('Command output exceeded maximum buffer size'));
				}
			});

			// Collect stderr
			child.stderr?.on('data', (data: Buffer) => {
				stderr += data.toString();

				// Prevent memory exhaustion
				if (stderr.length > this.MAX_BUFFER_SIZE) {
					child.kill('SIGTERM');
					reject(new Error('Command error output exceeded maximum buffer size'));
				}
			});

			// Handle completion
			child.on('close', (code: null | number) => {
				clearTimeout(timer);

				if (timedOut) {
					reject(new Error(`Command timed out after ${timeout}ms`));
					return;
				}

				const exitCode = code ?? -1;

				// Git commands that write to stderr even on success
				const successWithStderr = stderr && (stderr.includes('Preparing worktree') || stderr.includes('Switched to'));

				if (exitCode === 0 || successWithStderr) {
					resolve({
						exitCode,
						stderr,
						stdout
					});
				} else {
					const error = new CommandExecutionError(
						`Command failed with exit code ${exitCode}: ${stderr || stdout}`,
						exitCode,
						stdout,
						stderr
					);
					reject(error);
				}
			});

			// Handle errors
			child.on('error', (error: Error) => {
				clearTimeout(timer);
				reject(new Error(`Failed to execute ${command}: ${error.message}`));
			});
		});
	}

	/**
	 * Execute git command and return stdout only
	 *
	 * Convenience method for common case
	 */
	static async executeGitSimple(args: string[], options: SpawnOptions = {}): Promise<string> {
		const result = await this.executeGit(args, options);
		return result.stdout;
	}

	/**
	 * Check if command exists
	 */
	static async commandExists(command: string): Promise<boolean> {
		try {
			await this.execute('which', [command], { timeout: COMMAND_EXISTENCE_CHECK_TIMEOUT_MS });
			return true;
		} catch {
			return false;
		}
	}
}

/**
 * Retry wrapper for transient failures
 */
export class RetryExecutor {
	/**
	 * Execute with exponential backoff retry
	 *
	 * @param fn - Function to execute
	 * @param maxRetries - Maximum retry attempts
	 * @param baseDelay - Base delay in milliseconds
	 * @returns Function result
	 */
	static async withRetry<T>(fn: () => Promise<T>, maxRetries: number = 3, baseDelay: number = 1000): Promise<T> {
		let lastError: Error | null = null;

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				return await fn();
			} catch (error) {
				lastError = error as Error;

				// Don't retry on validation errors or non-transient errors
				if (this.isNonRetriableError(error as Error)) {
					throw error;
				}

				// Don't retry on last attempt
				if (attempt === maxRetries) {
					break;
				}

				// Exponential backoff with jitter
				const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
				await this.sleep(delay);
			}
		}

		throw new Error(`Operation failed after ${maxRetries} retries: ${lastError?.message}`);
	}

	/**
	 * Check if error is retriable
	 */
	private static isNonRetriableError(error: Error): boolean {
		const message = error.message.toLowerCase();

		// Validation errors - don't retry
		if (message.includes('validation') || message.includes('invalid')) {
			return true;
		}

		// Path/branch already exists - don't retry
		if (message.includes('already exists') || message.includes('not found')) {
			return true;
		}

		// Permission errors - don't retry
		if (message.includes('permission denied') || message.includes('access denied')) {
			return true;
		}

		return false;
	}

	/**
	 * Sleep for specified milliseconds
	 */
	private static sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
