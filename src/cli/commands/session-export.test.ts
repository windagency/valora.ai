import { Command } from 'commander';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockExportSession = vi.fn(async () => '/should-not-be-reached.zip');
const mockGetExportStats = vi.fn(async () => ({
	artifactCount: 0,
	commandCount: 0,
	exportedAt: Date.now(),
	sessionId: 'sess-1',
	size: 0
}));

vi.mock('session/store', () => ({
	SessionStore: class {}
}));

vi.mock('session/archive-adapter', () => ({
	createArchiveAdapter: () => ({})
}));

vi.mock('session/session-exporter', () => ({
	SessionExporter: class {
		exportSession(...args: unknown[]) {
			return mockExportSession(...args);
		}
		getExportStats(...args: unknown[]) {
			return mockGetExportStats(...args);
		}
	}
}));

vi.mock('output/color-adapter.interface', () => ({
	getColorAdapter: () => ({
		bold: (s: string) => s,
		cyan: (s: string) => s,
		gray: (s: string) => s,
		green: (s: string) => s,
		red: (s: string) => s
	})
}));

const noopSpinner = {
	fail: () => noopSpinner,
	start: () => noopSpinner,
	succeed: () => noopSpinner
};
vi.mock('ui/spinner-adapter.interface', () => ({
	getSpinnerAdapter: () => ({ create: () => noopSpinner })
}));
vi.mock('ui/prompt-adapter.interface', () => ({
	getPromptAdapter: () => ({})
}));

import { configureSessionCommand } from './session';

function makeProgram(): Command {
	const program = new Command();
	program.exitOverride();
	configureSessionCommand(program as never);
	return program;
}

async function runCommand(program: Command, args: string[]): Promise<void> {
	await program.parseAsync(['node', 'valora', ...args]);
}

describe('session export outputPath', () => {
	let tmpDir: string;
	let originalCwd: string;
	let exitSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(async () => {
		vi.clearAllMocks();
		originalCwd = process.cwd();
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'valora-session-export-cmd-'));
		process.chdir(tmpDir);
		exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
	});

	afterEach(async () => {
		process.chdir(originalCwd);
		await fs.rm(tmpDir, { force: true, recursive: true });
		exitSpy.mockRestore();
	});

	it('blocks an outputPath pointing outside the working directory before ever calling exportSession', async () => {
		const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'valora-session-export-outside-'));
		const outsideTarget = path.join(outsideDir, 'leaked.zip');
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		await runCommand(makeProgram(), ['session', 'export', 'sess-1', outsideTarget]);

		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(mockExportSession).not.toHaveBeenCalled();

		errorSpy.mockRestore();
		await fs.rm(outsideDir, { force: true, recursive: true });
	});

	it('blocks an outputPath pointing at a protected security-infrastructure basename even when it sits inside the working directory', async () => {
		const target = path.join(tmpDir, '.valora', 'security-audit.jsonl');
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		await runCommand(makeProgram(), ['session', 'export', 'sess-1', target]);

		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(mockExportSession).not.toHaveBeenCalled();

		errorSpy.mockRestore();
	});

	it('still allows an outputPath inside the working directory', async () => {
		const target = path.join(tmpDir, 'export.zip');
		mockExportSession.mockResolvedValueOnce(target);

		await runCommand(makeProgram(), ['session', 'export', 'sess-1', target]);

		expect(mockExportSession).toHaveBeenCalledWith('sess-1', expect.objectContaining({ outputPath: target }));
		expect(exitSpy).not.toHaveBeenCalled();
	});

	it('still allows exporting with no outputPath at all (defaults inside cwd)', async () => {
		await runCommand(makeProgram(), ['session', 'export', 'sess-1']);

		expect(mockExportSession).toHaveBeenCalledWith('sess-1', expect.objectContaining({ outputPath: undefined }));
		expect(exitSpy).not.toHaveBeenCalled();
	});
});
