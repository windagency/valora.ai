#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const packagesDir = join(repoRoot, 'packages');
const outputPath = join(repoRoot, 'data', 'plugins', 'registry.json');

interface PluginManifest {
	contributes?: string[];
	description?: string;
	name?: string;
	version?: string;
}

interface RegistryEntry {
	contributes: string[];
	description: string;
	name: string;
	package: string;
	path: string;
	version: string;
}

const entries: RegistryEntry[] = [];

for (const dirName of readdirSync(packagesDir)) {
	const manifestPath = join(packagesDir, dirName, 'valora-plugin.json');
	if (!existsSync(manifestPath)) continue;

	let manifest: PluginManifest;
	try {
		manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as PluginManifest;
	} catch {
		console.warn(`Skipping ${dirName}: could not parse valora-plugin.json`);
		continue;
	}

	entries.push({
		contributes: manifest.contributes ?? [],
		description: manifest.description ?? '',
		name: dirName,
		package: `@windagency/${dirName}`,
		path: `packages/${dirName}`,
		version: manifest.version ?? '0.0.0'
	});
}

entries.sort((a, b) => a.name.localeCompare(b.name));

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(entries, null, '\t') + '\n');

console.log(`Written ${String(entries.length)} entries to data/plugins/registry.json`);
