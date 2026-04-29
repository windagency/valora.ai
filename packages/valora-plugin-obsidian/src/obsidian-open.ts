import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

export interface OpenResult {
	browserUrl: string;
	error?: string;
	success: boolean;
	uri: string;
}

const DEVCONTAINER_VNC_URL = 'http://localhost:6080';

export function buildBrowserUrl(vaultDir: string): string {
	if (existsSync('/.dockerenv')) return DEVCONTAINER_VNC_URL;
	return pathToFileURL(path.resolve(vaultDir)).toString();
}

export function buildObsidianUri(vaultDir: string): string {
	return `obsidian://open?vault=${encodeURIComponent(path.resolve(vaultDir))}`;
}

export function openObsidian(vaultDir: string): OpenResult {
	const uri = buildObsidianUri(vaultDir);
	const browserUrl = buildBrowserUrl(vaultDir);

	if (!existsSync(vaultDir)) {
		console.log(`Memory vault not found at ${vaultDir}. Run 'valora memory' to initialise it, then open: ${uri}`);
		return { browserUrl, error: 'vault-missing', success: false, uri };
	}

	if (process.platform === 'linux') {
		return openOnLinux(uri, browserUrl);
	}

	const { args, cmd } = platformCommand(uri);
	const result = spawnSync(cmd, args, { stdio: 'ignore' });

	if (result.error) {
		console.log(`Obsidian is not installed. Install it from https://obsidian.md/download`);
		console.log(`Open this URI manually: ${uri}`);
		return { browserUrl, error: result.error.message, success: false, uri };
	}

	console.log(`Obsidian URI: ${uri}`);
	console.log(`Browser URL: ${browserUrl}`);
	return { browserUrl, success: true, uri };
}

// xdg-open requires the obsidian:// URI scheme to be registered, which AppImage does not do
// automatically. Run the obsidian binary directly as a detached process instead.
function openOnLinux(uri: string, browserUrl: string): OpenResult {
	const check = spawnSync('which', ['obsidian'], { stdio: 'pipe' });
	if (check.status !== 0) {
		console.log(`Obsidian is not installed. Install it from https://obsidian.md/download`);
		console.log(`Open this URI manually: ${uri}`);
		return { browserUrl, error: 'not-installed', success: false, uri };
	}
	const child = spawn('obsidian', ['--appimage-extract-and-run', '--no-sandbox', uri], {
		detached: true,
		stdio: 'ignore'
	});
	child.unref();
	console.log(`Obsidian URI: ${uri}`);
	console.log(`Browser URL: ${browserUrl}`);
	return { browserUrl, success: true, uri };
}

function platformCommand(uri: string): { args: string[]; cmd: string } {
	if (process.platform === 'darwin') return { args: [uri], cmd: 'open' };
	return { args: ['/c', 'start', '', uri], cmd: 'cmd' };
}
