#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

import { computeIntegrity, PublishedWithoutRegistryUrlError } from './compute-registry-integrity.ts';

export interface RegistryEntry {
	contributes: string[];
	description: string;
	integrity: string;
	name: string;
	package: string;
	path: string;
	version: string;
}

interface PluginManifest {
	contributes?: string[];
	description?: string;
	name?: string;
	version?: string;
}

/**
 * Builds registry entries for every discoverable `valora-plugin-*` package.
 *
 * A package whose integrity can't be safely computed for an ordinary reason
 * (unparsable manifest, local pack failure) is skipped with a warning — the
 * rest of the registry is still valid. But `PublishedWithoutRegistryUrlError`
 * means the operator forgot `VALORA_NPM_REGISTRY_URL` — a systemic
 * misconfiguration that would affect every already-published package, not
 * just this one — so it propagates and aborts the whole run instead of
 * silently shrinking the registry down to whatever packages happened to skip
 * cleanly.
 */
export async function buildRegistryEntries(packagesDir: string, registryUrl?: string): Promise<RegistryEntry[]> {
	const entries: RegistryEntry[] = [];

	for (const dirName of readdirSync(packagesDir)) {
		// Only `valora-plugin-*` directories are discoverable plugins (see
		// PluginDiscoveryService / ADR-012). Shared internal libraries such as
		// `valora-runtime` must never be swept into the installable registry even
		// if a stray manifest reappears.
		if (!dirName.startsWith('valora-plugin-')) continue;

		const packageDir = join(packagesDir, dirName);
		const manifestPath = join(packageDir, 'valora-plugin.json');
		if (!existsSync(manifestPath)) continue;

		let manifest: PluginManifest;
		try {
			manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as PluginManifest;
		} catch {
			console.warn(`Skipping ${dirName}: could not parse valora-plugin.json`);
			continue;
		}

		const packageName = `@windagency/${dirName}`;
		const version = manifest.version ?? '0.0.0';

		let integrity: string;
		try {
			integrity = await computeIntegrity(packageDir, packageName, version, registryUrl);
		} catch (err) {
			if (err instanceof PublishedWithoutRegistryUrlError) throw err;
			console.warn(`Skipping ${dirName}: failed to compute integrity (${(err as Error).message})`);
			continue;
		}

		entries.push({
			contributes: manifest.contributes ?? [],
			description: manifest.description ?? '',
			integrity,
			name: dirName,
			package: packageName,
			// Relative to data/plugins/registry.json so it resolves correctly regardless of CWD
			path: relative(join(dirname(packagesDir), 'data', 'plugins'), packageDir),
			version
		});
	}

	entries.sort((a, b) => a.name.localeCompare(b.name));
	return entries;
}

async function main(): Promise<void> {
	const __dirname = dirname(fileURLToPath(import.meta.url));
	const repoRoot = resolve(__dirname, '..');
	const packagesDir = join(repoRoot, 'packages');
	const outputPath = join(repoRoot, 'data', 'plugins', 'registry.json');

	// When set, integrity is computed by downloading from the live registry (matches
	// exactly what the installer downloads). Required when pnpm publish rewrites JSON
	// field order — otherwise pnpm pack locally and npm pack from registry diverge.
	// computeIntegrity() itself refuses to fall back to a local pack for a package
	// that's already published, so an operator can't forget to set this and silently
	// commit a hash the installer will never match.
	const registryUrl = process.env['VALORA_NPM_REGISTRY_URL'];

	let entries: RegistryEntry[];
	try {
		entries = await buildRegistryEntries(packagesDir, registryUrl);
	} catch (err) {
		if (err instanceof PublishedWithoutRegistryUrlError) {
			console.error(err.message);
			process.exit(1);
		}
		throw err;
	}

	mkdirSync(dirname(outputPath), { recursive: true });
	writeFileSync(outputPath, JSON.stringify(entries, null, '\t') + '\n');

	console.log(`Written ${String(entries.length)} entries (with sha256 integrity) to data/plugins/registry.json`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
	await main();
}
