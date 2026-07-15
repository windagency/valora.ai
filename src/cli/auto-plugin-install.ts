import type { InstallScope, PluginInstallerService } from 'plugins/plugin-installer.service';
import type { OutdatedPlugin } from 'updater/plugin-compare';

import * as readline from 'node:readline';

import type { PluginAutoUpdateMode } from 'types/plugin.types';

export interface AutoInstallOptions {
	confirm?: ConfirmInstall;
	policy?: PluginAutoUpdateMode;
}

export type ConfirmInstall = (plugin: OutdatedPlugin) => Promise<boolean>;

export async function autoInstallOutdatedPlugins(
	installer: PluginInstallerService,
	outdatedPlugins: OutdatedPlugin[],
	options: AutoInstallOptions = {}
): Promise<void> {
	if (outdatedPlugins.length === 0) return;
	const policy: PluginAutoUpdateMode = options.policy ?? 'install';
	if (policy === 'check-only') {
		const names = outdatedPlugins
			.filter((p) => p.location !== 'npm')
			.map((p) => p.name)
			.join(', ');
		if (names) {
			process.stderr.write(
				`${String(outdatedPlugins.length)} plugin update(s) available: ${names}. Run \`valora plugin update\` to apply.\n`
			);
		}
		return;
	}
	for (const plugin of outdatedPlugins) {
		await autoInstallPlugin(installer, plugin, options);
	}
}

export async function autoInstallPlugin(
	installer: PluginInstallerService,
	plugin: OutdatedPlugin,
	options: AutoInstallOptions = {}
): Promise<void> {
	if (plugin.location === 'npm') {
		process.stderr.write(`Plugin ${plugin.name} has an update but is managed by your package manager.\n`);
		return;
	}

	const policy: PluginAutoUpdateMode = options.policy ?? 'install';

	if (policy === 'prompt') {
		const confirm = options.confirm ?? ttyConfirmInstall;
		const accepted = await confirm(plugin);
		if (!accepted) {
			process.stderr.write(`Skipped ${plugin.name} (declined).\n`);
			return;
		}
	}

	process.stderr.write(`Updating plugin ${plugin.name} to v${plugin.latestVersion}…\n`);
	try {
		await installer.install(plugin.name, plugin.location as InstallScope, plugin.integrity, plugin.latestVersion);
		process.stderr.write(`✓ Plugin ${plugin.name} updated.\n`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(`✗ Plugin ${plugin.name}: ${message}\n`);
	}
}

async function ttyConfirmInstall(plugin: OutdatedPlugin): Promise<boolean> {
	if (!process.stdin.isTTY || !process.stderr.isTTY) return false;
	const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
	const integritySuffix = plugin.integrity ? ' (verified by sha256)' : ' (no integrity check)';
	return new Promise((resolve) => {
		rl.question(
			`Update ${plugin.name} ${plugin.currentVersion} → ${plugin.latestVersion}${integritySuffix}? [y/N] `,
			(answer) => {
				rl.close();
				resolve(answer.trim().toLowerCase() === 'y');
			}
		);
	});
}
