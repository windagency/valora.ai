import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OutdatedPlugin } from 'updater/plugin-compare';

vi.mock('plugins/plugin-installer.service', async (importOriginal) => {
	const actual = await importOriginal<typeof import('plugins/plugin-installer.service')>();
	return {
		...actual,
		PluginInstallerService: vi.fn().mockImplementation(() => ({
			install: vi.fn().mockResolvedValue(undefined)
		}))
	};
});

import { PluginInstallerService } from 'plugins/plugin-installer.service';

import { autoInstallOutdatedPlugins, autoInstallPlugin } from './auto-plugin-install';

function outdated(overrides: Partial<OutdatedPlugin> = {}): OutdatedPlugin {
	return {
		currentVersion: '1.0.0',
		latestVersion: '1.1.0',
		location: 'user',
		name: 'valora-plugin-rtk',
		packageName: '@windagency/valora-plugin-rtk',
		source: 'registry',
		...overrides
	};
}

let stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	vi.clearAllMocks();
	stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

describe('autoInstallPlugin', () => {
	it('calls installer.install for a user-scoped plugin and writes a success line', async () => {
		const installer = new PluginInstallerService({ run: vi.fn() });
		const mockInstall = vi.mocked(installer.install);

		await autoInstallPlugin(installer, outdated());

		expect(mockInstall).toHaveBeenCalledWith('valora-plugin-rtk', 'user', undefined);
		const output = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
		expect(output).toContain('Updating plugin valora-plugin-rtk');
		expect(output).toContain('✓ Plugin valora-plugin-rtk updated');
	});

	it('writes a warning and skips install for npm-scoped plugins', async () => {
		const installer = new PluginInstallerService({ run: vi.fn() });
		const mockInstall = vi.mocked(installer.install);

		await autoInstallPlugin(installer, outdated({ location: 'npm' }));

		expect(mockInstall).not.toHaveBeenCalled();
		const output = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
		expect(output).toContain('managed by your package manager');
	});

	it('writes an error line and does not throw when installer.install rejects', async () => {
		const installer = new PluginInstallerService({ run: vi.fn() });
		vi.mocked(installer.install).mockRejectedValue(new Error('network error'));

		await expect(autoInstallPlugin(installer, outdated())).resolves.toBeUndefined();
		const output = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
		expect(output).toContain('✗ Plugin valora-plugin-rtk: network error');
	});
});

describe('autoInstallOutdatedPlugins', () => {
	it('does nothing when the list is empty', async () => {
		const installer = new PluginInstallerService({ run: vi.fn() });
		await autoInstallOutdatedPlugins(installer, [], { policy: 'install' });
		expect(stderrSpy).not.toHaveBeenCalled();
	});

	it('honours check-only policy by listing updates and never invoking install', async () => {
		const installer = new PluginInstallerService({ run: vi.fn() });
		const plugins = [
			outdated({ name: 'valora-plugin-rtk', location: 'user' }),
			outdated({ name: 'valora-plugin-eng', packageName: '@windagency/valora-plugin-eng', location: 'project' })
		];

		await autoInstallOutdatedPlugins(installer, plugins, { policy: 'check-only' });

		expect(vi.mocked(installer.install)).not.toHaveBeenCalled();
		const output = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
		expect(output).toContain('2 plugin update(s) available');
		expect(output).toContain('valora-plugin-rtk');
		expect(output).toContain('valora plugin update');
	});

	it('honours prompt policy and installs only when the confirm callback returns true', async () => {
		const installer = new PluginInstallerService({ run: vi.fn() });
		const confirm = vi
			.fn<[OutdatedPlugin], Promise<boolean>>()
			.mockResolvedValueOnce(true) // first plugin accepted
			.mockResolvedValueOnce(false); // second declined
		const plugins = [
			outdated({ name: 'valora-plugin-rtk', location: 'user' }),
			outdated({ name: 'valora-plugin-eng', packageName: '@windagency/valora-plugin-eng', location: 'user' })
		];

		await autoInstallOutdatedPlugins(installer, plugins, { policy: 'prompt', confirm });

		expect(vi.mocked(installer.install)).toHaveBeenCalledTimes(1);
		expect(vi.mocked(installer.install)).toHaveBeenCalledWith('valora-plugin-rtk', 'user', undefined);
		const output = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
		expect(output).toContain('Skipped valora-plugin-eng');
	});

	it('installs each non-npm plugin in sequence', async () => {
		const installer = new PluginInstallerService({ run: vi.fn() });
		const plugins = [
			outdated({ name: 'valora-plugin-rtk', location: 'user' }),
			outdated({ name: 'valora-plugin-eng', packageName: '@windagency/valora-plugin-eng', location: 'project' })
		];

		await autoInstallOutdatedPlugins(installer, plugins, { policy: 'install' });

		expect(vi.mocked(installer.install)).toHaveBeenCalledTimes(2);
		expect(vi.mocked(installer.install)).toHaveBeenNthCalledWith(1, 'valora-plugin-rtk', 'user', undefined);
		expect(vi.mocked(installer.install)).toHaveBeenNthCalledWith(2, 'valora-plugin-eng', 'project', undefined);
	});

	it('skips npm-scoped plugins and continues with others', async () => {
		const installer = new PluginInstallerService({ run: vi.fn() });
		const plugins = [
			outdated({ name: 'valora-plugin-rtk', location: 'npm' }),
			outdated({ name: 'valora-plugin-eng', packageName: '@windagency/valora-plugin-eng', location: 'user' })
		];

		await autoInstallOutdatedPlugins(installer, plugins, { policy: 'install' });

		expect(vi.mocked(installer.install)).toHaveBeenCalledTimes(1);
		expect(vi.mocked(installer.install)).toHaveBeenCalledWith('valora-plugin-eng', 'user', undefined);
	});
});
