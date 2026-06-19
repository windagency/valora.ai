/**
 * `valora update` command — check for, and install, a newer CLI version.
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { isNewerVersion } from 'updater/compare';
import { detectPackageManager, getInstallCommand, type PackageManager } from 'updater/detect-package-manager';
import { fetchLatestVersion } from 'updater/registry';
import { readUpdateState, writeUpdateState } from 'updater/state';

import type { Command } from 'cli/commander-adapter';

import { getGlobalConfigDir } from 'utils/paths';

interface UpdateOptions {
	check?: boolean;
	force?: boolean;
}

const PACKAGE_MANAGERS: PackageManager[] = ['npm', 'pnpm', 'yarn', 'bun'];

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
				handleCheckOnly(currentVersion, latestVersion);
				return;
			}
			await handleInstall(currentVersion, latestVersion);
		});
}

export async function persistUpdateSuccess(
	stateDir: string,
	currentVersion: string,
	latestVersion: string
): Promise<void> {
	const state = await readUpdateState(stateDir);
	const nowIso = new Date().toISOString();
	await writeUpdateState(stateDir, {
		...state,
		installedVersionAtCheck: currentVersion,
		lastCheckAt: nowIso,
		lastSuccessAt: nowIso,
		latestVersion,
		latestVersionFetchedAt: nowIso,
		remindedForVersion: latestVersion
	});
}

function getCurrentVersion(): string {
	const require = createRequire(import.meta.url);
	const pkg = require('../../../package.json') as { version: string };
	return pkg.version;
}

function handleCheckOnly(currentVersion: string, latestVersion: string): void {
	const hasUpdate = isNewerVersion(currentVersion, latestVersion);
	if (hasUpdate) {
		console.log(`Update available: v${currentVersion} → v${latestVersion}`);
		console.log('Run: valora update');
	} else {
		console.log(`Valora is already up to date (v${currentVersion}).`);
	}
}

async function handleInstall(currentVersion: string, latestVersion: string): Promise<void> {
	const pm = detectPackageManager();
	if (pm === null) {
		printAmbiguousPackageManager();
		return;
	}

	const installArgv = getInstallCommand(pm);
	const exitCode = await runInstall(installArgv);

	if (exitCode === 0) {
		await persistUpdateSuccess(getGlobalConfigDir(), currentVersion, latestVersion);
		console.log(`✓ Updated to v${latestVersion}`);
		return;
	}

	console.log('Update failed. Retry manually:');
	console.log(`  ${installArgv.join(' ')}`);
	process.exit(exitCode);
}

function printAmbiguousPackageManager(): void {
	console.log('Could not detect package manager. Run one of:');
	PACKAGE_MANAGERS.forEach((pm) => console.log(`  ${getInstallCommand(pm).join(' ')}`));
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
