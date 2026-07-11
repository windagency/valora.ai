import { Command, Option } from 'commander';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('utils/usage-analytics', () => ({
	getUsageAnalytics: () => ({
		generateJsonReport: () => JSON.stringify({ report: 'ok' })
	})
}));

vi.mock('output/color-adapter.interface', () => ({
	getColorAdapter: () => ({
		bold: (s: string) => s,
		cyan: (s: string) => s,
		dim: (s: string) => s,
		gray: (s: string) => s,
		green: (s: string) => s,
		red: (s: string) => s,
		yellow: (s: string) => s
	})
}));

import { configureUsageSubcommand } from './usage';

function makeProgram(): Command {
	const program = new Command();
	program.exitOverride();
	// Reproduces the real conflict: a GLOBAL `--output <format>` option (with
	// choices) registered on the root program — the subcommand's own
	// `--output <path>` was always shadowed by this, live-verified via
	// `valora monitoring usage --output <path>` erroring "Allowed choices are
	// markdown, json, yaml" before the action handler ever ran.
	program.addOption(new Option('--output <format>', 'Output format').choices(['markdown', 'json', 'yaml']));
	const monitoringCmd = program.command('monitoring');
	configureUsageSubcommand(monitoringCmd as never);
	return program;
}

async function runCommand(program: Command, args: string[]): Promise<void> {
	await program.parseAsync(['node', 'valora', ...args]);
}

describe('usage --export', () => {
	let tmpDir: string;
	let originalCwd: string;

	beforeEach(async () => {
		originalCwd = process.cwd();
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'valora-usage-cmd-'));
		process.chdir(tmpDir);
	});

	afterEach(async () => {
		process.chdir(originalCwd);
		await fs.rm(tmpDir, { force: true, recursive: true });
	});

	it('does not collide with the global --output <format> flag', async () => {
		const target = path.join(tmpDir, 'report.json');

		await runCommand(makeProgram(), ['monitoring', 'usage', '--format', 'json', '--export', target]);

		const written = await fs.readFile(target, 'utf-8');
		expect(JSON.parse(written)).toEqual({ report: 'ok' });
	});

	it('blocks --export pointing outside the working directory', async () => {
		const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'valora-usage-outside-'));
		const outsideTarget = path.join(outsideDir, 'report.json');
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

		await runCommand(makeProgram(), ['monitoring', 'usage', '--format', 'json', '--export', outsideTarget]);

		expect(exitSpy).toHaveBeenCalledWith(1);
		await expect(fs.access(outsideTarget)).rejects.toThrow();

		errorSpy.mockRestore();
		exitSpy.mockRestore();
		await fs.rm(outsideDir, { force: true, recursive: true });
	});
});
