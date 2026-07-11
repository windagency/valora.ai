import { Command, Option } from 'commander';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('utils/confidence-calibration-analytics', () => ({
	getConfidenceCalibrationAnalytics: () => ({
		analyze: () => ({ byConfidenceBucket: [], byTriggeredCriterion: [], period: {}, totalEscalations: 0 }),
		generateJsonReport: () => JSON.stringify({ report: 'ok' })
	})
}));

vi.mock('output/color-adapter.interface', () => ({
	getColorAdapter: () => ({
		bold: (s: string) => s,
		dim: (s: string) => s,
		green: (s: string) => s,
		magenta: (s: string) => s,
		red: (s: string) => s
	})
}));

import { configureConfidenceReportSubcommand } from './confidence-report';

function makeProgram(): Command {
	const program = new Command();
	program.exitOverride();
	// Reproduces the real conflict: a GLOBAL `--output <format>` option (with
	// choices) registered on the root program, exactly like
	// `cli/flags.ts`'s `globalFlags.output` in the real CLI — the subcommand's
	// own `--output <path>` was always shadowed by this, live-verified via
	// `valora monitoring confidence-report --output <path>` erroring "Allowed
	// choices are markdown, json, yaml" before the action handler ever ran.
	program.addOption(new Option('--output <format>', 'Output format').choices(['markdown', 'json', 'yaml']));
	const monitoringCmd = program.command('monitoring');
	configureConfidenceReportSubcommand(monitoringCmd as never);
	return program;
}

async function runCommand(program: Command, args: string[]): Promise<void> {
	await program.parseAsync(['node', 'valora', ...args]);
}

describe('confidence-report --export', () => {
	let tmpDir: string;
	let originalCwd: string;

	beforeEach(async () => {
		originalCwd = process.cwd();
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'valora-confidence-report-cmd-'));
		process.chdir(tmpDir);
	});

	afterEach(async () => {
		process.chdir(originalCwd);
		await fs.rm(tmpDir, { force: true, recursive: true });
	});

	it('does not collide with the global --output <format> flag', async () => {
		const target = path.join(tmpDir, 'report.json');

		await runCommand(makeProgram(), ['monitoring', 'confidence-report', '--format', 'json', '--export', target]);

		const written = await fs.readFile(target, 'utf-8');
		expect(JSON.parse(written)).toEqual({ report: 'ok' });
	});

	it('blocks --export pointing outside the working directory', async () => {
		const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'valora-confidence-report-outside-'));
		const outsideTarget = path.join(outsideDir, 'report.json');
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

		await runCommand(makeProgram(), ['monitoring', 'confidence-report', '--format', 'json', '--export', outsideTarget]);

		expect(exitSpy).toHaveBeenCalledWith(1);
		await expect(fs.access(outsideTarget)).rejects.toThrow();

		errorSpy.mockRestore();
		exitSpy.mockRestore();
		await fs.rm(outsideDir, { force: true, recursive: true });
	});

	it('blocks --export pointing at a protected security-infrastructure basename even when it sits inside the working directory', async () => {
		// Pre-create .valora/ so a failure can only come from the
		// protected-basename check, not an unrelated ENOENT from
		// writeFileSync having no parent directory to write into.
		await fs.mkdir(path.join(tmpDir, '.valora'), { recursive: true });
		const target = path.join(tmpDir, '.valora', 'security-audit.jsonl');
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

		await runCommand(makeProgram(), ['monitoring', 'confidence-report', '--format', 'json', '--export', target]);

		expect(exitSpy).toHaveBeenCalledWith(1);
		await expect(fs.access(target)).rejects.toThrow();

		errorSpy.mockRestore();
		exitSpy.mockRestore();
	});
});
