import * as fs from 'node:fs';
import * as path from 'node:path';

import { getPackageRoot } from 'utils/paths';

const TIMEOUT_MS = 5000;
const MAX_BYTES = 64 * 1024;

export interface RegistryEntry {
	contributes: string[];
	description: string;
	name: string;
	package: string;
	path?: string;
	version: string;
}

function getRemoteRegistryUrl(): null | string {
	try {
		const pkgPath = path.join(getPackageRoot(), 'package.json');
		const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
			repository?: { url?: string };
		};
		const repoUrl = pkg.repository?.url;
		if (!repoUrl) return null;
		const rawBase = repoUrl.replace('https://github.com/', 'https://raw.githubusercontent.com/');
		return `${rawBase}/main/data/plugins/registry.json`;
	} catch {
		return null;
	}
}

/**
 * Fetches the plugin registry from GitHub (default) or a local file
 * when VALORA_PLUGIN_REGISTRY is set to a path. Returns null on any failure.
 */
export async function fetchPluginRegistry(): Promise<null | RegistryEntry[]> {
	const localPath = process.env['VALORA_PLUGIN_REGISTRY'];
	if (localPath) return readLocalRegistry(localPath);
	return fetchRemoteRegistry();
}

async function fetchRemoteRegistry(): Promise<null | RegistryEntry[]> {
	const url = process.env['VALORA_PLUGIN_REGISTRY_URL'] ?? getRemoteRegistryUrl();
	if (!url) return null;
	try {
		const response = await fetch(url, {
			headers: { 'User-Agent': 'valora-cli' },
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
		if (!response.ok) return null;

		const text = await response.text();
		if (text.length > MAX_BYTES) return null;

		return parseRegistry(text);
	} catch {
		return null;
	}
}

function parseRegistry(text: string): null | RegistryEntry[] {
	try {
		return JSON.parse(text) as RegistryEntry[];
	} catch {
		return null;
	}
}

function readLocalRegistry(filePath: string): null | RegistryEntry[] {
	try {
		const text = fs.readFileSync(filePath, 'utf-8');
		return parseRegistry(text);
	} catch {
		return null;
	}
}
