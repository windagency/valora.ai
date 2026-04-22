import type { InstallScope, PluginInstallerService } from 'plugins/plugin-installer.service';
import type { OutdatedPlugin } from 'updater/plugin-compare';

export async function autoInstallOutdatedPlugins(
	installer: PluginInstallerService,
	outdatedPlugins: OutdatedPlugin[]
): Promise<void> {
	if (outdatedPlugins.length === 0) return;
	for (const plugin of outdatedPlugins) {
		await autoInstallPlugin(installer, plugin);
	}
}

export async function autoInstallPlugin(installer: PluginInstallerService, plugin: OutdatedPlugin): Promise<void> {
	if (plugin.location === 'npm') {
		process.stderr.write(`Plugin ${plugin.name} has an update but is managed by your package manager.\n`);
		return;
	}
	process.stderr.write(`Updating plugin ${plugin.name} to v${plugin.latestVersion}…\n`);
	try {
		await installer.install(plugin.name, plugin.location as InstallScope);
		process.stderr.write(`✓ Plugin ${plugin.name} updated.\n`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(`✗ Plugin ${plugin.name}: ${message}\n`);
	}
}
