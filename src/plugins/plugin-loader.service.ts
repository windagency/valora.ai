import * as fs from 'fs';
import * as path from 'path';

import type { HooksConfig } from 'types/hook.types';
import type { LoadedPlugin, PluginManifest, PluginsConfig } from 'types/plugin.types';

import { getLogger } from 'output/logger';
import { getResourceResolver } from 'utils/resource-resolver';

import { PluginDiscoveryService } from './plugin-discovery.service';
import {
	PLUGIN_HOOKS_FILE,
	PLUGIN_HOOKS_FILE_SCHEMA,
	PLUGIN_MANIFEST_FILE,
	PLUGIN_MANIFEST_SCHEMA
} from './plugin-manifest.schema';

export class PluginLoaderService {
	private readonly discovery: PluginDiscoveryService;
	private readonly logger = getLogger();

	constructor(discovery?: PluginDiscoveryService) {
		this.discovery = discovery ?? new PluginDiscoveryService();
	}

	/**
	 * Discover and load all enabled plugins.
	 * Registers each plugin directory with ResourceResolver so that the existing
	 * security checks in command-discovery continue to pass for plugin resources.
	 */
	loadAll(config?: PluginsConfig): LoadedPlugin[] {
		return this.discovery
			.discoverPluginDirs()
			.map((pluginDir) => this.loadPlugin(pluginDir, config))
			.filter((plugin): plugin is LoadedPlugin => plugin !== null);
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

	private loadPlugin(pluginDir: string, config?: PluginsConfig): LoadedPlugin | null {
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

	private resolveContribDirs(
		pluginDir: string,
		manifest: PluginManifest
	): Partial<Pick<LoadedPlugin, 'agentsDir' | 'commandsDir' | 'hooks' | 'promptsDir' | 'templatesDir'>> {
		const contrib = manifest.contributes ?? [];

		const subdir = (name: string): string | undefined => {
			const full = path.join(pluginDir, name);
			return fs.existsSync(full) ? full : undefined;
		};

		const hasShellHooksPermission = manifest.permissions?.includes('shell-hooks') ?? false;

		return {
			...(contrib.includes('agents') && { agentsDir: subdir('agents') }),
			...(contrib.includes('commands') && { commandsDir: subdir('commands') }),
			...(contrib.includes('prompts') && { promptsDir: subdir('prompts') }),
			...(contrib.includes('templates') && { templatesDir: subdir('templates') }),
			...(contrib.includes('hooks') && hasShellHooksPermission && { hooks: this.loadHooksFile(pluginDir) })
		};
	}
}
