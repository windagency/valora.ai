import { EventEmitter } from 'node:events';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureUpdateCommand } from './update.command';

vi.mock('updater/registry', () => ({
	fetchLatestVersion: vi.fn()
}));

vi.mock('updater/detect-package-manager', () => ({
	detectPackageManager: vi.fn(),
	getInstallCommand: vi.fn((pm: string) => {
		switch (pm) {
			case 'npm':
				return ['npm', 'install', '-g', '@windagency/valora@latest'];
			case 'pnpm':
				return ['pnpm', 'add', '-g', '@windagency/valora@latest'];
			case 'yarn':
				return ['yarn', 'global', 'add', '@windagency/valora@latest'];
			case 'bun':
				return ['bun', 'install', '-g', '@windagency/valora@latest'];
			default:
				return [];
		}
	})
}));

vi.mock('updater/state', () => ({
	readUpdateState: vi.fn(),
	writeUpdateState: vi.fn()
}));

vi.mock('utils/paths', () => ({
	getGlobalConfigDir: vi.fn(() => '/tmp/valora-test-state')
}));

vi.mock('node:child_process', () => ({
	spawn: vi.fn()
}));

// Imports for mock access (must come after vi.mock declarations)
import { spawn } from 'node:child_process';

import { detectPackageManager, getInstallCommand } from 'updater/detect-package-manager';
import { fetchLatestVersion } from 'updater/registry';
import { readUpdateState, writeUpdateState } from 'updater/state';

type MockedSpawn = ReturnType<typeof vi.fn>;

const fetchLatestVersionMock = fetchLatestVersion as unknown as ReturnType<typeof vi.fn>;
const detectPackageManagerMock = detectPackageManager as unknown as ReturnType<typeof vi.fn>;
const getInstallCommandMock = getInstallCommand as unknown as ReturnType<typeof vi.fn>;
const readUpdateStateMock = readUpdateState as unknown as ReturnType<typeof vi.fn>;
const writeUpdateStateMock = writeUpdateState as unknown as ReturnType<typeof vi.fn>;
const spawnMock = spawn as unknown as MockedSpawn;

function makeChild(exitCode: number | null = 0): EventEmitter {
	const child = new EventEmitter();
	// Emit exit asynchronously so the promise listeners are attached first
	setImmediate(() => {
		child.emit('exit', exitCode);
	});
	return child;
}

function makeProgram(): Command {
	const program = new Command();
	// Prevent commander from calling process.exit on unknown errors in tests
	program.exitOverride();
	configureUpdateCommand(program);
	return program;
}

let logSpy: ReturnType<typeof vi.spyOn>;
let stdoutSpy: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	vi.clearAllMocks();
	logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
	stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
	exitSpy = vi.spyOn(process, 'exit').mockImplementation(((_code?: number) => undefined as never) as never);
	readUpdateStateMock.mockResolvedValue({
		schemaVersion: 1,
		lastCheckAt: new Date(0).toISOString(),
		lastSuccessAt: null,
		latestVersion: null,
		latestVersionFetchedAt: null,
		remindedForVersion: null,
		installedVersionAtCheck: null
	});
	writeUpdateStateMock.mockResolvedValue(undefined);
});

afterEach(() => {
	logSpy.mockRestore();
	stdoutSpy.mockRestore();
	exitSpy.mockRestore();
});

function logged(): string {
	return logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
}

describe('valora update command', () => {
	it('--check with update available prints update info and does NOT spawn', async () => {
		fetchLatestVersionMock.mockResolvedValue('99.0.0');

		const program = makeProgram();
		await program.parseAsync(['node', 'valora', 'update', '--check']);

		expect(spawnMock).not.toHaveBeenCalled();
		expect(logged()).toContain('Update available');
		expect(logged()).toContain('→ v99.0.0');
		expect(logged()).toContain('Run: valora update');
	});

	it('prints "already up to date" when on latest and no --force, with no spawn', async () => {
		// Use a version that is definitely not newer (0.0.1 is not newer than current)
		fetchLatestVersionMock.mockResolvedValue('0.0.1');

		const program = makeProgram();
		await program.parseAsync(['node', 'valora', 'update']);

		expect(spawnMock).not.toHaveBeenCalled();
		expect(logged()).toContain('already up to date');
	});

	it('--force causes install to run even when on latest version', async () => {
		// Same version as current (0.0.1), but --force should override the check
		fetchLatestVersionMock.mockResolvedValue('0.0.1');
		detectPackageManagerMock.mockReturnValue('npm');
		spawnMock.mockImplementation(() => makeChild(0));

		const program = makeProgram();
		await program.parseAsync(['node', 'valora', 'update', '--force']);

		expect(logged()).toContain('Updated to');
		expect(writeUpdateStateMock).toHaveBeenCalledWith(
			'/tmp/valora-test-state',
			expect.objectContaining({ latestVersion: '0.0.1', remindedForVersion: '0.0.1' })
		);
	});

	it('--check --force shows "already up to date" when no update exists', async () => {
		fetchLatestVersionMock.mockResolvedValue('0.0.1');

		const program = makeProgram();
		await program.parseAsync(['node', 'valora', 'update', '--check', '--force']);

		expect(spawnMock).not.toHaveBeenCalled();
		expect(logged()).toContain('already up to date');
	});

	it('prints "Unable to check" when the registry is unreachable, with no spawn', async () => {
		fetchLatestVersionMock.mockResolvedValue(null);

		const program = makeProgram();
		await program.parseAsync(['node', 'valora', 'update']);

		expect(spawnMock).not.toHaveBeenCalled();
		expect(logged()).toContain('Unable to check for updates');
	});

	it('spawns install with the correct argv and writes state on success', async () => {
		fetchLatestVersionMock.mockResolvedValue('99.0.0');
		detectPackageManagerMock.mockReturnValue('pnpm');
		spawnMock.mockImplementation(() => makeChild(0));

		const program = makeProgram();
		await program.parseAsync(['node', 'valora', 'update']);

		const [cmd, args, opts] = spawnMock.mock.calls[0]!;
		expect(cmd).toBe('pnpm');
		expect(args).toEqual(['add', '-g', '@windagency/valora@latest']);
		expect(opts).toEqual({ stdio: 'inherit' });

		const [stateDir, state] = writeUpdateStateMock.mock.calls[0]!;
		expect(stateDir).toBe('/tmp/valora-test-state');
		expect(state.latestVersion).toBe('99.0.0');
		expect(state.remindedForVersion).toBe('99.0.0');
		// lastSuccessAt is `new Date().toISOString()` (real clock, not mocked) — assert the ISO shape
		expect(state.lastSuccessAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
		// installedVersionAtCheck is the real installed package.json version — not controlled by
		// this test, so only presence (not an exact value) can be asserted without hardcoding a
		// brittle version string.
		expect(state.installedVersionAtCheck).toBeDefined();

		expect(logged()).toContain('Updated to v99.0.0');
	});

	it('calls process.exit with the child exit code on install failure', async () => {
		fetchLatestVersionMock.mockResolvedValue('99.0.0');
		detectPackageManagerMock.mockReturnValue('npm');
		spawnMock.mockImplementation(() => makeChild(17));

		const program = makeProgram();
		await program.parseAsync(['node', 'valora', 'update']);

		expect(writeUpdateStateMock).not.toHaveBeenCalled();
		expect(exitSpy).toHaveBeenCalledWith(17);
		expect(logged()).toContain('Update failed. Retry manually:');
		expect(logged()).toContain('npm install -g @windagency/valora@latest');
	});

	it('prints all four install commands when the package manager is ambiguous', async () => {
		fetchLatestVersionMock.mockResolvedValue('99.0.0');
		detectPackageManagerMock.mockReturnValue(null);

		const program = makeProgram();
		await program.parseAsync(['node', 'valora', 'update']);

		expect(spawnMock).not.toHaveBeenCalled();
		const out = logged();
		expect(out).toContain('Could not detect package manager');
		expect(out).toContain('npm install -g @windagency/valora@latest');
		expect(out).toContain('pnpm add -g @windagency/valora@latest');
		expect(out).toContain('yarn global add @windagency/valora@latest');
		expect(out).toContain('bun install -g @windagency/valora@latest');
	});
});
