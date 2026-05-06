import * as fs from 'fs';
import * as path from 'path';

import type { HooksConfig } from 'types/hook.types';
import type {
	CataloguedPlugin,
	LoadedPlugin,
	PluginContributionType,
	PluginLocation,
	PluginManifest,
	PluginsConfig
} from 'types/plugin.types';

import { getLogger } from 'output/logger';
import { getResourceResolver } from 'utils/resource-resolver';

import { PluginDiscoveryService } from './plugin-discovery.service';
import {
	PLUGIN_HOOKS_FILE,
	PLUGIN_HOOKS_FILE_SCHEMA,
	PLUGIN_MANIFEST_FILE,
	PLUGIN_MANIFEST_SCHEMA,
	PLUGIN_MCPS_FILE
} from './plugin-manifest.schema';

export class PluginLoaderService {
	private readonly discovery: PluginDiscoveryService;
	private readonly logger = getLogger();

	constructor(discovery?: PluginDiscoveryService) {
		this.discovery = discovery ?? new PluginDiscoveryService();
	}

	catalogAll(config?: PluginsConfig): CataloguedPlugin[] {
		return this.discovery.discoverWithSource().map(({ dir, location }) => {
			const manifestPath = path.join(dir, PLUGIN_MANIFEST_FILE);
			try {
				const raw = fs.readFileSync(manifestPath, 'utf-8');
				const result = PLUGIN_MANIFEST_SCHEMA.safeParse(JSON.parse(raw) as unknown);
				if (!result.success) {
					return { dir, location, manifest: null, status: 'invalid' as const };
				}
				const manifest: PluginManifest = result.data;
				const enabled = !config?.enabled || config.enabled.includes(manifest.name);
				return { dir, location, manifest, status: enabled ? ('enabled' as const) : ('disabled' as const) };
			} catch {
				return { dir, location, manifest: null, status: 'invalid' as const };
			}
		});
	}

	isInstalled(shortName: string): boolean {
		return this.catalogAll().some((p) => p.manifest?.name === shortName);
	}

	/**
	 * Discover and load all enabled plugins.
	 * Registers each plugin directory with ResourceResolver so that the existing
	 * security checks in command-discovery continue to pass for plugin resources.
	 */
	loadAll(config?: PluginsConfig): LoadedPlugin[] {
		const loaded = this.discovery
			.discoverWithSource()
			.map(({ dir, location }) => this.loadPlugin(dir, location, config))
			.filter((plugin): plugin is LoadedPlugin => plugin !== null);
		return this.sortByDependencies(loaded);
	}

	private isEnabled(name: string, config?: PluginsConfig): boolean {
		if (!config?.enabled) return true;
		return config.enabled.includes(name);
	}

	private loadHooksFile(pluginDir: string): HooksConfig | undefined {
		const hooksPath = path.join(pluginDir, PLUGIN_HOOKS_FILE);
		if (!fs.existsSync(hooksPath)) return undefined;

		try {
			const raw = fs.readFileSync(hooksPath, 'utf-8');
			const result = PLUGIN_HOOKS_FILE_SCHEMA.safeParse(JSON.parse(raw) as unknown);
			if (!result.success) {
				this.logger.warn(`Invalid hooks config in: ${hooksPath}`, { errors: result.error.flatten() });
				return undefined;
			}
			return result.data.hooks;
		} catch (error) {
			this.logger.warn(`Failed to read plugin hooks file: ${hooksPath}`, { error: (error as Error).message });
			return undefined;
		}
	}

	private loadPlugin(pluginDir: string, location: PluginLocation, config?: PluginsConfig): LoadedPlugin | null {
		const manifestPath = path.join(pluginDir, PLUGIN_MANIFEST_FILE);

		try {
			const raw = fs.readFileSync(manifestPath, 'utf-8');
			const parsed = JSON.parse(raw) as unknown;
			const result = PLUGIN_MANIFEST_SCHEMA.safeParse(parsed);

			if (!result.success) {
				this.logger.warn(`Invalid plugin manifest: ${manifestPath}`, {
					errors: result.error.flatten()
				});
				return null;
			}

			const manifest: PluginManifest = result.data;

			if (!this.isEnabled(manifest.name, config)) {
				this.logger.debug(`Plugin disabled: ${manifest.name}`);
				return null;
			}

			// Register with ResourceResolver so command-discovery's isAllowedDirectory passes.
			getResourceResolver().registerPluginDir(pluginDir);

			const plugin: LoadedPlugin = {
				location,
				manifest,
				pluginDir,
				status: 'enabled',
				...this.resolveContribDirs(pluginDir, manifest)
			};

			const contribs = manifest.contributes?.join(', ') ?? 'none';
			this.logger.info(`Plugin loaded: ${manifest.name}@${manifest.version} (${contribs})`);
			return plugin;
		} catch (error) {
			this.logger.warn(`Failed to load plugin from: ${pluginDir}`, { error: (error as Error).message });
			return null;
		}
	}

	private resolveCodeEntrypoint(pluginDir: string, manifest: PluginManifest): string | undefined {
		if (!manifest.permissions?.includes('code-exec')) {
			if (manifest.contributes?.includes('code')) {
				this.logger.warn(
					`Plugin "${manifest.name}" contributes 'code' but is missing the 'code-exec' permission — register() will not be called`,
					{ name: manifest.name }
				);
			}
			return undefined;
		}
		if (!manifest.codeEntrypoint) return undefined;

		const entrypoint = path.join(pluginDir, manifest.codeEntrypoint);
		return fs.existsSync(entrypoint) ? entrypoint : undefined;
	}

	private resolveContribDirs(
		pluginDir: string,
		manifest: PluginManifest
	): Partial<
		Pick<
			LoadedPlugin,
			| 'agentsDir'
			| 'codeEntrypoint'
			| 'commandsDir'
			| 'hooks'
			| 'mcpsFile'
			| 'promptsDir'
			| 'templatesDir'
			| 'validatorModules'
		>
	> {
		const contrib = manifest.contributes ?? [];
		const has = (type: PluginContributionType): boolean => contrib.includes(type);

		return {
			...(has('agents') && { agentsDir: this.resolveSubdir(pluginDir, 'agents') }),
			...(has('code') && { codeEntrypoint: this.resolveCodeEntrypoint(pluginDir, manifest) }),
			...(has('commands') && { commandsDir: this.resolveSubdir(pluginDir, 'commands') }),
			...(has('prompts') && { promptsDir: this.resolveSubdir(pluginDir, 'prompts') }),
			...(has('templates') && { templatesDir: this.resolveSubdir(pluginDir, 'templates') }),
			...(has('hooks') && { hooks: this.resolveHooks(pluginDir, manifest) }),
			...(has('mcps') && { mcpsFile: this.resolveMcpsFile(pluginDir, manifest) }),
			...(has('validators') && { validatorModules: this.resolveValidatorModules(pluginDir, manifest) })
		};
	}

	private resolveHookCommandPaths(hooks: HooksConfig, pluginDir: string): HooksConfig {
		// Single-quote the path so the shell never interprets $ ` \ or ! inside it,
		// regardless of where npm installs the package.
		const safe = `'${pluginDir.replace(/'/g, "'\\''")}'`;
		const result: HooksConfig = {};

		for (const key of Object.keys(hooks) as Array<keyof HooksConfig>) {
			const matchers = hooks[key];
			if (matchers) {
				result[key] = matchers.map((m) => ({
					...m,
					hooks: m.hooks.map((h) => ({ ...h, command: h.command.replaceAll('{pluginDir}', safe) }))
				}));
			}
		}

		return result;
	}

	private resolveHooks(pluginDir: string, manifest: PluginManifest): HooksConfig | undefined {
		if (!manifest.permissions?.includes('shell-hooks')) {
			if (manifest.contributes?.includes('hooks')) {
				this.logger.warn(
					`Plugin "${manifest.name}" contributes 'hooks' but is missing the 'shell-hooks' permission — hooks will not be registered`,
					{ name: manifest.name }
				);
			}
			return undefined;
		}
		const hooks = this.loadHooksFile(pluginDir);
		return hooks ? this.resolveHookCommandPaths(hooks, pluginDir) : undefined;
	}

	private resolveMcpsFile(pluginDir: string, manifest: PluginManifest): string | undefined {
		if (!manifest.permissions?.includes('mcp-connect')) {
			if (manifest.contributes?.includes('mcps')) {
				this.logger.warn(
					`Plugin "${manifest.name}" contributes 'mcps' but is missing the 'mcp-connect' permission — MCP servers will not be registered`,
					{ name: manifest.name }
				);
			}
			return undefined;
		}

		const mcpsPath = path.join(pluginDir, PLUGIN_MCPS_FILE);
		return fs.existsSync(mcpsPath) ? mcpsPath : undefined;
	}

	private resolveSubdir(pluginDir: string, name: string): string | undefined {
		const full = path.join(pluginDir, name);
		return fs.existsSync(full) ? full : undefined;
	}

	private resolveValidatorModules(
		pluginDir: string,
		manifest: PluginManifest
	): Array<{ modulePath: string; stage: string }> | undefined {
		if (!manifest.permissions?.includes('code-exec')) {
			this.logger.warn(
				`Plugin "${manifest.name}" contributes 'validators' but is missing the 'code-exec' permission — validators will not be registered`,
				{ name: manifest.name }
			);
			return undefined;
		}
		if (!manifest.validators?.length) return undefined;

		return manifest.validators
			.map(({ module, stage }) => {
				const modulePath = path.resolve(pluginDir, module);
				if (!fs.existsSync(modulePath)) {
					this.logger.warn(`Plugin "${manifest.name}" validator module not found: ${modulePath}`, {
						name: manifest.name
					});
					return null;
				}
				return { modulePath, stage };
			})
			.filter((entry): entry is { modulePath: string; stage: string } => entry !== null);
	}

	private sortByDependencies(plugins: LoadedPlugin[]): LoadedPlugin[] {
		const byName = new Map(plugins.map((p) => [p.manifest.name, p]));

		for (const plugin of plugins) {
			for (const dep of plugin.manifest.requires ?? []) {
				if (!byName.has(dep)) {
					this.logger.warn(`Plugin "${plugin.manifest.name}" requires "${dep}" which is not loaded`);
				}
			}
		}

		const sorted: LoadedPlugin[] = [];
		const visited = new Set<string>();
		const inStack = new Set<string>();

		const visit = (name: string): void => {
			if (visited.has(name)) return;
			if (inStack.has(name)) {
				this.logger.warn(`Plugin dependency cycle detected at: ${name}`);
				return;
			}
			inStack.add(name);
			const plugin = byName.get(name);
			if (plugin) {
				for (const dep of plugin.manifest.requires ?? []) {
					visit(dep);
				}
				sorted.push(plugin);
			}
			inStack.delete(name);
			visited.add(name);
		};

		for (const plugin of plugins) {
			visit(plugin.manifest.name);
		}

		return sorted;
	}
}
