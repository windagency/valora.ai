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

vi.mock('memory/registry', () => ({
	getMemoryRegistry: vi.fn(() => ({
		getActive: vi.fn(() => ({
			consolidate: vi.fn(async () => ({
				durationMs: 10,
				gitInvalidated: 0,
				merged: 0,
				promoted: 0,
				pruned: 0,
				staleMarked: 0
			}))
		}))
	}))
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

import { DocumentOutputProcessor } from 'cli/document-output-processor';
import { createContainer, getLoadedPlugins, initializePlugins } from 'di/container';
import { listAvailableCommands } from 'executor/command-discovery';
import { fetchPluginRegistry } from 'plugins/plugin-registry.service';

import {
	configureConsolidateCommand,
	configureExecCommand,
	configureListCommand,
	configureRolloutCommand,
	configureShortcutCommands
} from './dynamic';

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

describe('configureConsolidateCommand', () => {
	let consoleSpy: ReturnType<typeof vi.spyOn>;
	let exitSpy: ReturnType<typeof vi.spyOn>;

	function makeProgram(): Command {
		const program = new Command();
		program.exitOverride();
		configureConsolidateCommand(program as never);
		return program;
	}

	async function runConsolidate(program: Command, args: string[] = []): Promise<void> {
		await program.parseAsync(['node', 'valora', 'consolidate', ...args]);
	}

	beforeEach(() => {
		consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
		vi.mocked(createContainer).mockReturnValue({} as never);
		vi.mocked(initializePlugins).mockResolvedValue(undefined as never);
	});

	afterEach(() => {
		consoleSpy.mockRestore();
		exitSpy.mockRestore();
		vi.clearAllMocks();
	});

	it('initialises plugins before accessing the memory provider', async () => {
		await runConsolidate(makeProgram());

		expect(vi.mocked(createContainer)).toHaveBeenCalledOnce();
		expect(vi.mocked(initializePlugins)).toHaveBeenCalledOnce();
	});

	it('prints a consolidation summary on success', async () => {
		await runConsolidate(makeProgram());

		const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
		expect(output).toContain('Memory consolidation complete');
		expect(output).toContain('Pruned:');
	});

	it('exits with code 0 on success', async () => {
		await runConsolidate(makeProgram());

		expect(exitSpy).toHaveBeenCalledWith(0);
	});
});

describe('configureExecCommand', () => {
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
	let exitSpy: ReturnType<typeof vi.spyOn>;
	let mockExecute: ReturnType<typeof vi.fn>;

	function makeExecProgram(): Command {
		const program = new Command();
		program.exitOverride();
		configureExecCommand(program as never);
		return program;
	}

	async function runExec(program: Command, args: string[]): Promise<void> {
		await program.parseAsync(['node', 'valora', 'exec', ...args]);
	}

	beforeEach(() => {
		vi.spyOn(console, 'log').mockImplementation(() => undefined);
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
		mockExecute = vi.fn().mockResolvedValue(undefined);
		vi.mocked(createContainer).mockReturnValue({ resolve: vi.fn(() => ({ execute: mockExecute })) } as never);
		vi.mocked(initializePlugins).mockResolvedValue(undefined as never);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.clearAllMocks();
	});

	it('executes the requested command with its positional args and exits 0 on success', async () => {
		await runExec(makeExecProgram(), ['plan', 'do the thing']);

		expect(mockExecute).toHaveBeenCalledWith('plan', expect.objectContaining({ args: ['do the thing'] }));
		expect(exitSpy).toHaveBeenCalledWith(0);
	});

	it('prints an error and exits 1 when the executor throws', async () => {
		mockExecute.mockRejectedValue(new Error('stage failed'));

		await runExec(makeExecProgram(), ['plan']);

		expect(consoleErrorSpy).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('stage failed'));
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	it('parses --stage and --skip-validation into isolation options passed to the executor', async () => {
		await runExec(makeExecProgram(), ['plan', '--stage', 'implement', '--skip-validation']);

		expect(mockExecute).toHaveBeenCalledWith(
			'plan',
			expect.objectContaining({ isolation: expect.objectContaining({ skipValidation: true, stages: ['implement'] }) })
		);
	});

	it('parses --mock-inputs as JSON into isolation options', async () => {
		await runExec(makeExecProgram(), ['plan', '--mock-inputs', '{"stepA":{"foo":"bar"}}']);

		expect(mockExecute).toHaveBeenCalledWith(
			'plan',
			expect.objectContaining({ isolation: expect.objectContaining({ mockInputs: { stepA: { foo: 'bar' } } }) })
		);
	});

	it('parses --force-required into isolation options', async () => {
		await runExec(makeExecProgram(), ['plan', '--force-required']);

		expect(mockExecute).toHaveBeenCalledWith(
			'plan',
			expect.objectContaining({ isolation: expect.objectContaining({ forceRequired: true }) })
		);
	});

	it('passes --session-id and --interactive through to the executor', async () => {
		await runExec(makeExecProgram(), ['plan', '--session-id', 'sess-1', '--interactive']);

		expect(mockExecute).toHaveBeenCalledWith(
			'plan',
			expect.objectContaining({ interactive: true, sessionId: 'sess-1' })
		);
	});

	it("builds document output options from --document-* flags, correctly translating commander's --no-document-output negation", async () => {
		await runExec(makeExecProgram(), ['plan', '--no-document-output', '--document-category', 'backend']);

		expect(DocumentOutputProcessor.buildOptionsFromCli).toHaveBeenCalledWith(
			expect.objectContaining({ documentCategory: 'backend', noDocumentOutput: true })
		);
	});
});

describe('configureRolloutCommand', () => {
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
	let consoleLogSpy: ReturnType<typeof vi.spyOn>;
	let exitSpy: ReturnType<typeof vi.spyOn>;

	function makeRolloutProgram(): Command {
		const program = new Command();
		program.exitOverride();
		configureRolloutCommand(program as never);
		return program;
	}

	async function runRollout(program: Command, args: string[] = []): Promise<void> {
		await program.parseAsync(['node', 'valora', 'rollout', ...args]);
	}

	function output(): string {
		return consoleLogSpy.mock.calls.map((c) => c.join(' ')).join('\n');
	}

	beforeEach(() => {
		consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.clearAllMocks();
	});

	it('shows the default help hint and exits 0 when no options are given', async () => {
		await runRollout(makeRolloutProgram());

		expect(output()).toContain('Use --status, --analytics, --metrics, or --export options');
		expect(exitSpy).toHaveBeenCalledWith(0);
	});

	it('errors when --analytics is passed explicitly but analytics is disabled by default config', async () => {
		await runRollout(makeRolloutProgram(), ['--analytics', '48']);

		expect(output()).toContain('Agent selection analytics is disabled');
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	it('shows rollout status and feature flags with --status', async () => {
		await runRollout(makeRolloutProgram(), ['--status']);

		expect(output()).toContain('Dynamic Agent Selection Rollout Status');
	});

	it('errors when --metrics is requested but analytics is disabled by default config', async () => {
		await runRollout(makeRolloutProgram(), ['--metrics']);

		expect(output()).toContain('Agent selection analytics is disabled');
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	it('errors when --export is requested but analytics is disabled by default config', async () => {
		await runRollout(makeRolloutProgram(), ['--export', 'out.json']);

		expect(output()).toContain('Agent selection analytics is disabled');
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	it('errors on a non-numeric --analytics value', async () => {
		await runRollout(makeRolloutProgram(), ['--analytics', 'not-a-number']);

		expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid hours value'));
		expect(exitSpy).toHaveBeenCalledWith(1);
	});
});

describe('configureShortcutCommands', () => {
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
	let exitSpy: ReturnType<typeof vi.spyOn>;
	let mockExecute: ReturnType<typeof vi.fn>;

	function makeShortcutsProgram(): Command {
		const program = new Command();
		program.exitOverride();
		configureShortcutCommands(program as never);
		return program;
	}

	async function runShortcut(program: Command, cmd: string, args: string[] = []): Promise<void> {
		await program.parseAsync(['node', 'valora', cmd, ...args]);
	}

	beforeEach(() => {
		vi.spyOn(console, 'log').mockImplementation(() => undefined);
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
		mockExecute = vi.fn().mockResolvedValue(undefined);
		vi.mocked(createContainer).mockReturnValue({ resolve: vi.fn(() => ({ execute: mockExecute })) } as never);
		vi.mocked(initializePlugins).mockResolvedValue(undefined as never);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.clearAllMocks();
	});

	it('registers a subcommand for every declared shortcut', () => {
		const program = makeShortcutsProgram();
		const names = program.commands.map((c) => c.name());

		expect(names).toContain('plan');
		expect(names).toContain('implement');
		expect(names).toContain('commit');
	});

	it('executes the shortcut command with its positional args and exits 0 on success', async () => {
		await runShortcut(makeShortcutsProgram(), 'plan', ['Add auth']);

		expect(mockExecute).toHaveBeenCalledWith('plan', expect.objectContaining({ args: ['Add auth'] }));
		expect(exitSpy).toHaveBeenCalledWith(0);
	});

	it('merges an unrecognised --flag=value option into the executed flags via allowUnknownOption', async () => {
		await runShortcut(makeShortcutsProgram(), 'plan', ['--specs-file=docs/spec.md']);

		expect(mockExecute).toHaveBeenCalledWith(
			'plan',
			expect.objectContaining({ flags: expect.objectContaining({ 'specs-file': 'docs/spec.md' }) })
		);
	});

	it('prints an error and exits 1 when execution throws', async () => {
		mockExecute.mockRejectedValue(new Error('plan failed'));

		await runShortcut(makeShortcutsProgram(), 'plan');

		expect(consoleErrorSpy).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('plan failed'));
		expect(exitSpy).toHaveBeenCalledWith(1);
	});
});
