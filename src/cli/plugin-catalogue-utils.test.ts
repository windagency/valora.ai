import { describe, expect, it, vi } from 'vitest';

import type { CataloguedPlugin } from 'types/plugin.types';

vi.mock('plugins/plugin-installer.service', async (importOriginal) => {
	const actual = await importOriginal<typeof import('plugins/plugin-installer.service')>();
	return { ...actual };
});

import { buildCatalogMap, isUpdatablePlugin, toInstalledPluginRef } from './plugin-catalogue-utils';

function plugin(overrides: Partial<CataloguedPlugin> = {}): CataloguedPlugin {
	return {
		dir: '/plugins/valora-plugin-rtk',
		location: 'user',
		manifest: { name: 'valora-plugin-rtk', version: '1.0.0' },
		status: 'enabled',
		...overrides
	};
}

describe('buildCatalogMap', () => {
	it('returns an empty map when catalog is null', () => {
		expect(buildCatalogMap(null).size).toBe(0);
	});

	it('returns an empty map when catalog is an empty array', () => {
		expect(buildCatalogMap([]).size).toBe(0);
	});

	it('maps each entry by name to its version', () => {
		const catalog = [
			{ name: 'valora-plugin-rtk', version: '1.1.0', package: '', contributes: [], description: '' },
			{ name: 'valora-plugin-eng', version: '2.0.0', package: '', contributes: [], description: '' }
		];
		const map = buildCatalogMap(catalog);
		expect(map.get('valora-plugin-rtk')).toBe('1.1.0');
		expect(map.get('valora-plugin-eng')).toBe('2.0.0');
		expect(map.size).toBe(2);
	});
});

describe('isUpdatablePlugin', () => {
	it('returns true for an enabled, non-built-in plugin with a manifest', () => {
		expect(isUpdatablePlugin(plugin())).toBe(true);
	});

	it('returns false for a disabled plugin', () => {
		expect(isUpdatablePlugin(plugin({ status: 'disabled' }))).toBe(false);
	});

	it('returns false for an invalid plugin', () => {
		expect(isUpdatablePlugin(plugin({ status: 'invalid', manifest: null }))).toBe(false);
	});

	it('returns false for a built-in plugin', () => {
		expect(isUpdatablePlugin(plugin({ location: 'built-in' }))).toBe(false);
	});

	it('returns false when manifest is null', () => {
		expect(isUpdatablePlugin(plugin({ manifest: null }))).toBe(false);
	});
});

describe('toInstalledPluginRef', () => {
	it('maps a user-scoped plugin to an InstalledPluginRef with the correct package name', () => {
		const ref = toInstalledPluginRef(plugin());
		expect(ref.name).toBe('valora-plugin-rtk');
		expect(ref.currentVersion).toBe('1.0.0');
		expect(ref.location).toBe('user');
		expect(ref.packageName).toBe('@windagency/valora-plugin-rtk');
	});

	it('maps a project-scoped plugin correctly', () => {
		const ref = toInstalledPluginRef(plugin({ location: 'project' }));
		expect(ref.location).toBe('project');
	});
});
