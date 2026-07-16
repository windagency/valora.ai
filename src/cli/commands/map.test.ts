import { Command, Option } from 'commander';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGenerate = vi.fn(async () => undefined);

vi.mock('lsp/lsp-tools.service', () => ({
	getLSPToolsService: () => ({})
}));
vi.mock('ast/ast-index.service', () => ({
	getASTIndexService: () => ({})
}));
vi.mock('analysis/symbol-reference.analyser', () => ({
	SymbolReferenceAnalyzer: class {}
}));
vi.mock('analysis/codebase-graph.builder', () => ({
	CodebaseGraphBuilder: class {}
}));
vi.mock('analysis/documentation.renderer', () => ({
	DocumentationRenderer: class {}
}));
vi.mock('analysis/documentation.service', () => ({
	DocumentationService: class {
		generate(...args: unknown[]) {
			return mockGenerate(...args);
		}
	}
}));

import { configureMapCommand } from './map';

// `process.chdir()` is unsupported in Node worker threads (e.g. Stryker's dry-run test
// execution) — probe once at module load so this chdir-dependent describe block skips
// gracefully in that environment instead of crashing the whole run, while still executing
// normally under regular Vitest/CI (which uses forks, not worker threads).
let chdirSupported = true;
try {
	const cwd = process.cwd();
	process.chdir(cwd);
} catch {
	chdirSupported = false;
}

function makeProgram(): Command {
	const program = new Command();
	program.exitOverride();
	// Reproduces the real conflict: a GLOBAL `--output <format>` option (with
	// choices) registered on the root program — `map`'s own `--output <path>`
	// was always shadowed by this, live-verified via `valora map --output
	// <path>` erroring "Allowed choices are markdown, json, yaml" before the
	// action handler ever ran.
	program.addOption(new Option('--output <format>', 'Output format').choices(['markdown', 'json', 'yaml']));
	configureMapCommand(program as never);
	return program;
}

async function runCommand(program: Command, args: string[]): Promise<void> {
	await program.parseAsync(['node', 'valora', ...args]);
}

describe.skipIf(!chdirSupported)('map --output-dir', () => {
	let tmpDir: string;
	let originalCwd: string;
	let exitSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(async () => {
		vi.clearAllMocks();
		originalCwd = process.cwd();
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'valora-map-cmd-'));
		process.chdir(tmpDir);
		exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
	});

	afterEach(async () => {
		process.chdir(originalCwd);
		await fs.rm(tmpDir, { force: true, recursive: true });
		exitSpy.mockRestore();
	});

	it('does not collide with the global --output <format> flag', async () => {
		const target = path.join(tmpDir, 'docs-out');

		await runCommand(makeProgram(), ['map', '--output-dir', target]);

		expect(mockGenerate).toHaveBeenCalled();
	});

	it('blocks --output-dir pointing outside the working directory', async () => {
		const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'valora-map-outside-'));
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		await runCommand(makeProgram(), ['map', '--output-dir', outsideDir]);

		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(mockGenerate).not.toHaveBeenCalled();

		errorSpy.mockRestore();
		await fs.rm(outsideDir, { force: true, recursive: true });
	});

	it('blocks --output-dir pointing at a protected security-infrastructure basename even when it sits inside the working directory', async () => {
		const target = path.join(tmpDir, '.valora', 'security-audit.jsonl');
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		await runCommand(makeProgram(), ['map', '--output-dir', target]);

		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(mockGenerate).not.toHaveBeenCalled();

		errorSpy.mockRestore();
	});
});
