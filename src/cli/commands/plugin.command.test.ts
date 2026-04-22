import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CataloguedPlugin } from 'types/plugin.types';
import type { RegistryEntry } from 'plugins/plugin-registry.service';

vi.mock('plugins/plugin-loader.service', () => ({
	PluginLoaderService: vi.fn().mockImplementation(() => ({
		catalogAll: vi.fn(() => [])
	}))
}));

vi.mock('plugins/plugin-installer.service', async (importOriginal) => {
	const actual = await importOriginal<typeof import('plugins/plugin-installer.service')>();
	return {
		...actual,
		PluginInstallerService: vi.fn().mockImplementation(() => ({
			install: vi.fn(),
			uninstall: vi.fn()
		}))
	};
});

vi.mock('plugins/plugin-registry.service', () => ({
	fetchPluginRegistry: vi.fn()
}));

vi.mock('updater/registry', () => ({
	fetchLatestVersionFor: vi.fn().mockResolvedValue(null)
}));

vi.mock('config/loader', () => ({
	getConfigLoader: vi.fn(() => ({
		get: vi.fn(() => ({ plugins: { enabled: [] } }))
	}))
}));

vi.mock('output/color-adapter.interface', () => ({
	getColorAdapter: vi.fn(() => ({
		bold: (s: string) => s,
		cyan: (s: string) => s,
		dim: (s: string) => s,
		green: (s: string) => s,
		red: (s: string) => s,
		yellow: (s: string) => s
	}))
}));

import { PluginInstallerService } from 'plugins/plugin-installer.service';
import { PluginLoaderService } from 'plugins/plugin-loader.service';
import { fetchPluginRegistry } from 'plugins/plugin-registry.service';
import { fetchLatestVersionFor } from 'updater/registry';

import { configurePluginCommand } from './plugin.command';

type MockedCatalogAll = ReturnType<typeof vi.fn>;

function makeCatalogAll(plugins: CataloguedPlugin[]): MockedCatalogAll {
	return vi.fn(() => plugins);
}

function makePlugin(partial: Partial<CataloguedPlugin>): CataloguedPlugin {
	return {
		dir: '/some/dir/valora-plugin-rtk',
		location: 'user',
		manifest: { name: 'valora-plugin-rtk', version: '1.0.0' },
		status: 'enabled',
		...partial
	};
}

function makeProgram(): Command {
	const program = new Command();
	program.exitOverride();
	configurePluginCommand(program as never);
	return program;
}

async function runCommand(program: Command, args: string[]): Promise<void> {
	await program.parseAsync(['node', 'valora', ...args]);
}

describe('plugin list', () => {
	let consoleSpy: ReturnType<typeof vi.spyOn>;
	let exitSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
	});

	afterEach(() => {
		consoleSpy.mockRestore();
		exitSpy.mockRestore();
		vi.clearAllMocks();
	});

	it('prints enabled plugins with a checkmark', async () => {
		(PluginLoaderService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			catalogAll: makeCatalogAll([makePlugin({ status: 'enabled' })])
		}));

		const program = makeProgram();
		await runCommand(program, ['plugin', 'list']);

		const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
		expect(output).toContain('✓');
		expect(output).toContain('valora-plugin-rtk');
	});

	it('prints disabled plugins with a circle marker', async () => {
		(PluginLoaderService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			catalogAll: makeCatalogAll([makePlugin({ status: 'disabled' })])
		}));

		const program = makeProgram();
		await runCommand(program, ['plugin', 'list']);

		const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
		expect(output).toContain('○');
	});

	it('prints invalid plugins with a cross marker', async () => {
		(PluginLoaderService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			catalogAll: makeCatalogAll([makePlugin({ manifest: null, status: 'invalid' })])
		}));

		const program = makeProgram();
		await runCommand(program, ['plugin', 'list']);

		const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
		expect(output).toContain('✗');
	});

	it('prints a summary header with counts', async () => {
		(PluginLoaderService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			catalogAll: makeCatalogAll([makePlugin({ status: 'enabled' }), makePlugin({ status: 'disabled' })])
		}));

		const program = makeProgram();
		await runCommand(program, ['plugin', 'list']);

		const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
		expect(output).toContain('1 enabled');
		expect(output).toContain('1 disabled');
	});

	it('shows a message when no plugins are discovered', async () => {
		(PluginLoaderService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			catalogAll: makeCatalogAll([])
		}));

		const program = makeProgram();
		await runCommand(program, ['plugin', 'list']);

		const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
		expect(output).toContain('none');
	});
});

describe('plugin available', () => {
	let consoleSpy: ReturnType<typeof vi.spyOn>;
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
	let exitSpy: ReturnType<typeof vi.spyOn>;

	const sampleRegistry: RegistryEntry[] = [
		{
			contributes: ['agents', 'commands'],
			description: 'Engineering commands.',
			name: 'valora-plugin-engineering',
			package: '@windagency/valora-plugin-engineering',
			version: '1.0.0'
		},
		{
			contributes: ['hooks', 'code'],
			description: 'RTK integration.',
			name: 'valora-plugin-rtk',
			package: '@windagency/valora-plugin-rtk',
			version: '1.0.0'
		}
	];

	beforeEach(() => {
		consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
	});

	afterEach(() => {
		consoleSpy.mockRestore();
		consoleErrorSpy.mockRestore();
		exitSpy.mockRestore();
		vi.clearAllMocks();
	});

	it('lists all plugins from the registry', async () => {
		vi.mocked(fetchPluginRegistry).mockResolvedValue(sampleRegistry);
		(PluginLoaderService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			catalogAll: makeCatalogAll([])
		}));

		const program = makeProgram();
		await runCommand(program, ['plugin', 'available']);

		const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
		expect(output).toContain('valora-plugin-engineering');
		expect(output).toContain('valora-plugin-rtk');
	});

	it('marks installed plugins with a checkmark', async () => {
		vi.mocked(fetchPluginRegistry).mockResolvedValue(sampleRegistry);
		(PluginLoaderService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			catalogAll: makeCatalogAll([makePlugin({ dir: '/some/dir/valora-plugin-rtk', status: 'enabled' })])
		}));

		const program = makeProgram();
		await runCommand(program, ['plugin', 'available']);

		const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
		expect(output).toMatch(/✓.*valora-plugin-rtk/);
	});

	it('marks not-installed plugins with a circle marker', async () => {
		vi.mocked(fetchPluginRegistry).mockResolvedValue(sampleRegistry);
		(PluginLoaderService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			catalogAll: makeCatalogAll([])
		}));

		const program = makeProgram();
		await runCommand(program, ['plugin', 'available']);

		const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
		expect(output).toMatch(/○.*valora-plugin-engineering/);
	});

	it('prints an install hint footer', async () => {
		vi.mocked(fetchPluginRegistry).mockResolvedValue(sampleRegistry);
		(PluginLoaderService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			catalogAll: makeCatalogAll([])
		}));

		const program = makeProgram();
		await runCommand(program, ['plugin', 'available']);

		const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
		expect(output).toContain('valora plugin add');
	});

	it('shows an error and exits when the registry fetch fails', async () => {
		vi.mocked(fetchPluginRegistry).mockResolvedValue(null);

		const program = makeProgram();
		await runCommand(program, ['plugin', 'available']);

		expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('registry'));
		expect(exitSpy).toHaveBeenCalledWith(1);
	});
});

describe('plugin add', () => {
	let consoleSpy: ReturnType<typeof vi.spyOn>;
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
	let exitSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
	});

	afterEach(() => {
		consoleSpy.mockRestore();
		consoleErrorSpy.mockRestore();
		exitSpy.mockRestore();
		vi.clearAllMocks();
	});

	it('calls install and prints a success message', async () => {
		const mockInstall = vi.fn().mockResolvedValue(undefined);
		(PluginInstallerService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			install: mockInstall
		}));

		const program = makeProgram();
		await runCommand(program, ['plugin', 'add', 'rtk']);

		expect(mockInstall).toHaveBeenCalledWith('rtk', 'user');
		expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('installed'));
	});

	it('prints an error and exits when install throws', async () => {
		(PluginInstallerService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			install: vi.fn().mockRejectedValue(new Error('npm 404'))
		}));

		const program = makeProgram();
		await runCommand(program, ['plugin', 'add', 'rtk']);

		expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('npm 404'));
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	it('rejects an invalid scope', async () => {
		const program = makeProgram();
		await runCommand(program, ['plugin', 'add', 'rtk', '--scope', 'invalid']);

		expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid scope'));
		expect(exitSpy).toHaveBeenCalledWith(1);
	});
});

describe('plugin update --check', () => {
	let consoleSpy: ReturnType<typeof vi.spyOn>;
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
	let exitSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
	});

	afterEach(() => {
		consoleSpy.mockRestore();
		consoleErrorSpy.mockRestore();
		exitSpy.mockRestore();
		vi.clearAllMocks();
	});

	it('lists outdated plugins without installing when --check is passed', async () => {
		(PluginLoaderService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			catalogAll: makeCatalogAll([
				makePlugin({ manifest: { name: 'valora-plugin-rtk', version: '1.0.0' }, location: 'user', status: 'enabled' })
			])
		}));
		vi.mocked(fetchPluginRegistry).mockResolvedValue([
			{
				name: 'valora-plugin-rtk',
				package: '@windagency/valora-plugin-rtk',
				version: '1.1.0',
				contributes: [],
				description: ''
			}
		]);

		const program = makeProgram();
		await runCommand(program, ['plugin', 'update', '--check']);

		const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
		expect(output).toContain('valora-plugin-rtk');
		expect(output).toContain('1.0.0');
		expect(output).toContain('1.1.0');
		const mockInstall = (PluginInstallerService as ReturnType<typeof vi.fn>).mock.results[0]?.value?.install;
		if (mockInstall) expect(mockInstall).not.toHaveBeenCalled();
	});

	it('prints a message when all plugins are up to date', async () => {
		(PluginLoaderService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			catalogAll: makeCatalogAll([
				makePlugin({ manifest: { name: 'valora-plugin-rtk', version: '1.1.0' }, status: 'enabled' })
			])
		}));
		vi.mocked(fetchPluginRegistry).mockResolvedValue([
			{
				name: 'valora-plugin-rtk',
				package: '@windagency/valora-plugin-rtk',
				version: '1.1.0',
				contributes: [],
				description: ''
			}
		]);

		const program = makeProgram();
		await runCommand(program, ['plugin', 'update', '--check']);

		const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
		expect(output).toContain('up to date');
	});
});

describe('plugin update (install)', () => {
	let consoleSpy: ReturnType<typeof vi.spyOn>;
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
	let exitSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
	});

	afterEach(() => {
		consoleSpy.mockRestore();
		consoleErrorSpy.mockRestore();
		exitSpy.mockRestore();
		vi.clearAllMocks();
	});

	it('installs all outdated non-npm plugins when no name is specified', async () => {
		const mockInstall = vi.fn().mockResolvedValue(undefined);
		(PluginInstallerService as ReturnType<typeof vi.fn>).mockImplementation(() => ({
			install: mockInstall,
			uninstall: vi.fn()
		}));
		(PluginLoaderService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			catalogAll: makeCatalogAll([
				makePlugin({ manifest: { name: 'valora-plugin-rtk', version: '1.0.0' }, location: 'user', status: 'enabled' }),
				makePlugin({
					dir: '/plugins/valora-plugin-eng',
					manifest: { name: 'valora-plugin-eng', version: '2.0.0' },
					location: 'project',
					status: 'enabled'
				})
			])
		}));
		vi.mocked(fetchPluginRegistry).mockResolvedValue([
			{
				name: 'valora-plugin-rtk',
				package: '@windagency/valora-plugin-rtk',
				version: '1.1.0',
				contributes: [],
				description: ''
			},
			{
				name: 'valora-plugin-eng',
				package: '@windagency/valora-plugin-eng',
				version: '2.1.0',
				contributes: [],
				description: ''
			}
		]);

		const program = makeProgram();
		await runCommand(program, ['plugin', 'update']);

		expect(mockInstall).toHaveBeenCalledTimes(2);
		expect(mockInstall).toHaveBeenCalledWith('valora-plugin-rtk', 'user');
		expect(mockInstall).toHaveBeenCalledWith('valora-plugin-eng', 'project');
	});

	it('installs only the named plugin when a name is provided', async () => {
		const mockInstall = vi.fn().mockResolvedValue(undefined);
		(PluginInstallerService as ReturnType<typeof vi.fn>).mockImplementation(() => ({
			install: mockInstall,
			uninstall: vi.fn()
		}));
		(PluginLoaderService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			catalogAll: makeCatalogAll([
				makePlugin({ manifest: { name: 'valora-plugin-rtk', version: '1.0.0' }, location: 'user', status: 'enabled' }),
				makePlugin({
					dir: '/plugins/valora-plugin-eng',
					manifest: { name: 'valora-plugin-eng', version: '2.0.0' },
					location: 'user',
					status: 'enabled'
				})
			])
		}));
		vi.mocked(fetchPluginRegistry).mockResolvedValue([
			{
				name: 'valora-plugin-rtk',
				package: '@windagency/valora-plugin-rtk',
				version: '1.1.0',
				contributes: [],
				description: ''
			},
			{
				name: 'valora-plugin-eng',
				package: '@windagency/valora-plugin-eng',
				version: '2.1.0',
				contributes: [],
				description: ''
			}
		]);

		const program = makeProgram();
		await runCommand(program, ['plugin', 'update', 'rtk']);

		expect(mockInstall).toHaveBeenCalledTimes(1);
		expect(mockInstall).toHaveBeenCalledWith('valora-plugin-rtk', 'user');
	});

	it('warns and skips npm-scope plugins without installing', async () => {
		const mockInstall = vi.fn().mockResolvedValue(undefined);
		(PluginInstallerService as ReturnType<typeof vi.fn>).mockImplementation(() => ({
			install: mockInstall,
			uninstall: vi.fn()
		}));
		(PluginLoaderService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			catalogAll: makeCatalogAll([
				makePlugin({ manifest: { name: 'valora-plugin-rtk', version: '1.0.0' }, location: 'npm', status: 'enabled' })
			])
		}));
		vi.mocked(fetchPluginRegistry).mockResolvedValue([
			{
				name: 'valora-plugin-rtk',
				package: '@windagency/valora-plugin-rtk',
				version: '1.1.0',
				contributes: [],
				description: ''
			}
		]);

		const program = makeProgram();
		await runCommand(program, ['plugin', 'update']);

		expect(mockInstall).not.toHaveBeenCalled();
		const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
		expect(output).toContain('package manager');
	});

	it('prints a message when no plugins need updating', async () => {
		(PluginLoaderService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			catalogAll: makeCatalogAll([
				makePlugin({ manifest: { name: 'valora-plugin-rtk', version: '1.1.0' }, location: 'user', status: 'enabled' })
			])
		}));
		vi.mocked(fetchPluginRegistry).mockResolvedValue([
			{
				name: 'valora-plugin-rtk',
				package: '@windagency/valora-plugin-rtk',
				version: '1.1.0',
				contributes: [],
				description: ''
			}
		]);

		const program = makeProgram();
		await runCommand(program, ['plugin', 'update']);

		const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
		expect(output).toContain('up to date');
	});

	it('falls back to npm for plugins absent from the registry catalog', async () => {
		const mockInstall = vi.fn().mockResolvedValue(undefined);
		(PluginInstallerService as ReturnType<typeof vi.fn>).mockImplementation(() => ({
			install: mockInstall,
			uninstall: vi.fn()
		}));
		(PluginLoaderService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			catalogAll: makeCatalogAll([
				makePlugin({
					manifest: { name: 'valora-plugin-custom', version: '1.0.0' },
					location: 'user',
					status: 'enabled'
				})
			])
		}));
		vi.mocked(fetchPluginRegistry).mockResolvedValue([]);
		vi.mocked(fetchLatestVersionFor).mockResolvedValue('2.0.0');

		const program = makeProgram();
		await runCommand(program, ['plugin', 'update', '--check']);

		const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
		expect(output).toContain('valora-plugin-custom');
		expect(output).toContain('2.0.0');
	});
});

describe('plugin remove', () => {
	let consoleSpy: ReturnType<typeof vi.spyOn>;
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
	let exitSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
	});

	afterEach(() => {
		consoleSpy.mockRestore();
		consoleErrorSpy.mockRestore();
		exitSpy.mockRestore();
		vi.clearAllMocks();
	});

	it('calls uninstall and prints a success message', async () => {
		const mockUninstall = vi.fn();
		(PluginInstallerService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			uninstall: mockUninstall
		}));

		const program = makeProgram();
		await runCommand(program, ['plugin', 'remove', 'rtk']);

		expect(mockUninstall).toHaveBeenCalledWith('rtk', 'user');
		expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('removed'));
	});

	it('prints an error and exits when the plugin is not installed', async () => {
		(PluginInstallerService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			uninstall: vi.fn().mockImplementation(() => {
				throw new Error('Plugin "valora-plugin-rtk" is not installed in the user scope');
			})
		}));

		const program = makeProgram();
		await runCommand(program, ['plugin', 'remove', 'rtk']);

		expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('not installed'));
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	it('rejects an invalid scope', async () => {
		const program = makeProgram();
		await runCommand(program, ['plugin', 'remove', 'rtk', '--scope', 'invalid']);

		expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid scope'));
		expect(exitSpy).toHaveBeenCalledWith(1);
	});
});
