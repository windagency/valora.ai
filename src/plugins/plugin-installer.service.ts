import * as childProcess from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getToolIntegrityMonitor, type IntegrityCheckResult } from 'security/tool-integrity-monitor';

import { getLogger } from 'output/logger';
import { getGlobalPluginsDir, getProjectPluginsDir, getSystemPluginsDir } from 'utils/paths';

import { fetchPackageTarball } from './npm-registry-client';
import { PluginLoaderService } from './plugin-loader.service';
import {
	assertValidPluginName,
	PLUGIN_HOOKS_FILE,
	PLUGIN_MANIFEST_FILE,
	PLUGIN_MCPS_FILE,
	PLUGIN_NAME_REGEX
} from './plugin-manifest.schema';

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
		await this.installWithVisited(pluginRef, scope, new Set<string>(), integrity, version, false);
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
			checkPluginContentIntegrity(targetDir, shortName);

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
		const { shortName, targetDir } = resolveUninstallTarget(pluginRef, scope);
		if (!fs.existsSync(targetDir)) {
			throw new Error(`Plugin "${shortName}" is not installed in the ${scope} scope`);
		}
		fs.rmSync(targetDir, { force: true, recursive: true });
		// Without this, a legitimate reinstall of genuinely new content gets
		// falsely flagged as a rug-pull against the stale pre-uninstall baseline.
		getToolIntegrityMonitor().clearFingerprint(`plugin:${shortName}`);
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

	private async extractTarball(tmpDir: string, targetDir: string): Promise<void> {
		const tarball = fs.readdirSync(tmpDir).find((f) => f.endsWith('.tgz'));
		if (!tarball) throw new Error('npm pack produced no tarball');

		const tarballPath = path.join(tmpDir, tarball);
		assertSafeTarball(tarballPath);

		// Clear any pre-existing content first (matching installFromTarball()'s
		// already-correct behaviour) — otherwise a stale symlink left at the
		// destination from prior state could be followed rather than replaced
		// by whatever the new tarball writes there.
		fs.rmSync(targetDir, { force: true, recursive: true });
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

	private async installWithVisited(
		pluginRef: string,
		scope: InstallScope,
		visited: Set<string>,
		integrity?: string,
		version?: string,
		isDependency = true
	): Promise<void> {
		const packageName = resolvePackageName(pluginRef);
		const shortName = shortNameFromPackage(packageName);

		if (visited.has(shortName)) return;
		visited.add(shortName);

		// Only a *dependency* pulled in transitively via `requires` should be
		// skipped when already present elsewhere — the plugin the caller asked
		// to install() is the explicit target (e.g. `valora plugin update`
		// re-installing an already-installed plugin at a newer version) and must
		// always be materialized, never silently no-op.
		if (isDependency && this.isPluginInstalled(shortName)) return;

		const localPath = resolveLocalPluginDir(shortName);
		const targetDir = resolveTargetDir(scope, shortName);
		const expectedIntegrity = resolveExpectedIntegrity(shortName, localPath, integrity);

		try {
			await this.materialize(packageName, localPath, version ?? 'latest', targetDir, expectedIntegrity);
			checkPluginContentIntegrity(targetDir, shortName);
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
		localPath: null | string,
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

	private async packLocalDirectory(dirPath: string, destDir: string): Promise<void> {
		const code = await this.runner.run(['npm', 'pack', dirPath, '--pack-destination', destDir]);
		if (code !== 0) {
			throw new Error(`Failed to pack local plugin directory ${dirPath} (npm pack exited ${code.toString()})`);
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
 *
 * Name-only listing (`-tf`) is not enough on its own: a symlink or hardlink
 * entry can carry a perfectly safe-looking name while its link target points
 * anywhere on the host filesystem (another plugin's signing key, `/etc/passwd`,
 * etc.) — any later read through a manifest-declared path (codeEntrypoint,
 * validators[].module, ...) would follow that link. A FIFO entry is even
 * worse: a non-root tarball can create one, and reading it via `readFileSync`
 * with no writer on the other end blocks forever — a real denial of service.
 * A second, verbose listing (`-tvf`) exposes each entry's type via the
 * leading permission-string character (`-` regular file, `d` directory in
 * both GNU and BSD tar); anything else (symlink, hardlink, FIFO, socket,
 * device) is rejected. Allowlisting the two expected types, rather than
 * blocklisting each bad type as it's discovered, means a future/overlooked
 * special entry type is rejected by default. Checked separately from the name
 * scan below since parsing a real filename back out of the verbose columns is
 * unreliable (names may contain spaces).
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

	const verboseListing = childProcess.spawnSync('tar', ['-tvf', tgzPath]);
	if (verboseListing.status !== 0) {
		throw new Error(`Failed to list tarball entry types from ${tgzPath}`);
	}
	const verboseLines = String(verboseListing.stdout)
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
	for (const line of verboseLines) {
		const typeChar = line[0];
		if (typeChar !== '-' && typeChar !== 'd') {
			throw new Error(`Refusing to extract ${tgzPath}: entry "${line}" is not a regular file or directory.`);
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

/**
 * Read the contents of the manifest's declared `codeEntrypoint` and
 * `validators[].module` files, if any. Split out of
 * `computePluginFingerprintContent` to keep its cyclomatic complexity down.
 */
function readManifestDeclaredCodeContent(targetDir: string, manifestRaw: string): string {
	let content = '';
	try {
		const manifest = JSON.parse(manifestRaw) as {
			codeEntrypoint?: string;
			validators?: Array<{ module: string }>;
		};
		const declaredPaths = [manifest.codeEntrypoint, ...(manifest.validators ?? []).map((v) => v.module)].filter(
			(p): p is string => Boolean(p)
		);
		for (const declaredPath of declaredPaths) {
			const filePath = path.join(targetDir, declaredPath);
			if (fs.existsSync(filePath)) {
				content += fs.readFileSync(filePath, 'utf-8');
			}
		}
	} catch {
		// Malformed manifest JSON — still fingerprint hooks.json/mcps.json in the caller.
	}
	return content;
}

/**
 * `hooks.json`/`mcps.json` `command` fields aren't required to start with the
 * script path, or even name a recognised interpreter — `"true && bash
 * scripts/evil.sh"`, `"ruby scripts/evil.rb"`, `"npx tsx scripts/evil.ts"` all
 * really execute a referenced script. Trying to identify "the one script
 * token" by position or a fixed interpreter list is exactly what a
 * multi-command string or an unlisted interpreter defeats — scan every
 * non-flag token in the whole command string instead, and fingerprint any
 * that looks like a path (contains `/`) or a script file (known extension).
 * Inline one-liners with no file reference have nothing extra to fingerprint,
 * which is correct: there's no separate file to drift.
 */
function extractCommandScriptPaths(command: string): string[] {
	return command
		.trim()
		.split(/\s+/)
		.filter((token) => token && !token.startsWith('-'))
		.filter((token) => token.includes('/') || /\.(cjs|js|mjs|py|rb|sh|ts)$/.test(token));
}

/** Read every command-referenced script's content, scoped to stay within targetDir. */
function readReferencedScriptContent(targetDir: string, command: string): string {
	let content = '';
	for (const candidate of extractCommandScriptPaths(command)) {
		const filePath = path.join(targetDir, candidate);
		const relative = path.relative(targetDir, filePath);
		if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(filePath)) continue;
		try {
			content += fs.readFileSync(filePath, 'utf-8');
		} catch {
			// Unreadable — skip rather than fail the whole fingerprint.
		}
	}
	return content;
}

/** Extract every hook `command` string declared across PreToolUse/PostToolUse matchers. */
function extractHookCommands(hooksRaw: string): string[] {
	try {
		const parsed = JSON.parse(hooksRaw) as {
			hooks?: {
				PostToolUse?: Array<{ hooks?: Array<{ command?: string }> }>;
				PreToolUse?: Array<{ hooks?: Array<{ command?: string }> }>;
			};
		};
		const matchers = [...(parsed.hooks?.PreToolUse ?? []), ...(parsed.hooks?.PostToolUse ?? [])];
		return matchers
			.filter((m): m is { hooks: Array<{ command?: string }> } => Array.isArray(m.hooks))
			.flatMap((m) => m.hooks.map((h) => h.command))
			.filter((c): c is string => Boolean(c));
	} catch {
		return [];
	}
}

/** Extract every MCP server `command` string declared in mcps.json. */
function extractMcpCommands(mcpsRaw: string): string[] {
	try {
		const parsed = JSON.parse(mcpsRaw) as { servers?: Array<{ connection?: { command?: string } }> };
		return (parsed.servers ?? []).map((s) => s.connection?.command).filter((c): c is string => Boolean(c));
	} catch {
		return [];
	}
}

/**
 * Fingerprint content for rug-pull detection: the manifest, its declared code
 * entrypoint, declared validator modules, the `hooks.json`/`mcps.json` files
 * themselves, and any script file their `command` fields reference — the
 * executable-surface files a plugin can ship. Covering only the JSON text
 * would let an update swap the referenced script's actual content (the code
 * that runs on every tool call, for hooks) without tripping a fingerprint
 * change at all.
 */
export function computePluginFingerprintContent(targetDir: string): string {
	let content = '';

	try {
		content += fs.readFileSync(path.join(targetDir, PLUGIN_MANIFEST_FILE), 'utf-8');
	} catch {
		return content;
	}

	content += readManifestDeclaredCodeContent(targetDir, content);

	for (const filename of [PLUGIN_HOOKS_FILE, PLUGIN_MCPS_FILE]) {
		const filePath = path.join(targetDir, filename);
		if (!fs.existsSync(filePath)) continue;
		try {
			const raw = fs.readFileSync(filePath, 'utf-8');
			content += raw;
			const commands = filename === PLUGIN_HOOKS_FILE ? extractHookCommands(raw) : extractMcpCommands(raw);
			for (const command of commands) {
				content += readReferencedScriptContent(targetDir, command);
			}
		} catch {
			// Unreadable — skip rather than fail the whole fingerprint.
		}
	}

	return content;
}

/**
 * Fingerprint a plugin directory's content and compare it against the
 * last-known baseline for `plugin:${shortName}` — the same key format used
 * at install time, so a baseline set during install is found and compared
 * correctly here. Exported so `di/container.ts` can re-run this exact check
 * at plugin LOAD time (every `valora` startup), not just install time:
 * install-time-only checking left a tamper-after-install window where a
 * plugin's hooks.json/mcps.json/codeEntrypoint/validator modules could be
 * modified on disk after the one-time install check passed and would be
 * activated with full trust on every subsequent run, no re-verification.
 */
export function checkPluginContentDrift(pluginDir: string, shortName: string): IntegrityCheckResult {
	const content = computePluginFingerprintContent(pluginDir);
	return getToolIntegrityMonitor().checkContentIntegrity(`plugin:${shortName}`, content);
}

/**
 * Detect plugin rug-pull attempts at install time: fingerprint the installed
 * manifest + code entrypoint and compare against the last-known baseline. A
 * drift is logged as a critical security event (via ToolIntegrityMonitor)
 * and surfaced here as an installer-level warning so the operator sees it in
 * the CLI output.
 */
function checkPluginContentIntegrity(targetDir: string, shortName: string): void {
	const result = checkPluginContentDrift(targetDir, shortName);
	if (result.changed) {
		getLogger().warn(`Plugin "${shortName}" content changed since the last install — possible rug-pull`, {
			currentFingerprint: result.currentFingerprint,
			previousFingerprint: result.previousFingerprint,
			shortName
		});
	}
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

/**
 * `installFromTarball()` names the install directory after the manifest's raw
 * `name` field, which only has to be lowercase kebab-case — it need not follow
 * the @windagency/valora-plugin-<x> package-name convention that `install()`
 * and `resolvePackageName()` assume. Preferring the convention-derived
 * directory keeps the common case (npm-installed plugins) working exactly as
 * before; falling back to the raw ref as a literal directory name covers
 * tarball-installed plugins with a non-conventional manifest name, so their
 * fingerprint gets cleared under the same key it was stored under at install.
 */
function resolveUninstallTarget(pluginRef: string, scope: InstallScope): { shortName: string; targetDir: string } {
	const conventionalShortName = shortNameFromPackage(resolvePackageName(pluginRef));
	const conventionalDir = resolveTargetDir(scope, conventionalShortName);
	if (fs.existsSync(conventionalDir) || !PLUGIN_NAME_REGEX.test(pluginRef)) {
		return { shortName: conventionalShortName, targetDir: conventionalDir };
	}
	return { shortName: pluginRef, targetDir: resolveTargetDir(scope, pluginRef) };
}
