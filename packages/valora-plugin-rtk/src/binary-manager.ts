import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// Install script is the canonical source; it handles arch detection and PATH wiring.
const RTK_INSTALL_CMD = 'curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh';

export interface RtkBinaryManager {
	ensureInstalled(): Promise<void>;
	install(): Promise<void>;
	isInstalled(): Promise<boolean>;
}

type Executor = () => Promise<unknown>;

export class RtkBinaryManagerImpl implements RtkBinaryManager {
	private readonly checkRtk: Executor;
	private readonly runInstall: Executor;

	constructor(
		checkRtk: Executor = () => execFileAsync('rtk', ['--version']),
		runInstall: Executor = () => execFileAsync('sh', ['-c', RTK_INSTALL_CMD])
	) {
		this.checkRtk = checkRtk;
		this.runInstall = runInstall;
	}

	async ensureInstalled(): Promise<void> {
		if (await this.isInstalled()) return;
		await this.install();
	}

	async install(): Promise<void> {
		try {
			await this.runInstall();
		} catch (err) {
			throw new RtkInstallError(err);
		}
	}

	async isInstalled(): Promise<boolean> {
		try {
			await this.checkRtk();
			return true;
		} catch {
			return false;
		}
	}
}

export class RtkInstallError extends Error {
	constructor(cause: unknown) {
		super(`rtk installation failed: ${cause instanceof Error ? cause.message : String(cause)}`);
		this.name = 'RtkInstallError';
	}
}
