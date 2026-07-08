import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MemoryProvider, MemoryProviderInfo, MemoryVerifyReport } from 'types/memory.types';

const fakeProviderInfo: MemoryProviderInfo = {
	capabilities: ['embeddings', 'graph-edges'],
	counts: { decisions: 2, episodic: 5, semantic: 3 },
	edgeCount: 5,
	embeddingCoverage: 0.75,
	label: 'Valora Vault',
	name: 'vault',
	schemaVersion: 1
};

const fakeVerifyReport: MemoryVerifyReport = {
	counts: { decisions: 2, episodic: 5, semantic: 3 },
	issues: [],
	ok: true
};

const fakeProvider: MemoryProvider = {
	create: vi.fn(),
	delete: vi.fn(),
	findByPaths: vi.fn(),
	flush: vi.fn(),
	get: vi.fn(),
	info: vi.fn().mockResolvedValue(fakeProviderInfo),
	invalidateByPaths: vi.fn(),
	markStaleByPaths: vi.fn(),
	prune: vi.fn(),
	purge: vi.fn(),
	query: vi.fn().mockResolvedValue([]),
	update: vi.fn(),
	verify: vi.fn().mockResolvedValue(fakeVerifyReport)
};

vi.mock('memory/registry', () => ({
	getMemoryRegistry: vi.fn(() => ({
		getActive: vi.fn(() => fakeProvider),
		hasActive: vi.fn(() => true)
	})),
	MemoryProviderConflictError: class MemoryProviderConflictError extends Error {
		constructor(
			public providerKey: string,
			public existingOwner: string,
			public incomingOwner: string
		) {
			super(`stub conflict: ${providerKey}`);
		}
	},
	MemoryProviderRegistry: class MemoryProviderRegistry {},
	resetMemoryRegistry: vi.fn()
}));

vi.mock('@windagency/valora-plugin-memory-vault', async () => {
	const actual = await vi.importActual<typeof import('@windagency/valora-plugin-memory-vault')>(
		'@windagency/valora-plugin-memory-vault'
	);
	return {
		...actual,
		migrateJsonToVault: vi.fn().mockReturnValue({ migrated: 3, skipped: 0 })
	};
});

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

import { migrateJsonToVault } from '@windagency/valora-plugin-memory-vault';
import { configureMemoryCommand } from './memory.command';

describe('configureMemoryCommand', () => {
	let program: Command;
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-mem-cmd-'));
		program = new Command();
		program.exitOverride();
		configureMemoryCommand(program, { jsonDir: path.join(tmpDir, 'json'), vaultDir: path.join(tmpDir, 'vault') });
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { force: true, recursive: true });
		vi.clearAllMocks();
		// Restore default resolved values after clearAllMocks wipes them.
		vi.mocked(fakeProvider.info).mockResolvedValue(fakeProviderInfo);
		vi.mocked(fakeProvider.verify).mockResolvedValue(fakeVerifyReport);
		vi.mocked(fakeProvider.query).mockResolvedValue([]);
	});

	it('registers a memory subcommand on the program', () => {
		const memCmd = program.commands.find((c) => c.name() === 'memory');
		expect(memCmd).toBeDefined();
	});

	it('registers info, migrate, and verify subcommands', () => {
		const memCmd = program.commands.find((c) => c.name() === 'memory')!;
		const names = memCmd.commands.map((c) => c.name());
		expect(names).toContain('info');
		expect(names).toContain('migrate');
		expect(names).toContain('verify');
	});

	describe('bootstrap', () => {
		it('calls the injected bootstrap function before running a memory subcommand', async () => {
			const bootstrap = vi.fn().mockResolvedValue(undefined);
			const bootstrapProgram = new Command();
			bootstrapProgram.exitOverride();
			configureMemoryCommand(bootstrapProgram, {
				bootstrap,
				jsonDir: path.join(tmpDir, 'json'),
				vaultDir: path.join(tmpDir, 'vault')
			});
			await bootstrapProgram.parseAsync(['node', 'valora', 'memory', 'info']);
			expect(bootstrap).toHaveBeenCalledOnce();
		});
	});

	describe('memory info', () => {
		it('outputs vault entry total (sum of all category counts)', async () => {
			const output: string[] = [];
			const originalLog = console.log;
			console.log = (...args: unknown[]) => output.push(args.join(' '));

			await program.parseAsync(['node', 'valora', 'memory', 'info']);

			console.log = originalLog;
			// 5 episodic + 3 semantic + 2 decisions = 10
			expect(output.some((line) => line.includes('10'))).toBe(true);
		});

		it('outputs embedding coverage as a percentage', async () => {
			const output: string[] = [];
			const originalLog = console.log;
			console.log = (...args: unknown[]) => output.push(args.join(' '));

			await program.parseAsync(['node', 'valora', 'memory', 'info']);

			console.log = originalLog;
			expect(output.some((line) => line.includes('75'))).toBe(true);
		});

		it('outputs edge count', async () => {
			const output: string[] = [];
			const originalLog = console.log;
			console.log = (...args: unknown[]) => output.push(args.join(' '));

			await program.parseAsync(['node', 'valora', 'memory', 'info']);

			console.log = originalLog;
			expect(output.some((line) => line.includes('5'))).toBe(true);
		});
	});

	describe('memory migrate', () => {
		it('calls migrateJsonToVault with correct directories', async () => {
			await program.parseAsync(['node', 'valora', 'memory', 'migrate']);
			expect(migrateJsonToVault).toHaveBeenCalledOnce();
		});

		it('reports migration counts after running', async () => {
			const output: string[] = [];
			const originalLog = console.log;
			console.log = (...args: unknown[]) => output.push(args.join(' '));

			await program.parseAsync(['node', 'valora', 'memory', 'migrate']);

			console.log = originalLog;
			expect(output.some((line) => line.includes('3'))).toBe(true);
		});
	});

	describe('memory verify', () => {
		it('calls the active provider verify()', async () => {
			await program.parseAsync(['node', 'valora', 'memory', 'verify']);
			expect(fakeProvider.verify).toHaveBeenCalled();
		});

		it('outputs a summary line after verifying', async () => {
			const output: string[] = [];
			const originalLog = console.log;
			console.log = (...args: unknown[]) => output.push(args.join(' '));

			await program.parseAsync(['node', 'valora', 'memory', 'verify']);

			console.log = originalLog;
			expect(output.length).toBeGreaterThan(0);
		});
	});
});
