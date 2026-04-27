import { spawnSync } from 'node:child_process';
import * as path from 'node:path';

export interface OpenResult {
	error?: string;
	success: boolean;
	uri: string;
}

export function buildObsidianUri(vaultDir: string): string {
	return `obsidian://open?vault=${encodeURIComponent(path.resolve(vaultDir))}`;
}

export function openObsidian(vaultDir: string): OpenResult {
	const uri = buildObsidianUri(vaultDir);
	const { args, cmd } = platformCommand(uri);
	const result = spawnSync(cmd, args, { stdio: 'ignore' });

	if (result.error) {
		console.log(`Obsidian does not appear to be installed. Open this URI manually: ${uri}`);
		return { error: result.error.message, success: false, uri };
	}

	return { success: true, uri };
}

function platformCommand(uri: string): { args: string[]; cmd: string } {
	if (process.platform === 'darwin') return { args: [uri], cmd: 'open' };
	if (process.platform === 'win32') return { args: ['/c', 'start', '', uri], cmd: 'cmd' };
	return { args: [uri], cmd: 'xdg-open' };
}
