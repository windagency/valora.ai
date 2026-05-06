/**
 * Path resolution utilities for VALORA package
 *
 * Provides functions to locate:
 * - Package built-in resources (data/ directory shipped with the npm package)
 * - Project-level overrides (.valora/ directory in the user's project)
 * - Global user configuration (~/.valora/)
 * - Runtime data directories (sessions, logs, cache)
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';

/**
 * Get the root directory of the installed VALORA package.
 * Resolves from the compiled module location up to the directory containing
 * package.json with name "valora" AND a data/ directory (to distinguish from dist/ copy).
 */
export function getPackageRoot(): string {
	const currentFile = fileURLToPath(import.meta.url);
	let dir = path.dirname(currentFile);

	// Walk up from the compiled file (dist/utils/paths.js) to find the package root
	// The package root contains package.json with name "valora" AND a data/ directory
	for (let i = 0; i < 10; i++) {
		const pkgPath = path.join(dir, 'package.json');
		const dataDir = path.join(dir, 'data');
		if (fs.existsSync(pkgPath) && fs.existsSync(dataDir)) {
			try {
				const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { name?: string };
				if (pkg.name === 'valora' || pkg.name === '@windagency/valora') {
					return dir;
				}
			} catch {
				// Invalid JSON, keep searching
			}
		}

		const parent = path.dirname(dir);
		if (parent === dir) break; // Reached filesystem root
		dir = parent;
	}

	// Fallback: assume we're in dist/utils/ and package root is two levels up
	return path.resolve(path.dirname(currentFile), '..', '..');
}

/**
 * Get the path to the package's built-in data directory.
 * Contains agents, commands, prompts, templates, hooks, and default configs.
 */
export function getPackageDataDir(): string {
	return path.join(getPackageRoot(), 'data');
}

/**
 * Get the project-level .valora/ configuration directory.
 * Walks up from process.cwd() looking for a .valora/ directory.
 * Returns null if not found (not in a project context).
 */
export function getProjectConfigDir(): null | string {
	let dir = process.cwd();

	for (let i = 0; i < 20; i++) {
		const valoraDir = path.join(dir, '.valora');
		if (fs.existsSync(valoraDir) && fs.statSync(valoraDir).isDirectory()) {
			return valoraDir;
		}

		const parent = path.dirname(dir);
		if (parent === dir) break; // Reached filesystem root
		dir = parent;
	}

	return null;
}

/**
 * Get the global user configuration directory.
 * Returns ~/.valora/ on Unix or %APPDATA%/valora/ on Windows.
 * Override with VALORA_GLOBAL_CONFIG_DIR for testing or custom deployments.
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
 * Get the runtime data directory for sessions, logs, cache, etc.
 * Uses .valora/ in project context, or ~/.valora/ globally.
 */
export function getRuntimeDataDir(): string {
	const projectDir = getProjectConfigDir();
	return projectDir ?? getGlobalConfigDir();
}

/**
 * Get the package's built-in plugins directory.
 */
export function getPackagePluginsDir(): string {
	return path.join(getPackageRoot(), 'data', 'plugins');
}

/**
 * Get the path to the shipped plugin registry JSON file.
 */
export function getPluginRegistryPath(): string {
	return path.join(getPackagePluginsDir(), 'registry.json');
}

/**
 * Get the global user plugins directory (~/.valora/plugins/).
 */
export function getGlobalPluginsDir(): string {
	return path.join(getGlobalConfigDir(), 'plugins');
}

/**
 * Get the system-wide plugins directory, accessible to all users on the machine.
 * Override with VALORA_SYSTEM_PLUGINS_DIR for testing or custom deployments.
 * Defaults: /usr/local/share/valora/plugins (Unix/macOS), %PROGRAMDATA%\valora\plugins (Windows).
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

/**
 * Get the project-level plugins directory (.valora/plugins/).
 * Returns null if not in a project context.
 */
export function getProjectPluginsDir(): null | string {
	const projectDir = getProjectConfigDir();
	return projectDir ? path.join(projectDir, 'plugins') : null;
}

/**
 * Get the current package version from package.json at the package root.
 */
export function getValoraVersion(): string {
	const pkgPath = path.join(getPackageRoot(), 'package.json');
	try {
		const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version?: string };
		return pkg.version ?? '0.0.0';
	} catch {
		return '0.0.0';
	}
}

/**
 * Returns true if a Valora configuration directory exists in any scope
 * (project, user, or system). Used to detect a first-time install.
 */
export function hasAnyValoraConfig(): boolean {
	if (getProjectConfigDir() !== null) return true;
	if (fs.existsSync(getGlobalConfigDir())) return true;
	if (fs.existsSync(getSystemPluginsDir())) return true;
	return false;
}
