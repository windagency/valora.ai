/**
 * Detect which package manager owns the current global Valora install.
 */

export type PackageManager = 'bun' | 'npm' | 'pnpm' | 'yarn';

const PACKAGE = '@windagency/valora@latest';

/**
 * Inspects a normalised (forward-slash) path string and returns the package
 * manager whose store signature it contains, or null when nothing matches.
 *
 * Order is significant: pnpm must be checked before npm because pnpm uses
 * node_modules internally and would otherwise trigger the npm rule.
 */
export function detectFromPath(path: string): null | PackageManager {
	const normalised = path.replace(/\\/g, '/').toLowerCase();

	if (normalised.includes('.local/share/pnpm') || normalised.includes('/pnpm/')) {
		return 'pnpm';
	}
	if (normalised.includes('.bun/install/global') || normalised.includes('.bun/bin')) {
		return 'bun';
	}
	if (normalised.includes('/yarn/global') || normalised.includes('.config/yarn/global')) {
		return 'yarn';
	}
	if (normalised.includes('/lib/node_modules') || normalised.includes('/node_modules')) {
		return 'npm';
	}
	return null;
}

/**
 * Detects which package manager owns the current global Valora install.
 *
 * Uses `import.meta.url` as the primary signal (resolves to the actual module
 * file inside the package manager's global store) and falls back to
 * `process.execPath` when the module path does not match any known signature.
 *
 * Returns null when neither path matches a known package manager.
 */
export function detectPackageManager(): null | PackageManager {
	const fromMeta = detectFromPath(import.meta.url);
	if (fromMeta !== null) return fromMeta;

	return detectFromPath(process.execPath);
}

const INSTALL_COMMANDS: Record<PackageManager, string[]> = {
	bun: ['bun', 'install', '-g', PACKAGE],
	npm: ['npm', 'install', '-g', PACKAGE],
	pnpm: ['pnpm', 'add', '-g', PACKAGE],
	yarn: ['yarn', 'global', 'add', PACKAGE]
};

/**
 * Returns the install command (argv) for the given package manager.
 */
export function getInstallCommand(pm: PackageManager): string[] {
	return INSTALL_COMMANDS[pm];
}
