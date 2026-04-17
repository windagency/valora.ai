import * as fs from 'fs';
import * as path from 'path';

import { getLogger } from 'output/logger';
import { getGlobalPluginsDir, getPackagePluginsDir, getProjectPluginsDir } from 'utils/paths';

import { PLUGIN_MANIFEST_FILE } from './plugin-manifest.schema';

export class PluginDiscoveryService {
	private readonly logger = getLogger();

	/**
	 * Discover all plugin directories from the standard search locations.
	 *
	 * Precedence (lowest to highest): built-in → global user → project.
	 * All discovered dirs are returned; filtering by enabled list is handled by the loader.
	 */
	discoverPluginDirs(): string[] {
		return this.buildSearchRoots().flatMap((root) => this.scanPluginRoot(root));
	}

	private buildSearchRoots(): string[] {
		const builtIn = getPackagePluginsDir();
		const global = getGlobalPluginsDir();
		const project = getProjectPluginsDir();

		return [builtIn, global, ...(project ? [project] : [])].filter((dir) => fs.existsSync(dir));
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
			this.logger.warn(`Failed to scan plugin root: ${rootDir}`, { error: (error as Error).message });
			return [];
		}
	}
}
