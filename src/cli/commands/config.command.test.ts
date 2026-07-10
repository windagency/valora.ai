import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('di/container', () => ({
	createContainer: vi.fn(() => ({})),
	initializePlugins: vi.fn(async () => undefined)
}));

vi.mock('config/wizard', () => ({
	SetupWizard: vi.fn().mockImplementation(() => ({
		quickSetup: vi.fn(async () => undefined),
		run: vi.fn(async () => undefined)
	}))
}));

vi.mock('config/loader', () => ({
	ConfigLoader: vi.fn().mockImplementation(() => ({})),
	getConfigLoader: vi.fn(() => ({}))
}));

vi.mock('output/color-adapter.interface', () => ({
	getColorAdapter: vi.fn(() => ({
		green: (s: string) => s,
		red: (s: string) => s
	}))
}));

vi.mock('utils/paths', () => ({
	getRuntimeDataDir: vi.fn(() => '/mock/runtime'),
	getGlobalConfigDir: vi.fn(() => '/mock/global')
}));

vi.mock('utils/error-handler', () => ({
	formatError: vi.fn((e: Error) => e.message)
}));

const mockTrustWorkspace = vi.fn();
const mockRevokeWorkspaceTrust = vi.fn();
const mockIsWorkspaceTrusted = vi.fn();
vi.mock('security/workspace-trust.service', () => ({
	isWorkspaceTrusted: (...args: unknown[]) => mockIsWorkspaceTrusted(...args),
	revokeWorkspaceTrust: (...args: unknown[]) => mockRevokeWorkspaceTrust(...args),
	trustWorkspace: (...args: unknown[]) => mockTrustWorkspace(...args)
}));

import * as path from 'node:path';
import { createContainer, initializePlugins } from 'di/container';
import { SetupWizard } from 'config/wizard';
import { configureConfigCommand } from './config';

function makeProgram(): Command {
	const program = new Command();
	program.exitOverride();
	configureConfigCommand(program as never);
	return program;
}

async function runCommand(program: Command, args: string[]): Promise<void> {
	await program.parseAsync(['node', 'valora', ...args]);
}

describe('config setup', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('initialises plugins before running the wizard', async () => {
		const callOrder: string[] = [];
		vi.mocked(initializePlugins).mockImplementation(async () => {
			callOrder.push('initializePlugins');
		});
		const mockRun = vi.fn(async () => {
			callOrder.push('wizard.run');
		});
		vi.mocked(SetupWizard).mockImplementation(() => ({ run: mockRun, quickSetup: vi.fn() }));

		await runCommand(makeProgram(), ['config', 'setup']);

		expect(callOrder).toEqual(['initializePlugins', 'wizard.run']);
	});

	it('passes the container returned by createContainer to initializePlugins', async () => {
		const fakeContainer = { id: 'test-container' };
		vi.mocked(createContainer).mockReturnValue(fakeContainer as never);

		await runCommand(makeProgram(), ['config', 'setup']);

		expect(initializePlugins).toHaveBeenCalledWith(fakeContainer);
	});

	it('initialises plugins before running quickSetup', async () => {
		const callOrder: string[] = [];
		vi.mocked(initializePlugins).mockImplementation(async () => {
			callOrder.push('initializePlugins');
		});
		const mockQuickSetup = vi.fn(async () => {
			callOrder.push('wizard.quickSetup');
		});
		vi.mocked(SetupWizard).mockImplementation(() => ({ run: vi.fn(), quickSetup: mockQuickSetup }));

		await runCommand(makeProgram(), ['config', 'setup', '--quick']);

		expect(callOrder).toEqual(['initializePlugins', 'wizard.quickSetup']);
	});

	it('exits with an error when plugin initialisation fails', async () => {
		vi.mocked(initializePlugins).mockRejectedValue(new Error('plugin load failure'));
		const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		await runCommand(makeProgram(), ['config', 'setup']);

		expect(consoleErrorSpy).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('plugin load failure'));
		expect(exitSpy).toHaveBeenCalledWith(1);

		consoleErrorSpy.mockRestore();
		exitSpy.mockRestore();
	});
});

describe('config trust', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('trusts the current working directory', async () => {
		const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

		await runCommand(makeProgram(), ['config', 'trust']);

		expect(mockTrustWorkspace).toHaveBeenCalledWith(process.cwd());
		expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(process.cwd()));

		consoleLogSpy.mockRestore();
	});

	it('revokes trust for the current working directory', async () => {
		const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

		await runCommand(makeProgram(), ['config', 'untrust']);

		expect(mockRevokeWorkspaceTrust).toHaveBeenCalledWith(process.cwd());
		expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(process.cwd()));

		consoleLogSpy.mockRestore();
	});

	it('reports trust status for the current working directory', async () => {
		mockIsWorkspaceTrusted.mockReturnValue(true);
		const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

		await runCommand(makeProgram(), ['config', 'trust-status']);

		expect(mockIsWorkspaceTrusted).toHaveBeenCalledWith(process.cwd());
		expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Trusted'));

		consoleLogSpy.mockRestore();
	});

	it('reports not-trusted status when the directory has never been trusted', async () => {
		mockIsWorkspaceTrusted.mockReturnValue(false);
		const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

		await runCommand(makeProgram(), ['config', 'trust-status']);

		expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Not trusted'));

		consoleLogSpy.mockRestore();
	});
});
