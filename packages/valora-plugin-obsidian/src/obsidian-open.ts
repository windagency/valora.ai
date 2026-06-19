import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

export interface OpenResult {
	browserUrl: string;
	error?: string;
	success: boolean;
	uri: string;
}

const DEVCONTAINER_VNC_URL = 'http://localhost:6080/vnc.html?resize=remote&autoconnect=1';
const OBSIDIAN_CONFIG_DIR = path.join(homedir(), '.config', 'obsidian');
const OBSIDIAN_CONFIG_PATH = path.join(OBSIDIAN_CONFIG_DIR, 'obsidian.json');

interface ObsidianConfig {
	vaults?: Record<string, ObsidianVault>;
}

interface ObsidianVault {
	open?: boolean;
	path: string;
	ts?: number;
}

export function buildBrowserUrl(vaultDir: string): string {
	if (existsSync('/.dockerenv')) return DEVCONTAINER_VNC_URL;
	return pathToFileURL(path.resolve(vaultDir)).toString();
}

export function buildObsidianUri(vaultDir: string): string {
	return `obsidian://open?vault=${encodeURIComponent(path.resolve(vaultDir))}`;
}

/**
 * Registers the vault in Obsidian's config and marks it as the active vault.
 * Obsidian opens the vault flagged `open: true` on startup without needing a
 * URI argument — the AppImage does not register the obsidian:// protocol handler
 * so passing a URI on the command line is unreliable.
 */
export function openObsidian(vaultDir: string): OpenResult {
	const uri = buildObsidianUri(vaultDir);
	const browserUrl = buildBrowserUrl(vaultDir);

	if (!existsSync(vaultDir)) {
		console.log(`Memory vault not found at ${vaultDir}. Run 'valora memory' to initialise it, then open: ${uri}`);
		return { browserUrl, error: 'vault-missing', success: false, uri };
	}

	if (process.platform === 'linux') {
		return openOnLinux(vaultDir, uri, browserUrl);
	}

	const { args, cmd } = platformCommand(uri);
	const result = spawnSync(cmd, args, { stdio: 'ignore' });

	if (result.error) {
		console.log(`Obsidian is not installed. Install it from https://obsidian.md/download`);
		console.log(`Open this URI manually: ${uri}`);
		return { browserUrl, error: result.error.message, success: false, uri };
	}

	logSuccessfulLaunch(uri, browserUrl);
	return { browserUrl, success: true, uri };
}

export function registerVaultWithObsidian(vaultDir: string): void {
	const resolved = path.resolve(vaultDir);
	let config: ObsidianConfig = {};

	if (existsSync(OBSIDIAN_CONFIG_PATH)) {
		try {
			config = JSON.parse(readFileSync(OBSIDIAN_CONFIG_PATH, 'utf-8')) as ObsidianConfig;
		} catch {
			// unreadable config — start fresh
		}
	}

	config.vaults ??= {};

	let targetId = Object.keys(config.vaults).find((id) => config.vaults![id]!.path === resolved);

	if (!targetId) {
		targetId = randomBytes(8).toString('hex');
		config.vaults[targetId] = { path: resolved, ts: Date.now() };
	}

	for (const [id, vault] of Object.entries(config.vaults)) {
		vault.open = id === targetId;
	}

	mkdirSync(OBSIDIAN_CONFIG_DIR, { recursive: true });
	writeFileSync(OBSIDIAN_CONFIG_PATH, JSON.stringify(config, null, 2));
}

// xdg-open requires the obsidian:// URI scheme to be registered, which AppImage does not do
// automatically. Register the vault in Obsidian's config and launch the binary directly.
function logSuccessfulLaunch(uri: string, browserUrl: string): void {
	console.log(`Obsidian URI: ${uri}`);
	console.log(`Browser URL: ${browserUrl}`);
	if (existsSync('/.dockerenv')) {
		console.log(
			'Tip: open the Browser URL in a standalone browser for keyboard input — ' +
				"VS Code's Simple Browser captures keys before noVNC. Click on the desktop once to give it focus."
		);
	}
}

function openOnLinux(vaultDir: string, uri: string, browserUrl: string): OpenResult {
	const check = spawnSync('which', ['obsidian'], { stdio: 'pipe' });
	if (check.status !== 0) {
		console.log(`Obsidian is not installed. Install it from https://obsidian.md/download`);
		console.log(`Open this URI manually: ${uri}`);
		return { browserUrl, error: 'not-installed', success: false, uri };
	}
	registerVaultWithObsidian(vaultDir);
	const child = spawn('obsidian', ['--appimage-extract-and-run', '--no-sandbox', '--disable-gpu'], {
		detached: true,
		stdio: 'ignore'
	});
	child.unref();
	logSuccessfulLaunch(uri, browserUrl);
	return { browserUrl, success: true, uri };
}

function platformCommand(uri: string): { args: string[]; cmd: string } {
	if (process.platform === 'darwin') return { args: [uri], cmd: 'open' };
	return { args: ['/c', 'start', '', uri], cmd: 'cmd' };
}
