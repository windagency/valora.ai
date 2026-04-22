import { spawn } from 'node:child_process';
import { type InstallScope, PluginInstallerService, type ProcessRunner } from 'plugins/plugin-installer.service';
import { PluginLoaderService } from 'plugins/plugin-loader.service';
import { fetchPluginRegistry } from 'plugins/plugin-registry.service';

import type { CommandAdapter } from 'cli/command-adapter.interface';
import type { CataloguedPlugin } from 'types/plugin.types';

import { getConfigLoader } from 'config/loader';
import { type ColorAdapter, getColorAdapter } from 'output/color-adapter.interface';

const VALID_SCOPES: InstallScope[] = ['global', 'project', 'user'];

interface PluginInstallOptions extends Record<string, unknown> {
	scope?: string;
}

const spawnRunner: ProcessRunner = {
	run: (argv: string[], options?: { cwd?: string }): Promise<number> =>
		new Promise((resolve) => {
			const [cmd, ...args] = argv;
			if (!cmd) {
				resolve(1);
				return;
			}
			const child = spawn(cmd, args, { cwd: options?.cwd, stdio: 'inherit' });
			child.on('exit', (code) => resolve(code ?? 1));
			child.on('error', () => resolve(1));
		})
};

export function configurePluginCommand(program: CommandAdapter): void {
	const pluginCmd = program.command('plugin').description('Manage Valora plugins');

	pluginCmd
		.command('add')
		.description('Download and install a plugin from the npm registry')
		.argument('<name>', 'Plugin name (e.g. compression-universal) or full npm package')
		.option(
			'--scope <scope>',
			'Installation scope: user (default), project, or global (system-wide, requires elevated privileges)',
			'user'
		)
		.action(async (...args: Array<Record<string, unknown>>) => {
			const name = args[0] as unknown as string;
			const options = args[1] as unknown as PluginInstallOptions;
			const scope = options.scope ?? 'user';

			if (!VALID_SCOPES.includes(scope as InstallScope)) {
				console.error(`Invalid scope "${scope}". Must be one of: ${VALID_SCOPES.join(', ')}.`);
				process.exit(1);
				return;
			}

			console.log(`Installing ${name} (scope: ${scope})…`);
			try {
				await new PluginInstallerService(spawnRunner).install(name, scope as InstallScope);
				console.log(`✓ Plugin installed. Restart Valora to activate.`);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error(`✗ Installation failed: ${message}`);
				process.exit(1);
			}
		});

	pluginCmd
		.command('remove')
		.description('Remove an installed plugin')
		.argument('<name>', 'Plugin name (e.g. compression-universal) or full npm package')
		.option('--scope <scope>', 'Scope to remove from: user (default), project, or global (system-wide)', 'user')
		.action((...args: Array<Record<string, unknown>>) => {
			const name = args[0] as unknown as string;
			const options = args[1] as unknown as PluginInstallOptions;
			const scope = options.scope ?? 'user';

			if (!VALID_SCOPES.includes(scope as InstallScope)) {
				console.error(`Invalid scope "${scope}". Must be one of: ${VALID_SCOPES.join(', ')}.`);
				process.exit(1);
				return;
			}

			try {
				new PluginInstallerService(spawnRunner).uninstall(name, scope as InstallScope);
				console.log(`✓ Plugin removed. Restart Valora to deactivate.`);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error(`✗ Removal failed: ${message}`);
				process.exit(1);
			}
		});

	pluginCmd
		.command('list')
		.description('List all discovered plugins and their status')
		.action(() => {
			const color: ColorAdapter = getColorAdapter();
			const config = getConfigLoader().get();
			const plugins = new PluginLoaderService().catalogAll(config?.plugins);

			if (plugins.length === 0) {
				console.log('Plugins  (none)');
				process.exit(0);
				return;
			}

			const enabled = plugins.filter((p) => p.status === 'enabled');
			const disabled = plugins.filter((p) => p.status === 'disabled');
			const invalid = plugins.filter((p) => p.status === 'invalid');

			const parts: string[] = [];
			if (enabled.length > 0) parts.push(`${String(enabled.length)} enabled`);
			if (disabled.length > 0) parts.push(`${String(disabled.length)} disabled`);
			if (invalid.length > 0) parts.push(`${String(invalid.length)} invalid`);

			console.log(`Plugins  (${parts.join(', ')})\n`);

			for (const plugin of enabled) {
				console.log(
					`  ${color.green('✓')} ${pluginLabel(plugin).padEnd(36)} ${pluginVersion(plugin).padEnd(8)} ${pluginContribs(plugin).padEnd(28)} [${plugin.location}]`
				);
			}
			for (const plugin of disabled) {
				console.log(
					`  ${color.yellow('○')} ${pluginLabel(plugin).padEnd(36)} ${pluginVersion(plugin).padEnd(8)} ${pluginContribs(plugin).padEnd(28)} [${plugin.location}]  ${color.dim('not in plugins.enabled')}`
				);
			}
			for (const plugin of invalid) {
				console.log(
					`  ${color.red('✗')} ${pluginLabel(plugin).padEnd(36)} ${'—'.padEnd(8)} ${'invalid manifest'.padEnd(28)} [${plugin.location}]`
				);
			}

			process.exit(0);
		});

	pluginCmd
		.command('available')
		.description('List plugins available to install from the @windagency registry')
		.action(async () => {
			const color: ColorAdapter = getColorAdapter();
			const registry = await fetchPluginRegistry();

			if (!registry) {
				console.error('✗ Failed to fetch plugin registry.');
				process.exit(1);
				return;
			}

			const installed = new PluginLoaderService().catalogAll();
			const installedDirNames = new Set(installed.map((p) => p.dir.split('/').pop() ?? ''));

			console.log(`Available plugins  (${String(registry.length)} total, @windagency registry)\n`);

			for (const entry of registry) {
				const isInstalled = installedDirNames.has(entry.name);
				const marker = isInstalled ? color.green('✓') : color.yellow('○');
				const suffix = isInstalled ? color.dim('  installed') : '';
				console.log(`  ${marker} ${entry.name.padEnd(40)} ${entry.version.padEnd(8)} ${entry.description}${suffix}`);
			}

			console.log(`\nInstall with: valora plugin add <name>`);
			process.exit(0);
		});
}

function pluginContribs(plugin: CataloguedPlugin): string {
	return plugin.manifest?.contributes?.join(', ') ?? '—';
}

function pluginLabel(plugin: CataloguedPlugin): string {
	if (plugin.manifest) return plugin.manifest.name;
	const base = plugin.dir.split('/').pop() ?? plugin.dir;
	return base;
}

function pluginVersion(plugin: CataloguedPlugin): string {
	return plugin.manifest?.version ?? '—';
}
