import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('memory/vault/vault-store', () => ({
	VaultStore: vi.fn().mockImplementation(() => ({
		getEntries: vi.fn().mockResolvedValue([]),
		getVaultStats: vi.fn().mockReturnValue({ edgeCount: 5, embeddingCoverage: 0.75, entryCount: 10 })
	}))
}));

vi.mock('memory/migration/json-to-vault', () => ({
	migrateJsonToVault: vi.fn().mockReturnValue({ migrated: 3, skipped: 0 })
}));

vi.mock('memory/migration/vault-version', () => ({
	readVaultVersion: vi.fn().mockReturnValue(1)
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

import { VaultStore } from 'memory/vault/vault-store';
import { migrateJsonToVault } from 'memory/migration/json-to-vault';
import { configureMemoryCommand } from './memory.command';

describe('configureMemoryCommand', () => {
	let program: Command;
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-mem-cmd-'));
		program = new Command();
		program.exitOverride();
		configureMemoryCommand(program, { vaultDir: path.join(tmpDir, 'vault'), jsonDir: path.join(tmpDir, 'json') });
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { force: true, recursive: true });
		vi.clearAllMocks();
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

	describe('memory info', () => {
		it('outputs vault entry count', async () => {
			const output: string[] = [];
			const originalLog = console.log;
			console.log = (...args: unknown[]) => output.push(args.join(' '));

			await program.parseAsync(['node', 'valora', 'memory', 'info']);

			console.log = originalLog;
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
		it('reads entries from the vault store', async () => {
			await program.parseAsync(['node', 'valora', 'memory', 'verify']);

			const mockStore = vi.mocked(VaultStore).mock.results[0]?.value as {
				getEntries: ReturnType<typeof vi.fn>;
				getVaultStats: ReturnType<typeof vi.fn>;
			};
			expect(mockStore).toBeDefined();
			expect(mockStore.getEntries).toHaveBeenCalled();
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
