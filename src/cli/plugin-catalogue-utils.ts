import type { RegistryEntry } from 'plugins/plugin-registry.service';
import type { InstalledPluginRef } from 'updater/plugin-compare';

import { resolvePackageName } from 'plugins/plugin-installer.service';

import type { CataloguedPlugin } from 'types/plugin.types';

export function buildCatalogMap(catalog: null | RegistryEntry[]): Map<string, string> {
	if (!catalog) return new Map();
	return new Map(catalog.map((entry) => [entry.name, entry.version]));
}

export function isUpdatablePlugin(p: CataloguedPlugin): boolean {
	return p.status === 'enabled' && p.location !== 'built-in' && p.manifest !== null;
}

export function toInstalledPluginRef(p: CataloguedPlugin): InstalledPluginRef {
	return {
		currentVersion: p.manifest!.version,
		location: p.location as InstalledPluginRef['location'],
		name: p.manifest!.name,
		packageName: resolvePackageName(p.manifest!.name)
	};
}
