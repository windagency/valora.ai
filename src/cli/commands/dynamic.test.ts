import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LoadedPlugin } from 'types/plugin.types';
import type { RegistryEntry } from 'plugins/plugin-registry.service';

vi.mock('di/container', () => ({
	createContainer: vi.fn(() => ({})),
	getLoadedPlugins: vi.fn(() => []),
	initializePlugins: vi.fn(),
	SERVICE_IDENTIFIERS: {}
}));

vi.mock('plugins/plugin-registry.service', () => ({
	fetchPluginRegistry: vi.fn()
}));

vi.mock('executor/command-discovery', () => ({
	listAvailableCommands: vi.fn(async () => [])
}));

vi.mock('utils/file-utils', () => ({
	listFiles: vi.fn(async () => [])
}));

vi.mock('output/color-adapter.interface', () => ({
	getColorAdapter: vi.fn(() => ({
		bold: (s: string) => s,
		cyan: (s: string) => s,
		dim: (s: string) => s,
		gray: (s: string) => s,
		green: (s: string) => s,
		red: (s: string) => s,
		yellow: (s: string) => s
	}))
}));

vi.mock('cleanup/coordinator', () => ({
	stopAllCleanupSchedulers: vi.fn()
}));

vi.mock('config/loader', () => ({
	getConfigLoader: vi.fn(() => ({ get: vi.fn(() => ({})), warnUnknownProviders: vi.fn() }))
}));

vi.mock('config/wizard', () => ({
	SetupWizard: { needsSetup: vi.fn(async () => false) }
}));

vi.mock('output/logger', () => ({
	getLogger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		setLevel: vi.fn(),
		warn: vi.fn()
	}))
}));

vi.mock('utils/error-handler', () => ({
	formatError: vi.fn((e: Error) => e.message)
}));

vi.mock('utils/help-content', () => ({
	getCommandHelp: vi.fn(() => null)
}));

vi.mock('cli/document-output-processor', () => ({
	DocumentOutputProcessor: { buildOptionsFromCli: vi.fn(() => ({})) }
}));

import { getLoadedPlugins } from 'di/container';
import { listAvailableCommands } from 'executor/command-discovery';
import { fetchPluginRegistry } from 'plugins/plugin-registry.service';

import { configureListCommand } from './dynamic';

function makePlugin(partial: Partial<LoadedPlugin>): LoadedPlugin {
	return {
		location: 'built-in',
		manifest: { name: 'valora-plugin-rtk', version: '1.0.0' },
		pluginDir: '/plugins/valora-plugin-rtk',
		status: 'enabled',
		...partial
	};
}

function makeRegistryEntry(partial: Partial<RegistryEntry>): RegistryEntry {
	return {
		contributes: ['commands'],
		description: 'A plugin.',
		name: 'valora-plugin-example',
		package: '@windagency/valora-plugin-example',
		version: '1.0.0',
		...partial
	};
}

function makeProgram(): Command {
	const program = new Command();
	program.exitOverride();
	configureListCommand(program as never);
	return program;
}

async function runList(program: Command): Promise<void> {
	await program.parseAsync(['node', 'valora', 'list']);
}

describe('configureListCommand', () => {
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

	it('shows the scope label next to each loaded plugin', async () => {
		vi.mocked(getLoadedPlugins).mockReturnValue([
			makePlugin({ location: 'user', manifest: { name: 'valora-plugin-engineering', version: '1.0.0' } })
		]);
		vi.mocked(fetchPluginRegistry).mockResolvedValue(null);

		await runList(makeProgram());

		const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
		expect(output).toContain('valora-plugin-engineering');
		expect(output).toContain('[user]');
	});

	it('shows the Available to install section with registry entries when no plugins are loaded', async () => {
		vi.mocked(getLoadedPlugins).mockReturnValue([]);
		vi.mocked(fetchPluginRegistry).mockResolvedValue([
			makeRegistryEntry({
				contributes: ['commands', 'agents'],
				description: 'Engineering commands.',
				name: 'valora-plugin-engineering'
			})
		]);

		await runList(makeProgram());

		const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
		expect(output).toContain('Available to install');
		expect(output).toContain('valora-plugin-engineering');
		expect(output).toContain('valora plugin add');
	});

	it('lists command names under a loaded plugin that contributes commands', async () => {
		vi.mocked(getLoadedPlugins).mockReturnValue([
			makePlugin({
				commandsDir: '/plugins/valora-plugin-engineering/commands',
				manifest: { contributes: ['commands'], name: 'valora-plugin-engineering', version: '1.0.0' }
			})
		]);
		vi.mocked(listAvailableCommands).mockResolvedValue(['plan', 'implement']);
		vi.mocked(fetchPluginRegistry).mockResolvedValue(null);

		await runList(makeProgram());

		const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
		expect(output).toContain('valora-plugin-engineering');
		expect(output).toContain('plan');
		expect(output).toContain('implement');
	});

	it('shows hooks information for a plugin that only contributes hooks', async () => {
		vi.mocked(getLoadedPlugins).mockReturnValue([
			makePlugin({
				hooks: { PreToolUse: [] },
				manifest: { contributes: ['hooks'], name: 'valora-plugin-rtk', version: '1.0.0' }
			})
		]);
		vi.mocked(fetchPluginRegistry).mockResolvedValue(null);

		await runList(makeProgram());

		const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
		expect(output).toContain('valora-plugin-rtk');
		expect(output).toMatch(/hooks/);
		expect(output).not.toMatch(/commands:/);
	});

	it('omits the Available to install section when the registry fetch returns null', async () => {
		vi.mocked(getLoadedPlugins).mockReturnValue([
			makePlugin({
				hooks: { PreToolUse: [] },
				manifest: { contributes: ['hooks'], name: 'valora-plugin-rtk', version: '1.0.0' }
			})
		]);
		vi.mocked(fetchPluginRegistry).mockResolvedValue(null);

		await runList(makeProgram());

		const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
		expect(output).not.toContain('Available to install');
		expect(output).toContain('valora-plugin-rtk');
	});

	it('excludes loaded plugins from the Available to install section', async () => {
		vi.mocked(getLoadedPlugins).mockReturnValue([
			makePlugin({
				hooks: { PreToolUse: [] },
				manifest: { contributes: ['hooks'], name: 'valora-plugin-rtk', version: '1.0.0' }
			})
		]);
		vi.mocked(fetchPluginRegistry).mockResolvedValue([
			makeRegistryEntry({ contributes: ['hooks', 'code'], description: 'RTK integration.', name: 'valora-plugin-rtk' }),
			makeRegistryEntry({ contributes: ['commands'], description: 'Engineering.', name: 'valora-plugin-engineering' })
		]);

		await runList(makeProgram());

		const lines = consoleSpy.mock.calls.map((c) => c.join(' '));
		const availIdx = lines.findIndex((l) => l.includes('Available to install'));

		expect(availIdx).toBeGreaterThanOrEqual(0);
		const rtkInAvailable = lines.slice(availIdx + 1).some((l) => l.includes('valora-plugin-rtk'));
		const engineeringInAvailable = lines.slice(availIdx + 1).some((l) => l.includes('valora-plugin-engineering'));
		expect(rtkInAvailable).toBe(false);
		expect(engineeringInAvailable).toBe(true);
	});
});
