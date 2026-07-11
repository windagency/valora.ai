import { Command } from 'commander';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('output/color-adapter.interface', () => ({
	getColorAdapter: vi.fn(() => ({
		blue: (s: string) => s,
		gray: (s: string) => s,
		green: (s: string) => s,
		red: (s: string) => s
	}))
}));

import { configureMonitoringCommand } from './monitoring';

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
	configureMonitoringCommand(program as never);
	return program;
}

async function runCommand(program: Command, args: string[]): Promise<void> {
	await program.parseAsync(['node', 'valora', ...args]);
}

describe.skipIf(!chdirSupported)('monitoring heap-dump', () => {
	let tmpDir: string;
	let originalCwd: string;

	beforeEach(async () => {
		vi.clearAllMocks();
		originalCwd = process.cwd();
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'valora-monitoring-cmd-'));
		process.chdir(tmpDir);
	});

	afterEach(async () => {
		process.chdir(originalCwd);
		await fs.rm(tmpDir, { force: true, recursive: true });
	});

	it('blocks --out pointing outside the working directory', async () => {
		// A V8 heap snapshot routinely captures in-memory secrets/API keys —
		// --out previously wrote it to any path with zero validation.
		const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'valora-monitoring-cmd-outside-'));
		const outsideTarget = path.join(outsideDir, 'leaked-heap');
		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

		await runCommand(makeProgram(), ['monitoring', 'heap-dump', '--out', outsideTarget]);

		expect(exitSpy).toHaveBeenCalledWith(1);
		await expect(fs.access(outsideTarget)).rejects.toThrow();

		consoleErrorSpy.mockRestore();
		exitSpy.mockRestore();
		await fs.rm(outsideDir, { force: true, recursive: true });
	});

	it('blocks --out pointing at a protected security-infrastructure basename even when it sits inside the working directory', async () => {
		const target = path.join(tmpDir, '.valora', 'security-audit.jsonl');
		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

		await runCommand(makeProgram(), ['monitoring', 'heap-dump', '--out', target]);

		expect(exitSpy).toHaveBeenCalledWith(1);
		await expect(fs.access(target)).rejects.toThrow();

		consoleErrorSpy.mockRestore();
		exitSpy.mockRestore();
	});

	it('still allows --out pointing inside the working directory', async () => {
		const target = path.join(tmpDir, 'heap-dumps');

		await runCommand(makeProgram(), ['monitoring', 'heap-dump', '--out', target, '--prefix', 'test-dump']);

		const files = await fs.readdir(target);
		expect(files.some((f) => f.startsWith('test-dump'))).toBe(true);
	});
});
