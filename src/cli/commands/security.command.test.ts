import { Command } from 'commander';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockExporter = vi.fn(() => ({
	chainVerified: true,
	events: [],
	exportedAt: '2026-01-01T00:00:00.000Z',
	totalEvents: 0
}));
vi.mock('security/audit-exporter', () => ({
	getSecurityAuditExporter: () => mockExporter
}));

vi.mock('output/color-adapter.interface', () => ({
	getColorAdapter: vi.fn(() => ({
		green: (s: string) => s,
		red: (s: string) => s
	}))
}));

import { configureSecurityCommand } from './security.command';

function makeProgram(): Command {
	const program = new Command();
	program.exitOverride();
	configureSecurityCommand(program as never);
	return program;
}

async function runCommand(program: Command, args: string[]): Promise<void> {
	await program.parseAsync(['node', 'valora', ...args]);
}

describe('security audit-export', () => {
	let tmpDir: string;
	let originalCwd: string;

	beforeEach(async () => {
		vi.clearAllMocks();
		originalCwd = process.cwd();
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'valora-security-cmd-'));
		process.chdir(tmpDir);
	});

	afterEach(async () => {
		process.chdir(originalCwd);
		await fs.rm(tmpDir, { force: true, recursive: true });
	});

	it('blocks --out pointing outside the working directory', async () => {
		// `--out` wrote straight to fs.writeFile with zero path validation — an
		// agent that can run `valora security audit-export --out <path>` could
		// clobber vault-signing.key/trusted-workspaces.json/mcp-baselines.json/
		// security-audit.jsonl themselves, the exact files this security
		// infrastructure is meant to protect from tampering.
		const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'valora-security-cmd-outside-'));
		const outsideTarget = path.join(outsideDir, 'target.json');
		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

		await runCommand(makeProgram(), ['security', 'audit-export', '--out', outsideTarget]);

		expect(exitSpy).toHaveBeenCalledWith(1);
		await expect(fs.access(outsideTarget)).rejects.toThrow();

		consoleErrorSpy.mockRestore();
		exitSpy.mockRestore();
		await fs.rm(outsideDir, { force: true, recursive: true });
	});

	it('still allows --out pointing inside the working directory', async () => {
		const target = path.join(tmpDir, 'export.json');

		await runCommand(makeProgram(), ['security', 'audit-export', '--out', target]);

		const written = await fs.readFile(target, 'utf-8');
		expect(JSON.parse(written)).toMatchObject({ totalEvents: 0 });
	});

	it('still allows exporting to stdout with no --out flag', async () => {
		const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

		await runCommand(makeProgram(), ['security', 'audit-export']);

		expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('"totalEvents": 0'));

		consoleLogSpy.mockRestore();
	});
});
