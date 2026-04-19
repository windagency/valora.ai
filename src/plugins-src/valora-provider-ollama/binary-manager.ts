import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/** Executor signature used to check for the Ollama binary. */
type Executor = () => Promise<unknown>;

/**
 * Describes the ability to detect and assert the presence of the Ollama binary.
 */
export interface OllamaBinaryManager {
	/** Returns `true` if the `ollama` binary is reachable on PATH. */
	isInstalled(): Promise<boolean>;
	/**
	 * Resolves normally when `ollama` is installed.
	 * Throws {@link OllamaNotInstalledError} otherwise.
	 */
	assertInstalled(): Promise<void>;
}

/**
 * Thrown when the `ollama` binary cannot be found on PATH.
 */
export class OllamaNotInstalledError extends Error {
	constructor() {
		super('Ollama binary not found. Install from https://ollama.com and ensure it is on your PATH.');
		this.name = 'OllamaNotInstalledError';
	}
}

/**
 * Stateless utility that detects whether the `ollama` binary is available.
 *
 * The optional `executor` parameter enables dependency injection for testing;
 * production callers should use the zero-argument constructor.
 */
export class OllamaBinaryManagerImpl implements OllamaBinaryManager {
	private readonly executor: Executor;

	constructor(executor: Executor = () => execFileAsync('ollama', ['--version'])) {
		this.executor = executor;
	}

	/** Returns `true` when `ollama --version` exits with code 0. */
	async isInstalled(): Promise<boolean> {
		try {
			await this.executor();
			return true;
		} catch {
			return false;
		}
	}

	/** Throws {@link OllamaNotInstalledError} if the binary is not on PATH. */
	async assertInstalled(): Promise<void> {
		if (!(await this.isInstalled())) {
			throw new OllamaNotInstalledError();
		}
	}
}
