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
 */
export function getGlobalConfigDir(): string {
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
