import { spawn } from 'node:child_process';

import { detectPackageManager, getInstallCommand } from './detect-package-manager';

export type InstallResult = 'failure' | 'no-pm' | 'success';

/**
 * Detects the active package manager and runs a silent global install of the
 * latest Valora release. Intended for background auto-update use only.
 */
export async function runAutoInstall(): Promise<InstallResult> {
	const pm = detectPackageManager();
	if (pm === null) return 'no-pm';

	const [cmd, ...args] = getInstallCommand(pm);
	if (!cmd) return 'failure';

	return new Promise((resolve) => {
		const child = spawn(cmd, args, { stdio: 'pipe' });
		child.on('exit', (code) => resolve(code === 0 ? 'success' : 'failure'));
		child.on('error', () => resolve('failure'));
	});
}
