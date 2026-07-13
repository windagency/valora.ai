import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { VaultMemoryProvider } from '@windagency/valora-plugin-memory-vault';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LLMProvider } from 'types/llm.types';
import type { MemoryCategory, MemoryProvider, MemoryProviderInfo, MemoryVerifyReport } from 'types/memory.types';

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
	purge: vi.fn().mockResolvedValue({ dryRun: false, totalDeleted: 0, totalWouldDelete: 0 }),
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

// Real plugin discovery/loading is filesystem I/O unrelated to what these tests exercise
// (reembed's own provider-lookup wiring) — no-op it, matching the convention already used
// in dynamic.test.ts/config.command.test.ts, and register fake providers directly into the
// real (unmocked) llm/registry singleton instead.
vi.mock('di/container', () => ({
	createContainer: vi.fn(() => ({})),
	initializePlugins: vi.fn(async () => undefined)
}));

import { migrateJsonToVault } from '@windagency/valora-plugin-memory-vault';
import { getProviderRegistry, resetProviderRegistry } from 'llm/registry';
import { getMemoryRegistry } from 'memory/registry';
import { configureMemoryCommand } from './memory.command';

function captureConsole(method: 'error' | 'log'): { lines: string[]; restore: () => void } {
	const lines: string[] = [];
	const original = console[method];
	console[method] = (...args: unknown[]) => lines.push(args.join(' '));
	return { lines, restore: () => (console[method] = original) };
}

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
		vi.mocked(fakeProvider.purge).mockResolvedValue({ dryRun: false, totalDeleted: 0, totalWouldDelete: 0 });
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
			// Precise match on the labelled line — a bare `includes('5')` would
			// coincidentally pass on the schema-version or entry-count lines too.
			expect(output.some((line) => /Edges:\s+5\b/.test(line))).toBe(true);
		});
	});

	describe('memory migrate', () => {
		it('calls migrateJsonToVault with the configured json and vault directories', async () => {
			await program.parseAsync(['node', 'valora', 'memory', 'migrate']);
			expect(migrateJsonToVault).toHaveBeenCalledWith({
				jsonDir: path.join(tmpDir, 'json'),
				vaultDir: path.join(tmpDir, 'vault')
			});
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

	describe('memory list / purge (real vault)', () => {
		let realProvider: VaultMemoryProvider;

		beforeEach(() => {
			realProvider = new VaultMemoryProvider({ vaultDir: path.join(tmpDir, 'real-vault') });
		});

		/** Queue the active provider for exactly the next getMemoryRegistry() call. */
		function useRealProviderOnce(): void {
			vi.mocked(getMemoryRegistry).mockReturnValueOnce({
				getActive: () => realProvider,
				hasActive: () => true
			} as unknown as ReturnType<typeof getMemoryRegistry>);
		}

		async function seed(category: MemoryCategory, content: string, tags: string[] = []): Promise<void> {
			await realProvider.create(category, {
				agentRole: 'tech-lead',
				confidence: 'observed',
				content,
				sessionId: 'session-1',
				source: { command: 'test' },
				tags
			});
		}

		describe('list', () => {
			it('reports no matches against an empty vault', async () => {
				useRealProviderOnce();
				const { lines, restore } = captureConsole('log');

				await program.parseAsync(['node', 'valora', 'memory', 'list']);

				restore();
				expect(lines.some((l) => l.includes('No entries match the filter.'))).toBe(true);
			});

			it('filters listed entries by category', async () => {
				await seed('episodic', 'An episodic memory');
				await seed('semantic', 'A semantic memory');
				useRealProviderOnce();
				const { lines, restore } = captureConsole('log');

				await program.parseAsync(['node', 'valora', 'memory', 'list', '--category', 'episodic']);

				restore();
				expect(lines.some((l) => l.includes('An episodic memory'))).toBe(true);
				expect(lines.some((l) => l.includes('A semantic memory'))).toBe(false);
			});

			it('filters listed entries by tag', async () => {
				await seed('episodic', 'Tagged memory', ['important']);
				await seed('episodic', 'Untagged memory');
				useRealProviderOnce();
				const { lines, restore } = captureConsole('log');

				await program.parseAsync(['node', 'valora', 'memory', 'list', '--tag', 'important']);

				restore();
				expect(lines.some((l) => l.includes('Tagged memory'))).toBe(true);
				expect(lines.some((l) => l.includes('Untagged memory'))).toBe(false);
			});
		});

		describe('purge', () => {
			// These two validation checks are followed by an interactive stdin
			// confirmation prompt (see confirmPurge()/readConfirmation()) if
			// process.exit() is allowed to no-op and fall through — matching this
			// file's usual "no-op the exit" convention would hang waiting on stdin
			// that never arrives. Make the mock actually throw, like the real
			// (never-returning) process.exit, so execution stops at the check.
			function mockExitThrows(): ReturnType<typeof vi.spyOn> {
				return vi.spyOn(process, 'exit').mockImplementation(() => {
					throw new Error('process.exit called');
				});
			}

			it('exits with an error when no target (--all, --store, or --older-than) is specified', async () => {
				const exitSpy = mockExitThrows();
				const { lines, restore } = captureConsole('error');

				await expect(program.parseAsync(['node', 'valora', 'memory', 'purge'])).rejects.toThrow('process.exit called');

				restore();
				expect(exitSpy).toHaveBeenCalledWith(1);
				expect(lines.some((l) => l.includes('at least one of --all, --store, or --older-than is required'))).toBe(true);
			});

			it('exits with an error for an unparsable --older-than duration', async () => {
				const exitSpy = mockExitThrows();
				const { lines, restore } = captureConsole('error');

				await expect(
					program.parseAsync(['node', 'valora', 'memory', 'purge', '--older-than', 'not-a-duration'])
				).rejects.toThrow('process.exit called');

				restore();
				expect(exitSpy).toHaveBeenCalledWith(1);
				expect(lines.some((l) => l.includes("cannot parse duration 'not-a-duration'"))).toBe(true);
			});

			it('reports what would be deleted without deleting anything on --dry-run', async () => {
				await seed('episodic', 'Entry A');
				await seed('semantic', 'Entry B');
				useRealProviderOnce();
				const { lines, restore } = captureConsole('log');

				await program.parseAsync(['node', 'valora', 'memory', 'purge', '--all', '--dry-run']);

				restore();
				expect(lines.some((l) => l.includes('would delete 2 entries'))).toBe(true);

				const remaining = await realProvider.query({ limit: 100, strengthen: false });
				expect(remaining).toHaveLength(2);
			});

			it('deletes only entries in the specified store, leaving other categories untouched', async () => {
				await seed('episodic', 'Episodic entry');
				await seed('semantic', 'Semantic entry');
				useRealProviderOnce();
				const { restore } = captureConsole('log');

				await program.parseAsync(['node', 'valora', 'memory', 'purge', '--store', 'episodic', '--yes']);

				restore();
				const episodicRemaining = await realProvider.query({ category: 'episodic', strengthen: false });
				const semanticRemaining = await realProvider.query({ category: 'semantic', strengthen: false });
				expect(episodicRemaining).toHaveLength(0);
				expect(semanticRemaining).toHaveLength(1);
			});

			it('deletes every entry across all stores with --all --yes and reports the count', async () => {
				await seed('episodic', 'Entry A');
				await seed('semantic', 'Entry B');
				useRealProviderOnce();
				const { lines, restore } = captureConsole('log');

				await program.parseAsync(['node', 'valora', 'memory', 'purge', '--all', '--yes']);

				restore();
				expect(lines.some((l) => l.includes('Purged 2 entries'))).toBe(true);
				const remaining = await realProvider.query({ limit: 100, strengthen: false });
				expect(remaining).toHaveLength(0);
			});
		});
	});

	describe('memory reembed', () => {
		afterEach(() => {
			resetProviderRegistry();
		});

		it('does nothing destructive and prompts for --confirm when it is not passed', async () => {
			const { lines, restore } = captureConsole('log');

			await program.parseAsync(['node', 'valora', 'memory', 'reembed']);

			restore();
			expect(lines.some((l) => l.includes('Pass --confirm to proceed'))).toBe(true);
		});

		it('exits with an error when no embed-capable provider is available', async () => {
			// Genuine (non-bug) case: no provider is registered at all, so
			// resolveEmbedder() correctly has nothing to select from.
			const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
			const { lines, restore } = captureConsole('error');

			await program.parseAsync(['node', 'valora', 'memory', 'reembed', '--confirm']);

			restore();
			expect(exitSpy).toHaveBeenCalledWith(1);
			expect(lines.some((l) => l.includes('No embed-capable provider available'))).toBe(true);
		});

		it('re-embeds every vault entry using a real embed-capable provider from the registry', async () => {
			class FakeEmbedProvider implements Pick<LLMProvider, 'complete' | 'isConfigured' | 'streamComplete'> {
				constructor(_config: Record<string, unknown>) {}
				async complete(): Promise<never> {
					throw new Error('not used by reembed');
				}
				async embed(req: { input: string[]; model: string }): Promise<{
					dim: number;
					model: string;
					vectors: number[][];
				}> {
					return { dim: 4, model: req.model, vectors: req.input.map(() => [0.1, 0.2, 0.3, 0.4]) };
				}
				isConfigured(): boolean {
					return true;
				}
				async streamComplete(): Promise<never> {
					throw new Error('not used by reembed');
				}
			}
			getProviderRegistry().registerProvider('ollama', FakeEmbedProvider as never, { owner: 'core' });
			const seedProvider = new VaultMemoryProvider({ vaultDir: path.join(tmpDir, 'vault') });
			await seedProvider.create('episodic', {
				agentRole: 'tech-lead',
				confidence: 'observed',
				content: 'Entry to re-embed',
				sessionId: 'session-1',
				source: { command: 'test' },
				tags: []
			});
			const { lines, restore } = captureConsole('log');

			await program.parseAsync(['node', 'valora', 'memory', 'reembed', '--confirm', '--dim', '4']);

			restore();
			expect(lines.some((l) => l.includes('Reembedded 1/1 entries'))).toBe(true);
		});
	});
});
