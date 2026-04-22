import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CataloguedPlugin } from 'types/plugin.types';

import { DEFAULT_STATE, writeUpdateState } from 'updater/state';

vi.mock('plugins/plugin-registry.service', () => ({
	fetchPluginRegistry: vi.fn()
}));

vi.mock('updater/registry', () => ({
	fetchLatestVersionFor: vi.fn()
}));

import { fetchPluginRegistry } from 'plugins/plugin-registry.service';
import { fetchLatestVersionFor } from 'updater/registry';

import {
	resetPendingPluginUpdateCheck,
	schedulePluginUpdateCheck,
	settlePluginUpdateCheck
} from './plugin-update-orchestrator';

function enabledPlugin(
	name: string,
	version: string,
	location: CataloguedPlugin['location'] = 'user'
): CataloguedPlugin {
	return {
		dir: `/plugins/${name}`,
		location,
		manifest: { name, version },
		status: 'enabled'
	};
}

const noPlugins = (): CataloguedPlugin[] => [];

let tmpDir: string;

beforeEach(async () => {
	tmpDir = path.join(os.tmpdir(), `valora-plugin-orch-${randomUUID()}`);
	await fs.mkdir(tmpDir, { recursive: true });
	resetPendingPluginUpdateCheck();
	vi.clearAllMocks();
});

afterEach(async () => {
	await fs.rm(tmpDir, { force: true, recursive: true });
});

const NOW = new Date('2026-04-20T12:00:00Z');

describe('settlePluginUpdateCheck', () => {
	it('returns empty array when no check is pending', async () => {
		const result = await settlePluginUpdateCheck(50);
		expect(result).toEqual([]);
	});

	it('returns outdated plugins found in the registry catalog', async () => {
		vi.mocked(fetchPluginRegistry).mockResolvedValue([
			{
				name: 'valora-plugin-rtk',
				package: '@windagency/valora-plugin-rtk',
				version: '1.1.0',
				contributes: [],
				description: ''
			}
		]);

		schedulePluginUpdateCheck(tmpDir, '2.5.0', 7, {
			now: NOW,
			loadPlugins: () => [enabledPlugin('valora-plugin-rtk', '1.0.0')]
		});
		const result = await settlePluginUpdateCheck(2000);

		expect(result).toHaveLength(1);
		expect(result[0]?.name).toBe('valora-plugin-rtk');
		expect(result[0]?.latestVersion).toBe('1.1.0');
		expect(result[0]?.source).toBe('registry');
	});

	it('falls back to npm lookup for plugins absent from the registry catalog', async () => {
		vi.mocked(fetchPluginRegistry).mockResolvedValue([]);
		vi.mocked(fetchLatestVersionFor).mockResolvedValue('2.0.0');

		schedulePluginUpdateCheck(tmpDir, '2.5.0', 7, {
			now: NOW,
			loadPlugins: () => [enabledPlugin('valora-plugin-custom', '1.0.0')]
		});
		const result = await settlePluginUpdateCheck(2000);

		expect(result).toHaveLength(1);
		expect(result[0]?.latestVersion).toBe('2.0.0');
		expect(result[0]?.source).toBe('npm');
	});

	it('returns empty when all plugins are up-to-date', async () => {
		vi.mocked(fetchPluginRegistry).mockResolvedValue([
			{
				name: 'valora-plugin-rtk',
				package: '@windagency/valora-plugin-rtk',
				version: '1.1.0',
				contributes: [],
				description: ''
			}
		]);

		schedulePluginUpdateCheck(tmpDir, '2.5.0', 7, {
			now: NOW,
			loadPlugins: () => [enabledPlugin('valora-plugin-rtk', '1.1.0')]
		});
		const result = await settlePluginUpdateCheck(2000);

		expect(result).toHaveLength(0);
	});

	it('skips built-in plugins', async () => {
		vi.mocked(fetchPluginRegistry).mockResolvedValue([
			{
				name: 'valora-plugin-rtk',
				package: '@windagency/valora-plugin-rtk',
				version: '2.0.0',
				contributes: [],
				description: ''
			}
		]);

		schedulePluginUpdateCheck(tmpDir, '2.5.0', 7, {
			now: NOW,
			loadPlugins: () => [enabledPlugin('valora-plugin-rtk', '1.0.0', 'built-in')]
		});
		const result = await settlePluginUpdateCheck(2000);

		expect(result).toHaveLength(0);
	});

	it('does not re-check when still inside the frequency window', async () => {
		await writeUpdateState(tmpDir, { ...DEFAULT_STATE, lastCheckAt: NOW.toISOString() });

		schedulePluginUpdateCheck(tmpDir, '2.5.0', 7, { now: NOW, loadPlugins: noPlugins });
		const result = await settlePluginUpdateCheck(500);

		expect(vi.mocked(fetchPluginRegistry)).not.toHaveBeenCalled();
		expect(result).toEqual([]);
	});

	it('persists latest plugin version to state after check', async () => {
		vi.mocked(fetchPluginRegistry).mockResolvedValue([
			{
				name: 'valora-plugin-rtk',
				package: '@windagency/valora-plugin-rtk',
				version: '1.2.0',
				contributes: [],
				description: ''
			}
		]);

		schedulePluginUpdateCheck(tmpDir, '2.5.0', 7, {
			now: NOW,
			loadPlugins: () => [enabledPlugin('valora-plugin-rtk', '1.0.0')]
		});
		await settlePluginUpdateCheck(2000);

		const { readUpdateState } = await import('updater/state');
		const state = await readUpdateState(tmpDir);
		expect(state.plugins['valora-plugin-rtk']?.latestVersion).toBe('1.2.0');
	});

	it('returns empty on timeout (slow registry)', async () => {
		vi.mocked(fetchPluginRegistry).mockImplementation(
			() => new Promise((resolve) => setTimeout(() => resolve([]), 1000))
		);

		schedulePluginUpdateCheck(tmpDir, '2.5.0', 7, {
			now: NOW,
			loadPlugins: () => [enabledPlugin('valora-plugin-rtk', '1.0.0')]
		});
		const result = await settlePluginUpdateCheck(50);

		expect(result).toEqual([]);
	});

	it('ignores a second schedulePluginUpdateCheck while one is pending', async () => {
		vi.mocked(fetchPluginRegistry).mockResolvedValue([
			{
				name: 'valora-plugin-rtk',
				package: '@windagency/valora-plugin-rtk',
				version: '1.1.0',
				contributes: [],
				description: ''
			}
		]);

		schedulePluginUpdateCheck(tmpDir, '2.5.0', 7, {
			now: NOW,
			loadPlugins: () => [enabledPlugin('valora-plugin-rtk', '1.0.0')]
		});
		schedulePluginUpdateCheck(tmpDir, '2.5.1', 7, { now: NOW, loadPlugins: noPlugins }); // should be ignored

		await settlePluginUpdateCheck(2000);
		expect(vi.mocked(fetchPluginRegistry)).toHaveBeenCalledTimes(1);
	});
});
