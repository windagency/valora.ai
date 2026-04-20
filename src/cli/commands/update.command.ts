/**
 * `valora update` command — check for, and install, a newer CLI version.
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

import type { Command } from 'commander';

import {
	detectPackageManager,
	getInstallCommand,
	type PackageManager,
} from 'updater/detect-package-manager';
import { isNewerVersion } from 'updater/compare';
import { fetchLatestVersion } from 'updater/registry';
import { readUpdateState, writeUpdateState } from 'updater/state';
import { getGlobalConfigDir } from 'utils/paths';

interface UpdateOptions {
	check?: boolean;
	force?: boolean;
}

const PACKAGE_MANAGERS: PackageManager[] = ['npm', 'pnpm', 'yarn', 'bun'];

function getCurrentVersion(): string {
	const require = createRequire(import.meta.url);
	const pkg = require('../../../package.json') as { version: string };
	return pkg.version;
}

function printAmbiguousPackageManager(): void {
	console.log('Could not detect package manager. Run one of:');
	for (const pm of PACKAGE_MANAGERS) {
		console.log(`  ${getInstallCommand(pm).join(' ')}`);
	}
}

function runInstall(argv: string[]): Promise<number> {
	return new Promise((resolve) => {
		const [cmd, ...args] = argv;
		if (!cmd) {
			resolve(1);
			return;
		}
		const child = spawn(cmd, args, { stdio: 'inherit' });
		child.on('exit', (code) => {
			resolve(code ?? 1);
		});
		child.on('error', () => {
			resolve(1);
		});
	});
}

export function configureUpdateCommand(program: Command): void {
	program
		.command('update')
		.description('Check for and install the latest Valora release')
		.option('--check', 'Check for updates without installing')
		.option('--force', 'Reinstall even if already on latest')
		.action(async (options: UpdateOptions) => {
			const currentVersion = getCurrentVersion();

			process.stdout.write('Checking for updates...\r');
			const latestVersion = await fetchLatestVersion(currentVersion);
			// Clear the spinner line
			process.stdout.write(' '.repeat('Checking for updates...'.length) + '\r');

			if (latestVersion === null) {
				console.log('Unable to check for updates. Check your connection or try again later.');
				return;
			}

			const hasUpdate = isNewerVersion(currentVersion, latestVersion);
			if (!hasUpdate && !options.force) {
				console.log(`Valora is already up to date (v${currentVersion}).`);
				return;
			}

			if (options.check) {
				console.log(`Update available: v${currentVersion} → v${latestVersion}`);
				console.log('Run: valora update');
				return;
			}

			const pm = detectPackageManager();
			if (pm === null) {
				printAmbiguousPackageManager();
				return;
			}

			const installArgv = getInstallCommand(pm);
			const exitCode = await runInstall(installArgv);

			if (exitCode === 0) {
				const stateDir = getGlobalConfigDir();
				const state = await readUpdateState(stateDir);
				await writeUpdateState(stateDir, {
					...state,
					latestVersion,
					lastSuccessAt: new Date().toISOString(),
					remindedForVersion: latestVersion,
					installedVersionAtCheck: currentVersion,
				});
				console.log(`✓ Updated to v${latestVersion}`);
				return;
			}

			console.log('Update failed. Retry manually:');
			console.log(`  ${installArgv.join(' ')}`);
			process.exit(exitCode);
		});
}
