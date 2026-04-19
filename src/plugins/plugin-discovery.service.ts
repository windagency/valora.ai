import * as fs from 'fs';
import * as path from 'path';

import { getLogger } from 'output/logger';
import { getGlobalPluginsDir, getPackagePluginsDir, getProjectPluginsDir } from 'utils/paths';

import { PLUGIN_MANIFEST_FILE } from './plugin-manifest.schema';

const NPM_PACKAGE_SCOPE = '@windagency';
const NPM_PLUGIN_PREFIX = 'valora-plugin-';

export class PluginDiscoveryService {
	private readonly logger = getLogger();

	constructor(private readonly cwd = process.cwd()) {}

	discoverPluginDirs(): string[] {
		const standard = this.buildSearchRoots().flatMap((root) => this.scanPluginRoot(root));
		const npm = this.discoverNpmPluginDirs();
		return [...standard, ...npm];
	}

	private buildSearchRoots(): string[] {
		const builtIn = getPackagePluginsDir();
		const global = getGlobalPluginsDir();
		const project = getProjectPluginsDir();

		return [builtIn, global, ...(project ? [project] : [])].filter((dir) => fs.existsSync(dir));
	}

	private discoverNpmPluginDirs(): string[] {
		const scopeDir = path.join(this.cwd, 'node_modules', NPM_PACKAGE_SCOPE);
		if (!fs.existsSync(scopeDir)) return [];

		try {
			return fs
				.readdirSync(scopeDir, { withFileTypes: true })
				.filter((entry) => entry.isDirectory() && entry.name.startsWith(NPM_PLUGIN_PREFIX))
				.map((entry) => path.join(scopeDir, entry.name))
				.filter((pluginDir) => fs.existsSync(path.join(pluginDir, PLUGIN_MANIFEST_FILE)));
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logger.warn('Failed to scan npm plugin scope', { error: errorMessage });
			return [];
		}
	}

	private scanPluginRoot(rootDir: string): string[] {
		const resolvedRoot = path.resolve(rootDir);
		try {
			return fs
				.readdirSync(rootDir, { withFileTypes: true })
				.filter((entry) => entry.isDirectory())
				.map((entry) => path.resolve(rootDir, entry.name))
				.filter((pluginDir) => pluginDir.startsWith(resolvedRoot + path.sep))
				.filter((pluginDir) => fs.existsSync(path.join(pluginDir, PLUGIN_MANIFEST_FILE)));
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logger.warn(`Failed to scan plugin root: ${rootDir}`, { error: errorMessage });
			return [];
		}
	}
}
