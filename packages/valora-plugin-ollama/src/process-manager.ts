import { type ChildProcess, spawn } from 'child_process';

/**
 * Thrown when the Ollama server fails to become reachable within the polling timeout.
 */
export class OllamaStartupError extends Error {
	constructor(baseUrl: string) {
		super(`Ollama server did not start within the expected time at ${baseUrl}.`);
		this.name = 'OllamaStartupError';
	}
}

/**
 * Manages the lifecycle of a background Ollama server process.
 */
export interface OllamaProcessManager {
	/** Ensures the ollama server is running. Starts it if not already up. */
	ensureRunning(_baseUrl: string): Promise<void>;
	/** Returns `true` if the server at `baseUrl` is reachable (GET /api/tags returns 2xx). */
	isRunning(_baseUrl: string): Promise<boolean>;
	/** Stops the managed process if we started it. No-op if externally managed. */
	stop(): Promise<void>;
}

/**
 * Concrete implementation that spawns `ollama serve` when the server is not reachable
 * and polls until it becomes ready.
 */
export class OllamaProcessManagerImpl implements OllamaProcessManager {
	private readonly pollDelayMs: number;
	private process: ChildProcess | null = null;

	constructor(pollDelayMs = 500) {
		this.pollDelayMs = pollDelayMs;
	}

	/** Returns `true` when a GET to `${baseUrl}/api/tags` responds with a 2xx status. */
	async isRunning(baseUrl: string): Promise<boolean> {
		try {
			const response = await globalThis.fetch(`${baseUrl}/api/tags`);
			return response.ok;
		} catch {
			return false;
		}
	}

	/** Starts `ollama serve` if the server is not already reachable, then waits until ready. */
	async ensureRunning(baseUrl: string): Promise<void> {
		if (await this.isRunning(baseUrl)) return;
		await this.startAndWait(baseUrl);
	}

	private startAndWait(baseUrl: string): Promise<void> {
		return new Promise((resolve, reject) => {
			let settled = false;
			const settle = (fn: () => void): void => {
				if (settled) return;
				settled = true;
				fn();
			};
			const child = spawn('ollama', ['serve'], { detached: false, stdio: 'ignore' });
			this.process = child;
			child.once('error', (err) => {
				this.process = null;
				settle(() => reject(err));
			});
			this.waitForReady(baseUrl).then(
				() => settle(resolve),
				(err: unknown) => settle(() => reject(err))
			);
		});
	}

	/** Sends SIGTERM to the managed process and waits for it to exit; no-op otherwise. */
	async stop(): Promise<void> {
		const child = this.process;
		if (!child) return;
		this.process = null;
		await new Promise<void>((resolve) => {
			child.once('close', () => resolve());
			child.kill('SIGTERM');
		});
	}

	private async waitForReady(baseUrl: string, maxAttempts = 20): Promise<void> {
		for (let i = 0; i < maxAttempts; i++) {
			if (await this.isRunning(baseUrl)) return;
			await sleep(this.pollDelayMs);
		}
		throw new OllamaStartupError(baseUrl);
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
