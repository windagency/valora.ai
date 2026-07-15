import * as childProcess from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { getLogger } from 'output/logger';
import { getGlobalPluginsDir, getProjectPluginsDir, getSystemPluginsDir } from 'utils/paths';

import { fetchPackageTarball } from './npm-registry-client';
import { PluginLoaderService } from './plugin-loader.service';
import { assertValidPluginName, PLUGIN_MANIFEST_FILE } from './plugin-manifest.schema';

const { spawnSync } = childProcess;

export type InstalledPluginsLookup = (shortName: string) => boolean;
export type InstallScope = 'global' | 'project' | 'user';

export interface ProcessRunner {
	run(argv: string[], options?: { cwd?: string }): Promise<number>;
}

export class PluginInstallerService {
	constructor(
		private readonly runner: ProcessRunner,
		private readonly isPluginInstalled: InstalledPluginsLookup = defaultIsPluginInstalled
	) {}

	async install(pluginRef: string, scope: InstallScope, integrity?: string, version?: string): Promise<void> {
		await this.installWithVisited(pluginRef, scope, new Set<string>(), integrity, version);
	}

	async installFromTarball(tgzPath: string, scope: InstallScope): Promise<void> {
		assertSafeTarball(tgzPath);
		const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-tgz-staging-'));
		let targetDir: string | undefined;
		try {
			const code = await this.runner.run([
				'tar',
				'-xf',
				tgzPath,
				'--strip-components=1',
				'--no-same-owner',
				'--no-same-permissions',
				'-C',
				stagingDir
			]);
			if (code !== 0) throw new Error(`Failed to extract plugin from ${tgzPath}`);

			const manifest = readPluginManifest(stagingDir);
			if (!manifest.name) throw new Error('Plugin manifest is missing required field: name');
			assertValidPluginName(manifest.name);
			const shortName = manifest.name;

			targetDir = resolveTargetDir(scope, shortName);
			fs.mkdirSync(path.dirname(targetDir), { recursive: true });
			fs.rmSync(targetDir, { force: true, recursive: true });
			fs.cpSync(stagingDir, targetDir, { recursive: true });

			const visited = new Set<string>();
			for (const dep of manifest.requires ?? []) {
				await this.installWithVisited(dep, scope, visited);
			}
		} catch (err) {
			if (targetDir) fs.rmSync(targetDir, { force: true, recursive: true });
			if (scope === 'global' && isPermissionError(err)) {
				throw new Error('global scope requires elevated privileges — re-run with sudo or use --scope user');
			}
			throw err;
		} finally {
			fs.rmSync(stagingDir, { force: true, recursive: true });
		}
	}

	uninstall(pluginRef: string, scope: InstallScope): void {
		const shortName = shortNameFromPackage(resolvePackageName(pluginRef));
		const targetDir = resolveTargetDir(scope, shortName);
		if (!fs.existsSync(targetDir)) {
			throw new Error(`Plugin "${shortName}" is not installed in the ${scope} scope`);
		}
		fs.rmSync(targetDir, { force: true, recursive: true });
	}

	private async extractTarball(tmpDir: string, targetDir: string): Promise<void> {
		const tarball = fs.readdirSync(tmpDir).find((f) => f.endsWith('.tgz'));
		if (!tarball) throw new Error('npm pack produced no tarball');

		const tarballPath = path.join(tmpDir, tarball);
		assertSafeTarball(tarballPath);

		fs.mkdirSync(targetDir, { recursive: true });
		const code = await this.runner.run([
			'tar',
			'-xf',
			tarballPath,
			'--strip-components=1',
			'--no-same-owner',
			'--no-same-permissions',
			'-C',
			targetDir
		]);
		if (code !== 0) {
			throw new Error(`Failed to extract plugin to ${targetDir}`);
		}
	}

	private async packLocalDirectory(dirPath: string, destDir: string): Promise<void> {
		const code = await this.runner.run(['npm', 'pack', dirPath, '--pack-destination', destDir]);
		if (code !== 0) {
			throw new Error(`Failed to pack local plugin directory ${dirPath} (npm pack exited ${code.toString()})`);
		}
	}

	private async downloadRegistryTarball(packageName: string, version: string, destDir: string): Promise<void> {
		let buffer: Buffer;
		try {
			buffer = await fetchPackageTarball(packageName, version);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			throw new Error(`Failed to download ${packageName}: ${message}`);
		}
		fs.mkdirSync(destDir, { recursive: true });
		const fileName = `${shortNameFromPackage(packageName)}-${version}.tgz`;
		fs.writeFileSync(path.join(destDir, fileName), buffer);
	}

	private async installWithVisited(
		pluginRef: string,
		scope: InstallScope,
		visited: Set<string>,
		integrity?: string,
		version?: string
	): Promise<void> {
		const packageName = resolvePackageName(pluginRef);
		const shortName = shortNameFromPackage(packageName);

		if (visited.has(shortName)) return;
		visited.add(shortName);

		if (this.isPluginInstalled(shortName)) return;

		const localPath = resolveLocalPluginDir(shortName);
		const targetDir = resolveTargetDir(scope, shortName);
		const expectedIntegrity = resolveExpectedIntegrity(shortName, localPath, integrity);

		try {
			await this.materialize(packageName, localPath, version ?? 'latest', targetDir, expectedIntegrity);
			const manifest = readPluginManifest(targetDir);
			for (const dep of manifest.requires ?? []) {
				await this.installWithVisited(dep, scope, visited);
			}
		} catch (err) {
			handleInstallFailure(err, scope, targetDir);
		}
	}

	private async materialize(
		packageName: string,
		localPath: string | null,
		version: string,
		targetDir: string,
		expectedIntegrity?: string
	): Promise<void> {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-plugin-install-'));
		try {
			if (localPath) {
				await this.packLocalDirectory(localPath, tmpDir);
			} else {
				await this.downloadRegistryTarball(packageName, version, tmpDir);
			}
			if (expectedIntegrity) {
				const tarball = fs.readdirSync(tmpDir).find((f) => f.endsWith('.tgz'));
				if (!tarball) throw new Error('Pack step produced no tarball');
				verifyTarballIntegrity(path.join(tmpDir, tarball), expectedIntegrity);
			}
			await this.extractTarball(tmpDir, targetDir);
		} finally {
			fs.rmSync(tmpDir, { force: true, recursive: true });
		}
	}
}

/**
 * Compute a sha256 SRI string for a tarball. Format matches the `integrity`
 * field of npm and the registry.json entries: "sha256-<base64>".
 */
export function computeTarballIntegrity(tgzPath: string): string {
	const hash = createHash('sha256');
	hash.update(fs.readFileSync(tgzPath));
	return `sha256-${hash.digest('base64')}`;
}

/**
 * Verify that a tarball's sha256 matches the expected SRI string from the
 * registry. Throws on mismatch — the caller is responsible for cleaning up.
 */
export function verifyTarballIntegrity(tgzPath: string, expected: string): void {
	const actual = computeTarballIntegrity(tgzPath);
	if (actual !== expected) {
		throw new Error(
			`Plugin integrity check failed for ${tgzPath}. ` +
				`Expected ${expected}, got ${actual}. The downloaded tarball does not match the registry — refusing to install.`
		);
	}
}

/**
 * Walk the tarball entry list and refuse extraction if any entry is absolute
 * or contains a `..` segment. Tarslip mitigation independent of the host
 * `tar`'s default policy (which varies between BSD and GNU implementations).
 */
export function assertSafeTarball(tgzPath: string): void {
	const listing = childProcess.spawnSync('tar', ['-tf', tgzPath]);
	if (listing.status !== 0) {
		throw new Error(`Failed to list tarball entries from ${tgzPath}`);
	}
	const entries = String(listing.stdout)
		.split('\n')
		.map((e) => e.trim())
		.filter((e) => e.length > 0);
	for (const entry of entries) {
		if (entry.startsWith('/')) {
			throw new Error(`Refusing to extract ${tgzPath}: entry "${entry}" is an absolute path.`);
		}
		if (entry.split('/').some((segment) => segment === '..')) {
			throw new Error(`Refusing to extract ${tgzPath}: entry "${entry}" attempts to escape the staging directory.`);
		}
	}
}

export function peekTarballManifest(tgzPath: string): { name: string; version: string } {
	const result = spawnSync('tar', ['-xOf', tgzPath, 'package/valora-plugin.json']);
	if (result.status !== 0) throw new Error('Could not read manifest from tarball');
	const manifest = JSON.parse(result.stdout.toString()) as Record<string, unknown>;
	if (!manifest['name']) throw new Error('Manifest is missing required field: name');
	if (!manifest['version']) throw new Error('Manifest is missing required field: version');
	assertValidPluginName(manifest['name']);
	return { name: String(manifest['name']), version: String(manifest['version']) };
}

export function resolvePackageName(input: string): string {
	if (input.startsWith('@')) return input;
	if (input.startsWith('valora-')) return `@windagency/${input}`;
	return `@windagency/valora-plugin-${input}`;
}

export function shortNameFromPackage(packageName: string): string {
	return packageName.startsWith('@') ? (packageName.split('/')[1] ?? packageName) : packageName;
}

function defaultIsPluginInstalled(shortName: string): boolean {
	try {
		return new PluginLoaderService().isInstalled(shortName);
	} catch {
		return false;
	}
}

function isPermissionError(error: unknown): boolean {
	const code = (error as NodeJS.ErrnoException | null)?.code;
	return code === 'EACCES' || code === 'EPERM';
}

/**
 * Decide which integrity hash to verify the downloaded tarball against, and
 * warn when a registry-sourced install has no integrity available. Local-source
 * installs (`VALORA_PLUGIN_REGISTRY` developer workflow) deliberately skip the
 * check — packing a local directory is non-reproducible — and skip the warn so
 * developer iterations don't drown out real warnings.
 */
function resolveExpectedIntegrity(
	shortName: string,
	localPath: null | string,
	integrity: string | undefined
): string | undefined {
	if (localPath) return undefined;
	if (!integrity) {
		getLogger().warn(`Plugin "${shortName}" installed without integrity verification — registry entry has no SHA256.`, {
			shortName
		});
	}
	return integrity;
}

/**
 * Map a low-level install failure to the right user-facing error and clean up
 * the partially-written target directory. Centralised so callers (per-plugin
 * and dependency installs) take the same code path.
 */
function handleInstallFailure(err: unknown, scope: InstallScope, targetDir: string): never {
	if (scope === 'global' && isPermissionError(err)) {
		throw new Error('global scope requires elevated privileges — re-run with sudo or use --scope user');
	}
	fs.rmSync(targetDir, { force: true, recursive: true });
	throw err;
}

function readPluginManifest(pluginDir: string): { name?: string; requires?: string[] } {
	try {
		return JSON.parse(fs.readFileSync(path.join(pluginDir, PLUGIN_MANIFEST_FILE), 'utf-8')) as {
			name?: string;
			requires?: string[];
		};
	} catch {
		return {};
	}
}

function resolveLocalPluginDir(shortName: string): null | string {
	const registryFile = process.env['VALORA_PLUGIN_REGISTRY'];
	if (!registryFile) return null;
	try {
		const entries = JSON.parse(fs.readFileSync(registryFile, 'utf-8')) as Array<{
			name: string;
			path?: string;
		}>;
		const entry = entries.find((e) => e.name === shortName);
		if (!entry?.path) return null;
		// Paths are stored relative to the registry file, not the process CWD
		const resolved = path.resolve(path.dirname(registryFile), entry.path);
		return fs.existsSync(resolved) ? resolved : null;
	} catch {
		return null;
	}
}

function resolveTargetDir(scope: InstallScope, shortName: string): string {
	// Defence-in-depth: every caller is supposed to validate the name before
	// reaching here, but a path-join with a `..`-bearing name silently escapes
	// the scope dir. Re-check at the lowest layer so a forgotten upstream
	// validation never produces a privilege-escalation surface.
	assertValidPluginName(shortName);
	if (scope === 'global') {
		return path.join(getSystemPluginsDir(), shortName);
	}
	if (scope === 'user') {
		return path.join(getGlobalPluginsDir(), shortName);
	}
	const projectDir = getProjectPluginsDir() ?? path.join(process.cwd(), '.valora', 'plugins');
	return path.join(projectDir, shortName);
}
