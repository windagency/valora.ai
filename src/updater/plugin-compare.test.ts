import { describe, expect, it } from 'vitest';

import { type InstalledPluginRef, type OutdatedPlugin, diffPluginVersions } from './plugin-compare';

const ref = (overrides: Partial<InstalledPluginRef> = {}): InstalledPluginRef => ({
	name: 'valora-plugin-rtk',
	packageName: '@windagency/valora-plugin-rtk',
	currentVersion: '1.0.0',
	location: 'user',
	...overrides
});

describe('diffPluginVersions', () => {
	it('returns empty when no plugins are installed', () => {
		expect(diffPluginVersions([], new Map(), new Map())).toEqual([]);
	});

	it('returns empty when installed version matches registry version', () => {
		const catalog = new Map([['valora-plugin-rtk', '1.0.0']]);
		expect(diffPluginVersions([ref()], catalog, new Map())).toEqual([]);
	});

	it('returns empty when installed version is newer than catalog', () => {
		const catalog = new Map([['valora-plugin-rtk', '0.9.0']]);
		expect(diffPluginVersions([ref({ currentVersion: '1.0.0' })], catalog, new Map())).toEqual([]);
	});

	it('returns outdated plugin when catalog version is newer', () => {
		const catalog = new Map([['valora-plugin-rtk', '1.1.0']]);
		const result = diffPluginVersions([ref()], catalog, new Map());
		const expected: OutdatedPlugin[] = [
			{
				name: 'valora-plugin-rtk',
				packageName: '@windagency/valora-plugin-rtk',
				currentVersion: '1.0.0',
				latestVersion: '1.1.0',
				location: 'user',
				source: 'registry'
			}
		];
		expect(result).toEqual(expected);
	});

	it('falls back to npm map when plugin is absent from registry', () => {
		const npm = new Map([['valora-plugin-rtk', '2.0.0']]);
		const result = diffPluginVersions([ref()], new Map(), npm);
		const expected: OutdatedPlugin[] = [
			{
				name: 'valora-plugin-rtk',
				packageName: '@windagency/valora-plugin-rtk',
				currentVersion: '1.0.0',
				latestVersion: '2.0.0',
				location: 'user',
				source: 'npm'
			}
		];
		expect(result).toEqual(expected);
	});

	it('prefers registry over npm when both have a newer version', () => {
		const catalog = new Map([['valora-plugin-rtk', '1.2.0']]);
		const npm = new Map([['valora-plugin-rtk', '1.3.0']]);
		const result = diffPluginVersions([ref()], catalog, npm);
		expect(result[0]?.source).toBe('registry');
		expect(result[0]?.latestVersion).toBe('1.2.0');
	});

	it('returns empty when neither catalog nor npm has the plugin', () => {
		expect(diffPluginVersions([ref()], new Map(), new Map())).toEqual([]);
	});

	it('handles a mix of up-to-date, outdated, and unknown plugins', () => {
		const installed = [
			ref({ name: 'valora-plugin-rtk', currentVersion: '1.0.0' }),
			ref({ name: 'valora-plugin-eng', packageName: '@windagency/valora-plugin-eng', currentVersion: '2.0.0' }),
			ref({ name: 'valora-plugin-new', packageName: '@windagency/valora-plugin-new', currentVersion: '1.5.0' })
		];
		const catalog = new Map([
			['valora-plugin-rtk', '1.1.0'], // outdated
			['valora-plugin-eng', '2.0.0'] // up-to-date
			// valora-plugin-new is absent → no npm fallback either
		]);
		const result = diffPluginVersions(installed, catalog, new Map());
		expect(result).toHaveLength(1);
		expect(result[0]?.name).toBe('valora-plugin-rtk');
	});

	it('preserves location in the outdated entry', () => {
		const catalog = new Map([['valora-plugin-rtk', '2.0.0']]);
		const result = diffPluginVersions([ref({ location: 'project' })], catalog, new Map());
		expect(result[0]?.location).toBe('project');
	});
});
