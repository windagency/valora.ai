import * as fs from 'fs';
import * as path from 'path';

import type { PluginLocation } from 'types/plugin.types';

import { getLogger } from 'output/logger';
import { getGlobalPluginsDir, getPackagePluginsDir, getProjectPluginsDir, getSystemPluginsDir } from 'utils/paths';

import { PLUGIN_MANIFEST_FILE } from './plugin-manifest.schema';

const NPM_PACKAGE_SCOPE = '@windagency';
const NPM_PLUGIN_PREFIXES = ['valora-plugin-', 'valora-core-'] as const;

export class PluginDiscoveryService {
	private readonly logger = getLogger();

	constructor(private readonly cwd = process.cwd()) {}

	discoverPluginDirs(): string[] {
		return this.discoverWithSource().map(({ dir }) => dir);
	}

	discoverWithSource(): Array<{ dir: string; location: PluginLocation }> {
		const standard = this.buildSearchRootsWithLocations().flatMap(({ location, root }) =>
			this.scanPluginRoot(root).map((dir) => ({ dir, location }))
		);
		const npm = this.discoverNpmPluginDirs().map((dir) => ({ dir, location: 'npm' as PluginLocation }));
		return [...standard, ...npm];
	}

	private buildSearchRootsWithLocations(): Array<{ location: PluginLocation; root: string }> {
		const roots: Array<{ location: PluginLocation; root: string }> = [
			{ location: 'built-in', root: getPackagePluginsDir() },
			{ location: 'global', root: getSystemPluginsDir() },
			{ location: 'user', root: getGlobalPluginsDir() }
		];
		const project = getProjectPluginsDir();
		if (project) roots.push({ location: 'project', root: project });
		return roots.filter(({ root }) => fs.existsSync(root));
	}

	private discoverNpmPluginDirs(): string[] {
		const scopeDir = path.join(this.cwd, 'node_modules', NPM_PACKAGE_SCOPE);
		if (!fs.existsSync(scopeDir)) return [];

		try {
			return fs
				.readdirSync(scopeDir, { withFileTypes: true })
				.filter((entry) => entry.isDirectory() && NPM_PLUGIN_PREFIXES.some((prefix) => entry.name.startsWith(prefix)))
				.map((entry) => path.join(scopeDir, entry.name))
				.filter((pluginDir) => fs.existsSync(path.join(pluginDir, PLUGIN_MANIFEST_FILE)));
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logger.warn('Failed to scan npm plugin scope', { error: errorMessage });
			return [];
		}
	}

	private isContainedInRoot(candidate: string, resolvedRoot: string): boolean {
		try {
			const realCandidate = fs.realpathSync(candidate);
			return realCandidate === resolvedRoot || realCandidate.startsWith(resolvedRoot + path.sep);
		} catch {
			return false;
		}
	}

	private scanPluginRoot(rootDir: string): string[] {
		let resolvedRoot: string;
		try {
			resolvedRoot = fs.realpathSync(rootDir);
		} catch {
			return [];
		}
		try {
			return fs
				.readdirSync(rootDir, { withFileTypes: true })
				.filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
				.map((entry) => path.join(rootDir, entry.name))
				.filter((pluginDir) => this.isContainedInRoot(pluginDir, resolvedRoot))
				.filter((pluginDir) => fs.existsSync(path.join(pluginDir, PLUGIN_MANIFEST_FILE)));
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logger.warn(`Failed to scan plugin root: ${rootDir}`, { error: errorMessage });
			return [];
		}
	}
}
