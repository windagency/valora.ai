import { execFile } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Pinned to rtk-ai/rtk v0.39.0 (commit 2fbc7514). Update both DEFAULT_INSTALL_URL
 * and DEFAULT_INSTALL_SHA256 together when bumping the upstream pin; a mismatch
 * fails closed with RtkInstallError.
 *
 * Maintainers can override either at runtime via the env vars
 * VALORA_PLUGIN_RTK_INSTALL_URL and VALORA_PLUGIN_RTK_INSTALL_SHA256, useful for
 * private mirrors or to test a candidate install script before pinning it.
 */
const RTK_INSTALL_COMMIT = '2fbc7514f6964acabcfac65501b8bb6b525e3aa8';
export const DEFAULT_INSTALL_URL = `https://raw.githubusercontent.com/rtk-ai/rtk/${RTK_INSTALL_COMMIT}/install.sh`;
export const DEFAULT_INSTALL_SHA256 = '0c46611d70d0eee64c43c6398f8b1fe057b7f0b052810bbeec09288898ba9a46';

export type RtkBinaryChecker = () => Promise<unknown>;
export interface RtkBinaryManager {
	ensureInstalled(): Promise<void>;
	install(): Promise<void>;
	isInstalled(): Promise<boolean>;
}
export interface RtkBinaryManagerOptions {
	checkRtk?: RtkBinaryChecker;
	downloadScript?: ScriptDownloader;
	executeScript?: ScriptExecutor;
	installSha256?: string;
	installUrl?: string;
}

export type ScriptDownloader = (_url: string) => Promise<string>;

export type ScriptExecutor = (_scriptPath: string) => Promise<unknown>;

export class RtkBinaryManagerImpl implements RtkBinaryManager {
	private readonly checkRtk: RtkBinaryChecker;
	private readonly downloadScript: ScriptDownloader;
	private readonly executeScript: ScriptExecutor;
	private readonly installSha256: string;
	private readonly installUrl: string;

	constructor(options: RtkBinaryManagerOptions = {}) {
		this.checkRtk = options.checkRtk ?? (() => execFileAsync('rtk', ['--version']));
		this.downloadScript = options.downloadScript ?? defaultDownloadScript;
		this.executeScript = options.executeScript ?? defaultExecuteScript;
		this.installUrl = options.installUrl ?? process.env['VALORA_PLUGIN_RTK_INSTALL_URL'] ?? DEFAULT_INSTALL_URL;
		this.installSha256 =
			options.installSha256 ?? process.env['VALORA_PLUGIN_RTK_INSTALL_SHA256'] ?? DEFAULT_INSTALL_SHA256;

		warnIfInstallScriptOverridden();
	}

	async ensureInstalled(): Promise<void> {
		if (await this.isInstalled()) return;
		await this.install();
	}

	async install(): Promise<void> {
		try {
			const script = await this.downloadScript(this.installUrl);
			this.verifyIntegrity(script);
			const { tmpDir, tmpFile } = writeScriptToTempFile(script);
			try {
				await this.executeScript(tmpFile);
			} finally {
				fs.rmSync(tmpDir, { force: true, recursive: true });
			}
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

	private verifyIntegrity(script: string): void {
		const actual = createHash('sha256').update(script).digest('hex');
		if (actual !== this.installSha256) {
			throw new Error(
				`RTK install script integrity check failed for ${this.installUrl}. ` +
					`Expected sha256 ${this.installSha256}, got ${actual}. ` +
					`Either the upstream has changed (update DEFAULT_INSTALL_SHA256 alongside DEFAULT_INSTALL_URL) ` +
					`or the download was tampered with — refusing to execute.`
			);
		}
	}
}

export class RtkInstallError extends Error {
	constructor(cause: unknown) {
		super(`rtk installation failed: ${cause instanceof Error ? cause.message : String(cause)}`);
		this.name = 'RtkInstallError';
	}
}

async function defaultDownloadScript(url: string): Promise<string> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to download ${url}: HTTP ${response.status.toString()}`);
	}
	return response.text();
}

async function defaultExecuteScript(scriptPath: string): Promise<unknown> {
	return execFileAsync('sh', [scriptPath]);
}

/**
 * Anyone who can set process env (a compromised .env, a poisoned CI
 * environment) can point the installer at an arbitrary script with a
 * matching hash, fully defeating the commit-pinned integrity check.
 * Make an active override loud rather than silent.
 */
function warnIfInstallScriptOverridden(): void {
	if (
		process.env['VALORA_PLUGIN_RTK_INSTALL_URL'] === undefined &&
		process.env['VALORA_PLUGIN_RTK_INSTALL_SHA256'] === undefined
	) {
		return;
	}
	console.warn(
		'[valora-plugin-rtk] Install script URL/SHA256 overridden via VALORA_PLUGIN_RTK_INSTALL_URL/' +
			'VALORA_PLUGIN_RTK_INSTALL_SHA256 — this bypasses the commit-pinned integrity check. ' +
			'Only expected for private-mirror testing.'
	);
}

/**
 * A pid+timestamp filename directly in the shared `os.tmpdir()` is
 * predictable and opened non-exclusively — on a multi-tenant filesystem,
 * another local process can pre-plant a symlink at the guessed path before
 * this runs, causing the write to follow it and clobber whatever it points
 * to. `mkdtempSync` creates a fresh, cryptographically-random directory that
 * can't be guessed in advance, closing that race.
 */
function writeScriptToTempFile(script: string): { tmpDir: string; tmpFile: string } {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-install-'));
	const tmpFile = path.join(tmpDir, 'install.sh');
	fs.writeFileSync(tmpFile, script, { mode: 0o700 });
	return { tmpDir, tmpFile };
}
