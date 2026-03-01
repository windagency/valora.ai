/**
 * Console Interceptor - Safely intercepts and captures console output
 *
 * Provides a clean abstraction for temporarily redirecting console.log and console.error
 * output during command execution. Ensures proper cleanup and prevents memory leaks.
 *
 * Used by MCP server to capture command output for structured responses.
 */

export class ConsoleInterceptor {
	private isActive = false;
	private originalError?: typeof console.error;
	private originalLog?: typeof console.log;
	private outputs: string[] = [];

	/**
	 * Starts intercepting console output
	 * Must be called before executing code that produces console output
	 */
	start(): void {
		if (this.isActive) {
			throw new Error('ConsoleInterceptor is already active');
		}

		this.outputs = [];

		this.originalLog = console.log;

		this.originalError = console.error;
		this.isActive = true;

		console.log = (...args: unknown[]) => this.captureLog(args);

		console.error = (...args: unknown[]) => this.captureError(args);
	}

	/**
	 * Stops intercepting console output and restores original console methods
	 * Must be called in finally block to ensure cleanup even on errors
	 */
	stop(): void {
		if (!this.isActive) {
			return; // Idempotent - safe to call multiple times
		}

		// Restore original console methods
		if (this.originalLog) {
			console.log = this.originalLog;
		}
		if (this.originalError) {
			console.error = this.originalError;
		}

		this.isActive = false;
	}

	/**
	 * Gets all captured output as a single string
	 * @returns Concatenated console output
	 */
	getOutput(): string {
		return this.outputs.join('\n');
	}

	/**
	 * Gets all captured output lines
	 * @returns Array of individual output lines
	 */
	getOutputLines(): string[] {
		return [...this.outputs];
	}

	/**
	 * Checks if interceptor is currently active
	 * @returns true if intercepting console output
	 */
	isIntercepting(): boolean {
		return this.isActive;
	}

	/**
	 * Clears captured output without stopping interception
	 */
	clear(): void {
		this.outputs = [];
	}

	/**
	 * Captures log output
	 */
	private captureLog(args: unknown[]): void {
		const output = args.join(' ');
		this.outputs.push(output);
		// Also output to original console for debugging/monitoring
		this.originalLog!(output);
	}

	/**
	 * Captures error output
	 */
	private captureError(args: unknown[]): void {
		const output = '[ERROR] ' + args.join(' ');
		this.outputs.push(output);
		// Also output to original console for debugging/monitoring
		this.originalError!(output);
	}
}
