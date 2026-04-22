import { isNewerVersion } from './compare';

export interface InstalledPluginRef {
	currentVersion: string;
	location: 'global' | 'npm' | 'project' | 'user';
	name: string;
	packageName: string;
}

export interface OutdatedPlugin {
	currentVersion: string;
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
	catalog: Map<string, string>,
	npmLatest: Map<string, string>
): OutdatedPlugin[] {
	const result: OutdatedPlugin[] = [];

	for (const plugin of installed) {
		const registryVersion = catalog.get(plugin.name);
		const npmVersion = npmLatest.get(plugin.name);

		if (registryVersion !== undefined && isNewerVersion(plugin.currentVersion, registryVersion)) {
			result.push({
				currentVersion: plugin.currentVersion,
				latestVersion: registryVersion,
				location: plugin.location,
				name: plugin.name,
				packageName: plugin.packageName,
				source: 'registry'
			});
		} else if (
			registryVersion === undefined &&
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
