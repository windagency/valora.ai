import { execFile, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import * as readline from 'node:readline';
import { promisify } from 'node:util';
import {
	type InstallScope,
	peekTarballManifest,
	PluginInstallerService,
	resolvePackageName,
	shortNameFromPackage
} from 'plugins/plugin-installer.service';
import { PluginLoaderService } from 'plugins/plugin-loader.service';
import { fetchPluginRegistry } from 'plugins/plugin-registry.service';
import { diffPluginVersions } from 'updater/plugin-compare';
import { fetchLatestVersionFor } from 'updater/registry';

import type { CommandAdapter } from 'cli/command-adapter.interface';
import type { CataloguedPlugin, PluginBinaryRequirement } from 'types/plugin.types';

import { buildCatalogMap, isUpdatablePlugin, toInstalledPluginRef } from 'cli/plugin-catalogue-utils';
import { spawnRunner } from 'cli/spawn-runner';
import { getConfigLoader } from 'config/loader';
import { type ColorAdapter, getColorAdapter } from 'output/color-adapter.interface';

export type BinaryChecker = (name: string) => Promise<boolean>;
export type BinaryInstaller = (command: string) => Promise<number>;

export interface PluginCommandHooks {
	binaryChecker?: BinaryChecker;
	binaryInstaller?: BinaryInstaller;
	promptInstall?: (name: string, installCommand: string) => Promise<boolean>;
}

const execFileAsync = promisify(execFile);

async function checkBinaryRequirements(
	shortName: string,
	checker: BinaryChecker,
	installer: BinaryInstaller,
	promptFn: (name: string, installCommand: string) => Promise<boolean>
): Promise<void> {
	const plugin = new PluginLoaderService().catalogAll().find((p) => p.manifest?.name === shortName);
	const requirements = plugin?.manifest?.requiresBinary ?? [];
	for (const req of requirements) {
		const isPresent = await isBinaryRequirementPresent(req, checker, installer, promptFn);
		if (isPresent) continue;
		if (await tryInstallBinary(req, installer, promptFn)) continue;
		console.warn(`⚠ Plugin requires '${req.name}' which was not found on PATH.`);
		if (req.install) {
			console.warn(`  Install from: ${req.install}`);
		}
	}
}

/**
 * Exported for direct testing — this is invoked for `checkCommand`,
 * `installCommand`, and `postInstallCommand` alike, so the message must not
 * claim a specific purpose ("the install command") when it might be showing
 * a presence-check or setup command instead.
 */
export async function defaultPromptInstall(name: string, command: string): Promise<boolean> {
	if (!process.stdout.isTTY) return false;
	console.log(`The plugin '${name}' wants to run this command:\n  ${command}\n`);
	return promptYesNo(`Run this command for '${name}'? [y/N] `);
}

async function isBinaryOnPath(name: string): Promise<boolean> {
	try {
		await execFileAsync(name, ['--version']);
		return true;
	} catch (err) {
		return (err as NodeJS.ErrnoException).code !== 'ENOENT';
	}
}

/**
 * `checkCommand` is arbitrary plugin-manifest-declared shell text — running
 * it unconditionally would be the exact privilege-escalation surface
 * `tryInstallBinary` already requires confirmation for on `installCommand`/
 * `postInstallCommand`. Require the same confirmation here; declining falls
 * back to the safe PATH-only presence check rather than silently treating
 * the binary as absent (which would trigger an unwanted install attempt).
 */
async function isBinaryRequirementPresent(
	req: PluginBinaryRequirement,
	checker: BinaryChecker,
	installer: BinaryInstaller,
	promptFn: (name: string, installCommand: string) => Promise<boolean>
): Promise<boolean> {
	if (!req.checkCommand) return checker(req.name);
	const confirmed = await promptFn(req.name, req.checkCommand);
	if (!confirmed) return checker(req.name);
	return (await installer(req.checkCommand)) === 0;
}

async function runShellCommand(command: string): Promise<number> {
	return new Promise((resolve) => {
		const child = spawn(command, { shell: true, stdio: 'inherit' });
		child.on('close', (code) => resolve(code ?? 1));
	});
}

async function tryInstallBinary(
	req: PluginBinaryRequirement,
	installer: BinaryInstaller,
	promptFn: (name: string, installCommand: string) => Promise<boolean>
): Promise<boolean> {
	if (!req.installCommand) return false;
	// Always prompt before running an arbitrary shell install command, even when the
	// manifest declares autoInstall: true. The flag is now informational only — it
	// does not bypass user consent. This closes the privilege-escalation surface
	// that third-party manifests would otherwise have on first install.
	const confirmed = await promptFn(req.name, req.installCommand);
	if (!confirmed) return false;
	const code = await installer(req.installCommand);
	if (code === 0) {
		console.log(`✓ ${req.name} downloaded successfully.`);
		// installCommand's approval is not blanket consent for a different,
		// possibly-unseen command — require its own confirmation too, same as
		// installCommand and checkCommand.
		if (req.postInstallCommand) {
			if (await promptFn(req.name, req.postInstallCommand)) {
				console.log(`Setting up ${req.name}…`);
				await installer(req.postInstallCommand);
			} else {
				console.warn(`⚠ Skipped setup for ${req.name} (declined).`);
			}
		}
	} else {
		console.warn(`⚠ Failed to download '${req.name}' (exit code ${String(code)}).`);
		if (req.install) {
			console.warn(`  Download manually from: ${req.install}`);
		}
	}
	return true;
}

const require = createRequire(import.meta.url);
const packageJson = require('../../../package.json') as { version: string };

const VALID_SCOPES: InstallScope[] = ['global', 'project', 'user'];

interface PluginInstallOptions extends Record<string, unknown> {
	scope?: string;
}

export function configurePluginCommand(program: CommandAdapter, hooks: PluginCommandHooks = {}): void {
	const checker = hooks.binaryChecker ?? isBinaryOnPath;
	const installer = hooks.binaryInstaller ?? runShellCommand;
	const promptFn = hooks.promptInstall ?? defaultPromptInstall;

	const pluginInstaller = new PluginInstallerService(spawnRunner);
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

			if (name.endsWith('.tgz')) {
				await installFromLocalTgz(pluginInstaller, name, scope as InstallScope, checker, installer, promptFn);
				return;
			}

			const shortName = shortNameFromPackage(resolvePackageName(name));
			const { integrity, version } = await fetchRegistryMetadataForPlugin(shortName);

			console.log(`Installing ${name} (scope: ${scope})…`);
			try {
				await pluginInstaller.install(name, scope as InstallScope, integrity, version);
				console.log(`✓ Plugin installed. Restart Valora to activate.`);
				await checkBinaryRequirements(shortName, checker, installer, promptFn);
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
				pluginInstaller.uninstall(name, scope as InstallScope);
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
			const color = getColorAdapter();
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
			const color = getColorAdapter();
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

	pluginCmd
		.command('update')
		.description('Update installed plugins to their latest versions')
		.argument('[name]', 'Plugin name to update (updates all outdated plugins if omitted)')
		.option('--check', 'Check for updates without installing')
		.action(async (...args: Array<Record<string, unknown>>) => {
			const nameArg = args[0] as unknown as string | undefined;
			const options = args[1] as unknown as { check?: boolean };
			const color = getColorAdapter();

			const [catalog, allInstalled] = await Promise.all([
				fetchPluginRegistry(),
				Promise.resolve(new PluginLoaderService().catalogAll())
			]);

			const catalogMap = buildCatalogMap(catalog);
			const refs = allInstalled.filter(isUpdatablePlugin).map(toInstalledPluginRef);

			const normalised = nameArg ? shortNameFromPackage(resolvePackageName(nameArg)) : null;
			const filtered = normalised ? refs.filter((r) => r.name === normalised) : refs;

			const missingFromCatalog = filtered.filter((r) => !catalogMap.has(r.name));
			const npmLatestMap = await buildNpmLatestMap(missingFromCatalog);

			const outdated = diffPluginVersions(filtered, catalogMap, npmLatestMap);

			if (outdated.length === 0) {
				console.log('All plugins are up to date.');
				process.exit(0);
				return;
			}

			if (options.check) {
				console.log(`Plugin updates available:\n`);
				for (const p of outdated) {
					console.log(`  ${p.name}  ${p.currentVersion}  →  ${p.latestVersion}`);
				}
				process.exit(0);
				return;
			}

			await installOutdatedPlugins(pluginInstaller, outdated, color);
			process.exit(0);
		});
}

async function buildNpmLatestMap(plugins: Array<{ name: string; packageName: string }>): Promise<Map<string, string>> {
	if (plugins.length === 0) return new Map();
	const results = await Promise.all(
		plugins.map(async (r) => ({
			name: r.name,
			version: await fetchLatestVersionFor(r.packageName, packageJson.version)
		}))
	);
	return new Map(results.filter((r) => r.version !== null).map((r) => [r.name, r.version as string]));
}

interface RegistryPluginMetadata {
	integrity?: string;
	version?: string;
}

async function fetchRegistryMetadataForPlugin(shortName: string): Promise<RegistryPluginMetadata> {
	try {
		const registry = await fetchPluginRegistry();
		const entry = registry?.find((e) => e.name === shortName);
		return { integrity: entry?.integrity, version: entry?.version };
	} catch {
		return {};
	}
}

async function installFromLocalTgz(
	installer: PluginInstallerService,
	tgzPath: string,
	scope: InstallScope,
	checker: BinaryChecker,
	binaryInstaller: BinaryInstaller,
	promptFn: (name: string, installCommand: string) => Promise<boolean>
): Promise<void> {
	const { name: shortName, version: tgzVersion } = peekTarballManifest(tgzPath);

	const installed = new PluginLoaderService().catalogAll().find((p) => p.manifest?.name === shortName);

	if (installed?.manifest?.version) {
		const installedVersion = installed.manifest.version;
		if (installedVersion === tgzVersion) {
			console.log(`✓ ${shortName} ${tgzVersion} is already installed.`);
			return;
		}
		const confirmed = await promptYesNo(`${shortName} ${installedVersion} → ${tgzVersion}. Update? [y/N] `);
		if (!confirmed) return;
	}

	console.log(`Installing ${shortName} ${tgzVersion} (scope: ${scope})…`);
	try {
		await installer.installFromTarball(tgzPath, scope);
		console.log(`✓ Plugin installed. Restart Valora to activate.`);
		await checkBinaryRequirements(shortName, checker, binaryInstaller, promptFn);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`✗ Installation failed: ${message}`);
		process.exit(1);
	}
}

async function installOutdatedPlugins(
	installer: PluginInstallerService,
	outdated: Awaited<ReturnType<typeof diffPluginVersions>>,
	color: ColorAdapter
): Promise<void> {
	for (const p of outdated) {
		if (p.location === 'npm') {
			console.log(`  ${color.yellow('○')} ${p.name} — managed by your package manager, update manually.`);
			continue;
		}
		console.log(`Updating ${p.name} (${p.currentVersion} → ${p.latestVersion})…`);
		try {
			await installer.install(p.name, p.location as InstallScope, p.integrity, p.latestVersion);
			console.log(`  ${color.green('✓')} ${p.name} updated.`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`  ${color.red('✗')} ${p.name}: ${message}`);
		}
	}
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

function promptYesNo(question: string): Promise<boolean> {
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
	return new Promise((resolve) => {
		rl.question(question, (answer) => {
			rl.close();
			resolve(answer.toLowerCase() === 'y');
		});
	});
}
