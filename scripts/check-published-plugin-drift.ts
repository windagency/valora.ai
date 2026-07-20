#!/usr/bin/env node
import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const DEFAULT_REGISTRY = 'https://registry.npmjs.org';

export type FetchPublishedManifest = (
	_packageName: string,
	_version: string,
	_registryUrl?: string
) => Promise<null | Record<string, unknown>>;

export interface PluginPackage {
	manifest: Record<string, unknown>;
	name: string;
	packageName: string;
	version: string;
}

export interface PublishedManifestDrift {
	local: Record<string, unknown>;
	name: string;
	packageName: string;
	published: Record<string, unknown>;
	version: string;
}

/**
 * Only `valora-plugin-*` directories with a `valora-plugin.json` are
 * discoverable plugins (see PluginDiscoveryService / ADR-012) — mirrors the
 * same filter `generate-plugin-registry.ts` uses so this scans exactly the
 * set of packages that `valora plugin add`/`update` can install.
 */
export function discoverPluginPackages(packagesDir: string): PluginPackage[] {
	const packages: PluginPackage[] = [];

	for (const dirName of readdirSync(packagesDir)) {
		if (!dirName.startsWith('valora-plugin-')) continue;

		const manifestPath = join(packagesDir, dirName, 'valora-plugin.json');
		if (!existsSync(manifestPath)) continue;

		let manifest: Record<string, unknown>;
		try {
			manifest = JSON.parse(readFileSync(manifestPath, 'utf-8').toString()) as Record<string, unknown>;
		} catch {
			continue;
		}

		const version = manifest['version'];
		if (typeof version !== 'string') continue;

		packages.push({ manifest, name: dirName, packageName: `@windagency/${dirName}`, version });
	}

	return packages;
}

/**
 * Fetches the `valora-plugin.json` actually packed inside the tarball npm
 * serves for `packageName@version` — not the registry's metadata about it.
 * Returns null whenever there's nothing to compare against: the version
 * isn't published yet, the registry is unreachable, or the tarball couldn't
 * be read. A null result is deliberately treated as "skip", not "no drift" —
 * callers must not mistake registry unavailability for a clean bill of health.
 */
export async function fetchPublishedManifest(
	packageName: string,
	version: string,
	registryUrl: string = DEFAULT_REGISTRY
): Promise<null | Record<string, unknown>> {
	let tarballUrl: string | undefined;
	try {
		const packumentRes = await fetch(`${registryUrl}/${packageName}/${version}`, {
			signal: AbortSignal.timeout(10000)
		});
		if (!packumentRes.ok) return null;
		const packument = (await packumentRes.json()) as { dist?: { tarball?: string } };
		tarballUrl = packument.dist?.tarball;
	} catch {
		return null;
	}
	if (!tarballUrl) return null;

	let buffer: Buffer;
	try {
		const tarballRes = await fetch(tarballUrl, { signal: AbortSignal.timeout(15000) });
		if (!tarballRes.ok) return null;
		buffer = Buffer.from(await tarballRes.arrayBuffer());
	} catch {
		return null;
	}

	const tmp = mkdtempSync(join(tmpdir(), 'valora-drift-check-'));
	try {
		const tgzPath = join(tmp, 'pkg.tgz');
		writeFileSync(tgzPath, buffer);
		// Extracts a single entry straight to stdout — no need to unpack the
		// whole tarball just to read one file (same technique as peekTarballManifest).
		const result = spawnSync('tar', ['-xOf', tgzPath, 'package/valora-plugin.json']);
		if (result.status !== 0) return null;
		return JSON.parse(result.stdout.toString()) as Record<string, unknown>;
	} catch {
		return null;
	} finally {
		rmSync(tmp, { force: true, recursive: true });
	}
}

/** Recursively sorts object keys so `deepEqual` compares content, not JSON field order. */
function deepEqual(a: unknown, b: unknown): boolean {
	return JSON.stringify(sortDeep(a)) === JSON.stringify(sortDeep(b));
}

function sortDeep(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortDeep);
	if (value !== null && typeof value === 'object') {
		return Object.keys(value as Record<string, unknown>)
			.sort()
			.reduce<Record<string, unknown>>((acc, key) => {
				acc[key] = sortDeep((value as Record<string, unknown>)[key]);
				return acc;
			}, {});
	}
	return value;
}

/**
 * Flags every package whose already-published tarball manifest content
 * differs from what's currently in source. A manual `npm publish` run from a
 * stale checkout can ship a version tag whose content silently doesn't match
 * source — cryptographic integrity checks (registry.json's sha256) faithfully
 * record whatever *is* published, so they can't catch this; only comparing
 * against source content can. `fetchManifest` is injectable so tests never
 * need a live network call.
 */
export async function findPublishedManifestDrift(
	packages: PluginPackage[],
	registryUrl?: string,
	fetchManifest: FetchPublishedManifest = fetchPublishedManifest
): Promise<PublishedManifestDrift[]> {
	const drifts: PublishedManifestDrift[] = [];

	for (const pkg of packages) {
		const published = await fetchManifest(pkg.packageName, pkg.version, registryUrl);
		if (published === null) continue;
		if (!deepEqual(published, pkg.manifest)) {
			drifts.push({
				local: pkg.manifest,
				name: pkg.name,
				packageName: pkg.packageName,
				published,
				version: pkg.version
			});
		}
	}

	return drifts;
}

async function main(): Promise<void> {
	const __dirname = dirname(fileURLToPath(import.meta.url));
	const repoRoot = resolve(__dirname, '..');
	const packagesDir = join(repoRoot, 'packages');
	const registryUrl = process.env['VALORA_NPM_REGISTRY_URL'];

	const packages = discoverPluginPackages(packagesDir);
	const drifts = await findPublishedManifestDrift(packages, registryUrl);

	if (drifts.length === 0) {
		console.log(`No drift: all ${String(packages.length)} published plugin manifests match source.`);
		return;
	}

	console.error(`${String(drifts.length)} plugin(s) have published content that no longer matches source:\n`);
	for (const drift of drifts) {
		console.error(`  ${drift.packageName}@${drift.version}`);
		console.error(`    published: ${JSON.stringify(drift.published)}`);
		console.error(`    source:    ${JSON.stringify(drift.local)}`);
	}
	console.error(`\nBump the version and republish — npm versions are immutable, this cannot be fixed in place.`);
	process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	await main();
}
