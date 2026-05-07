import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';

import { getLogger } from 'output/logger';
import { getPackageRoot, getPluginRegistryPath } from 'utils/paths';

const TIMEOUT_MS = 5000;
const MAX_BYTES = 64 * 1024;

const REGISTRY_ENTRY_SCHEMA = z.object({
	contributes: z.array(z.string()),
	description: z.string(),
	/**
	 * Subresource Integrity string for the plugin tarball, in `sha256-<base64>` form.
	 * Optional during the rollout window: missing entries cause the installer to log
	 * a warning but still proceed. Once all first-party plugins ship an integrity
	 * value, the optional() marker can be tightened.
	 */
	integrity: z
		.string()
		.regex(/^sha256-[A-Za-z0-9+/]{43}=$/)
		.optional(),
	name: z.string().min(1),
	package: z.string().min(1),
	path: z.string().optional(),
	version: z.string().regex(/^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/)
});

export type RegistryEntry = z.infer<typeof REGISTRY_ENTRY_SCHEMA>;

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
 * when VALORA_PLUGIN_REGISTRY is set to a path. Falls back to the
 * bundled registry when the remote fetch fails.
 */
export async function fetchPluginRegistry(): Promise<null | RegistryEntry[]> {
	const localPath = process.env['VALORA_PLUGIN_REGISTRY'];
	if (localPath) {
		getLogger().warn(
			`Plugin registry sourced from VALORA_PLUGIN_REGISTRY=${localPath}. ` +
				`If you did not set this, your shell environment may have been tampered with.`,
			{ override: 'VALORA_PLUGIN_REGISTRY', path: localPath }
		);
		return readLocalRegistry(localPath);
	}
	return (await fetchRemoteRegistry()) ?? readLocalRegistry(getPluginRegistryPath());
}

async function fetchRemoteRegistry(): Promise<null | RegistryEntry[]> {
	const overrideUrl = process.env['VALORA_PLUGIN_REGISTRY_URL'];
	if (overrideUrl) {
		getLogger().warn(
			`Plugin registry URL overridden by VALORA_PLUGIN_REGISTRY_URL=${overrideUrl}. ` +
				`If you did not set this, your shell environment may have been tampered with.`,
			{ override: 'VALORA_PLUGIN_REGISTRY_URL', url: overrideUrl }
		);
	}
	const url = overrideUrl ?? getRemoteRegistryUrl();
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
		const raw: unknown = JSON.parse(text);
		if (!Array.isArray(raw)) return null;
		return raw
			.map((item) => REGISTRY_ENTRY_SCHEMA.safeParse(item))
			.filter((r) => r.success)
			.map((r) => r.data);
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
