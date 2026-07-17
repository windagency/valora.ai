#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

import { computeIntegrity } from './compute-registry-integrity.ts';

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

interface PluginManifest {
	contributes?: string[];
	description?: string;
	name?: string;
	version?: string;
}

interface RegistryEntry {
	contributes: string[];
	description: string;
	integrity: string;
	name: string;
	package: string;
	path: string;
	version: string;
}

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
		console.warn(`Skipping ${dirName}: failed to compute integrity (${(err as Error).message})`);
		continue;
	}

	entries.push({
		contributes: manifest.contributes ?? [],
		description: manifest.description ?? '',
		integrity,
		name: dirName,
		package: packageName,
		// Relative to the registry file so it resolves correctly regardless of CWD
		path: relative(dirname(outputPath), packageDir),
		version
	});
}

entries.sort((a, b) => a.name.localeCompare(b.name));

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(entries, null, '\t') + '\n');

console.log(`Written ${String(entries.length)} entries (with sha256 integrity) to data/plugins/registry.json`);
