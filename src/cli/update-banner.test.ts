import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OutdatedPlugin } from 'updater/plugin-compare';
import type { UpdateCheckState } from 'updater/throttle';

vi.mock('output/box-formatter', () => ({
	getBoxFormatter: vi.fn(() => ({
		formatBoxWithTitle: vi.fn((_title: string, lines: string[]) => lines.join('\n'))
	}))
}));

import { printUpdateBanner } from './update-banner';

const baseState = (): UpdateCheckState => ({
	installedVersionAtCheck: '2.5.0',
	lastCheckAt: '2026-04-20T00:00:00Z',
	lastSuccessAt: '2026-04-20T00:00:00Z',
	latestVersion: '2.6.0',
	latestVersionFetchedAt: '2026-04-20T00:00:00Z',
	plugins: {},
	remindedForVersion: null,
	schemaVersion: 2
});

let stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
	stderrSpy.mockRestore();
});

describe('printUpdateBanner', () => {
	it('writes nothing when latestVersion is null and no outdated plugins', () => {
		const state = { ...baseState(), latestVersion: null };
		printUpdateBanner(state, '2.5.0', []);
		expect(stderrSpy).not.toHaveBeenCalled();
	});

	it('renders the core update line when core has a newer version', () => {
		printUpdateBanner(baseState(), '2.5.0', []);
		const output = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
		expect(output).toContain('2.5.0');
		expect(output).toContain('2.6.0');
		expect(output).toContain('valora update');
	});

	it('renders the plugin section when there are outdated plugins', () => {
		const outdated: OutdatedPlugin[] = [
			{
				currentVersion: '1.0.0',
				latestVersion: '1.1.0',
				location: 'user',
				name: 'valora-plugin-rtk',
				packageName: '@windagency/valora-plugin-rtk',
				source: 'registry'
			}
		];
		printUpdateBanner(baseState(), '2.5.0', outdated);
		const output = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
		expect(output).toContain('valora-plugin-rtk');
		expect(output).toContain('1.0.0');
		expect(output).toContain('1.1.0');
		expect(output).toContain('valora plugin update');
	});

	it('renders only the plugin section when core is up-to-date but plugins are outdated', () => {
		const state = { ...baseState(), latestVersion: null };
		const outdated: OutdatedPlugin[] = [
			{
				currentVersion: '1.0.0',
				latestVersion: '2.0.0',
				location: 'user',
				name: 'valora-plugin-eng',
				packageName: '@windagency/valora-plugin-eng',
				source: 'registry'
			}
		];
		printUpdateBanner(state, '2.5.0', outdated);
		const output = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
		expect(output).toContain('valora-plugin-eng');
		expect(output).not.toContain('valora update\n');
	});

	it('writes nothing when there are no updates at all', () => {
		const state = { ...baseState(), latestVersion: null };
		printUpdateBanner(state, '2.5.0', []);
		expect(stderrSpy).not.toHaveBeenCalled();
	});

	it('renders multiple outdated plugins', () => {
		const state = { ...baseState(), latestVersion: null };
		const outdated: OutdatedPlugin[] = [
			{
				currentVersion: '1.0.0',
				latestVersion: '1.1.0',
				location: 'user',
				name: 'valora-plugin-rtk',
				packageName: '@windagency/valora-plugin-rtk',
				source: 'registry'
			},
			{
				currentVersion: '2.0.0',
				latestVersion: '2.1.0',
				location: 'project',
				name: 'valora-plugin-eng',
				packageName: '@windagency/valora-plugin-eng',
				source: 'registry'
			}
		];
		printUpdateBanner(state, '2.5.0', outdated);
		const output = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
		expect(output).toContain('valora-plugin-rtk');
		expect(output).toContain('valora-plugin-eng');
	});
});
