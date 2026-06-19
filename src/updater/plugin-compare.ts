import type { CatalogEntry } from 'types/plugin.types';

import { isNewerVersion } from './compare';

export interface InstalledPluginRef {
	currentVersion: string;
	location: 'global' | 'npm' | 'project' | 'user';
	name: string;
	packageName: string;
}

export interface OutdatedPlugin {
	currentVersion: string;
	integrity?: string;
	latestVersion: string;
	location: InstalledPluginRef['location'];
	name: string;
	packageName: string;
	source: 'npm' | 'registry';
}

/**
 * Pure function — no I/O.
 * Compares installed plugin versions against registry and npm latest maps,
 * returning only plugins where a newer version is available.
 * Registry is preferred over npm when both have a version.
 */
export function diffPluginVersions(
	installed: InstalledPluginRef[],
	catalog: Map<string, CatalogEntry>,
	npmLatest: Map<string, string>
): OutdatedPlugin[] {
	const result: OutdatedPlugin[] = [];

	for (const plugin of installed) {
		const registryEntry = catalog.get(plugin.name);
		const npmVersion = npmLatest.get(plugin.name);

		if (registryEntry !== undefined && isNewerVersion(plugin.currentVersion, registryEntry.version)) {
			result.push({
				currentVersion: plugin.currentVersion,
				...(registryEntry.integrity ? { integrity: registryEntry.integrity } : {}),
				latestVersion: registryEntry.version,
				location: plugin.location,
				name: plugin.name,
				packageName: plugin.packageName,
				source: 'registry'
			});
		} else if (
			registryEntry === undefined &&
			npmVersion !== undefined &&
			isNewerVersion(plugin.currentVersion, npmVersion)
		) {
			result.push({
				currentVersion: plugin.currentVersion,
				latestVersion: npmVersion,
				location: plugin.location,
				name: plugin.name,
				packageName: plugin.packageName,
				source: 'npm'
			});
		}
	}

	return result;
}
