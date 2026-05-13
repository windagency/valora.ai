/**
 * Path resolution utilities shared across Valora packages.
 *
 * Pure node-stdlib implementation: no host dependencies. Safe to consume
 * from any plugin package without dragging in cleanup, logging, or
 * config-loader transitive deps.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Get the root directory of the installed VALORA package.
 * Resolves from the compiled module location up to the directory containing
 * a `package.json` named `valora` (or `@windagency/valora`) AND a `data/` directory.
 */
export function getPackageRoot(): string {
	const currentFile = fileURLToPath(import.meta.url);
	let dir = path.dirname(currentFile);

	for (let i = 0; i < 12; i++) {
		const pkgPath = path.join(dir, 'package.json');
		const dataDir = path.join(dir, 'data');
		if (fs.existsSync(pkgPath) && fs.existsSync(dataDir)) {
			try {
				const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { name?: string };
				if (pkg.name === 'valora' || pkg.name === '@windagency/valora') {
					return dir;
				}
			} catch {
				// Invalid JSON, keep searching upward.
			}
		}

		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}

	// Fallback: assume two levels up from this compiled file.
	return path.resolve(path.dirname(currentFile), '..', '..');
}

/** Path to the package's built-in `data/` directory. */
export function getPackageDataDir(): string {
	return path.join(getPackageRoot(), 'data');
}

/**
 * Project-level `.valora/` configuration directory. Walks up from `process.cwd()`.
 * Returns null if not in a Valora project.
 */
export function getProjectConfigDir(): null | string {
	let dir = process.cwd();

	for (let i = 0; i < 20; i++) {
		const valoraDir = path.join(dir, '.valora');
		if (fs.existsSync(valoraDir) && fs.statSync(valoraDir).isDirectory()) {
			return valoraDir;
		}

		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}

	return null;
}

/**
 * Global user configuration directory: `~/.valora/` on Unix or
 * `%APPDATA%/valora/` on Windows. Override with `VALORA_GLOBAL_CONFIG_DIR`.
 */
export function getGlobalConfigDir(): string {
	const envOverride = process.env['VALORA_GLOBAL_CONFIG_DIR'];
	if (envOverride) return envOverride;
	if (process.platform === 'win32') {
		const appData = process.env['APPDATA'] ?? path.join(os.homedir(), 'AppData', 'Roaming');
		return path.join(appData, 'valora');
	}
	return path.join(os.homedir(), '.valora');
}

/**
 * Runtime data directory: project `.valora/` if present, otherwise global.
 */
export function getRuntimeDataDir(): string {
	const projectDir = getProjectConfigDir();
	return projectDir ?? getGlobalConfigDir();
}

/** Built-in plugins directory (`<package-root>/data/plugins`). */
export function getPackagePluginsDir(): string {
	return path.join(getPackageRoot(), 'data', 'plugins');
}

/** Path to the shipped plugin registry JSON file. */
export function getPluginRegistryPath(): string {
	return path.join(getPackagePluginsDir(), 'registry.json');
}

/** Global user plugins directory (`~/.valora/plugins/`). */
export function getGlobalPluginsDir(): string {
	return path.join(getGlobalConfigDir(), 'plugins');
}

/**
 * System-wide plugins directory. Override with `VALORA_SYSTEM_PLUGINS_DIR`.
 * Defaults: `/usr/local/share/valora/plugins` (Unix), `%PROGRAMDATA%/valora/plugins` (Windows).
 */
export function getSystemPluginsDir(): string {
	const envOverride = process.env['VALORA_SYSTEM_PLUGINS_DIR'];
	if (envOverride) return envOverride;
	if (process.platform === 'win32') {
		const programData = process.env['PROGRAMDATA'] ?? path.join('C:', 'ProgramData');
		return path.join(programData, 'valora', 'plugins');
	}
	return '/usr/local/share/valora/plugins';
}

/** Project-level plugins directory (`.valora/plugins/`), or null when not in a project. */
export function getProjectPluginsDir(): null | string {
	const projectDir = getProjectConfigDir();
	return projectDir ? path.join(projectDir, 'plugins') : null;
}

/** Read the current Valora package version from `package.json`. */
export function getValoraVersion(): string {
	const pkgPath = path.join(getPackageRoot(), 'package.json');
	try {
		const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version?: string };
		return pkg.version ?? '0.0.0';
	} catch {
		return '0.0.0';
	}
}

/** Returns true when any Valora config directory exists (project / user / system). */
export function hasAnyValoraConfig(): boolean {
	if (getProjectConfigDir() !== null) return true;
	if (fs.existsSync(getGlobalConfigDir())) return true;
	if (fs.existsSync(getSystemPluginsDir())) return true;
	return false;
}
