#!/usr/bin/env node
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
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
	integrity: string;
	name: string;
	package: string;
	path: string;
	version: string;
}

function computeIntegrity(packageDir: string): string {
	const tmp = mkdtempSync(join(tmpdir(), 'valora-registry-pack-'));
	try {
		const pack = spawnSync('npm', ['pack', packageDir, '--pack-destination', tmp, '--silent'], {
			cwd: repoRoot,
			encoding: 'utf-8'
		});
		if (pack.status !== 0) {
			throw new Error(`npm pack failed for ${packageDir}: ${pack.stderr}`);
		}
		const tarball = readdirSync(tmp).find((f) => f.endsWith('.tgz'));
		if (!tarball) {
			throw new Error(`npm pack produced no tarball for ${packageDir}`);
		}
		const hash = createHash('sha256');
		hash.update(readFileSync(join(tmp, tarball)));
		return `sha256-${hash.digest('base64')}`;
	} finally {
		rmSync(tmp, { force: true, recursive: true });
	}
}

const entries: RegistryEntry[] = [];

for (const dirName of readdirSync(packagesDir)) {
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

	let integrity: string;
	try {
		integrity = computeIntegrity(packageDir);
	} catch (err) {
		console.warn(`Skipping ${dirName}: failed to compute integrity (${(err as Error).message})`);
		continue;
	}

	entries.push({
		contributes: manifest.contributes ?? [],
		description: manifest.description ?? '',
		integrity,
		name: dirName,
		package: `@windagency/${dirName}`,
		path: `packages/${dirName}`,
		version: manifest.version ?? '0.0.0'
	});
}

entries.sort((a, b) => a.name.localeCompare(b.name));

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(entries, null, '\t') + '\n');

console.log(`Written ${String(entries.length)} entries (with sha256 integrity) to data/plugins/registry.json`);
