/**
 * Detect which package manager owns the current global Valora install.
 */

export type PackageManager = 'bun' | 'npm' | 'pnpm' | 'yarn';

const PACKAGE = '@windagency/valora@latest';

/**
 * Inspects process.execPath to determine which package manager owns the
 * global install. Returns null when the path matches no known signature.
 */
export function detectPackageManager(): PackageManager | null {
	const execPath = process.execPath.toLowerCase();

	if (execPath.includes('.local/share/pnpm') || execPath.includes('/pnpm/')) {
		return 'pnpm';
	}
	if (execPath.includes('.bun/install/global')) {
		return 'bun';
	}
	if (execPath.includes('/yarn/global') || execPath.includes('.config/yarn/global')) {
		return 'yarn';
	}
	if (execPath.includes('/lib/node_modules') || execPath.includes('/node_modules')) {
		return 'npm';
	}
	return null;
}

/**
 * Returns the install command (argv) for the given package manager.
 */
export function getInstallCommand(pm: PackageManager): string[] {
	switch (pm) {
		case 'npm':
			return ['npm', 'install', '-g', PACKAGE];
		case 'pnpm':
			return ['pnpm', 'add', '-g', PACKAGE];
		case 'yarn':
			return ['yarn', 'global', 'add', PACKAGE];
		case 'bun':
			return ['bun', 'install', '-g', PACKAGE];
	}
}
