import * as fs from 'node:fs';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { register } from './index.js';

const FIXTURES = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../__tests__/fixtures');

class ExitSignal extends Error {
	constructor(readonly code: number) {
		super(`exit:${String(code)}`);
	}
}

type Handler = () => Promise<void> | void;

interface RunResult {
	exitCode: number | undefined;
	logger: { error: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn> };
	stdout: string;
}

/**
 * Drive the `audit scan` subcommand the way the host CLI would: register the
 * plugin against a mock API, capture the handler, set argv, and observe the
 * caller-visible outcomes (exit code, stdout, logger calls). `process.exit` is
 * stubbed to throw so the async handler unwinds at its single exit point.
 */
async function runScan(args: string[]): Promise<RunResult> {
	let handler: Handler | undefined;
	const logger = { error: vi.fn(), info: vi.fn() };
	const api = {
		cli: { addSubcommand: (_name: string, _desc: string, fn: Handler) => void (handler = fn) },
		config: { extend: () => () => ({}) },
		logger
	};
	register(api as unknown as Parameters<typeof register>[0]);

	const original = { argv: process.argv, exit: process.exit, write: process.stdout.write };
	let exitCode: number | undefined;
	let stdout = '';

	process.argv = ['node', 'valora', 'audit', 'scan', ...args];
	process.exit = ((code?: number): never => {
		exitCode = code;
		throw new ExitSignal(code ?? 0);
	}) as typeof process.exit;
	process.stdout.write = ((chunk: string): boolean => {
		stdout += chunk;
		return true;
	}) as typeof process.stdout.write;

	try {
		await handler?.();
	} catch (e) {
		if (!(e instanceof ExitSignal)) throw e;
	} finally {
		process.argv = original.argv;
		process.exit = original.exit;
		process.stdout.write = original.write;
	}

	return { exitCode, logger, stdout };
}

describe('audit scan — exit codes', () => {
	it('exits 0 and writes a clean report to stdout when no violations exist', async () => {
		const { exitCode, logger, stdout } = await runScan([path.join(FIXTURES, 'clean')]);
		expect(exitCode).toBe(0);
		expect(JSON.parse(stdout).summary.totalViolations).toBe(0);
		expect(logger.error).not.toHaveBeenCalled();
	});

	it('exits 1 and reports violations to stdout when duplication is found', async () => {
		const { exitCode, stdout } = await runScan([path.join(FIXTURES, 'violations'), '--threshold=3']);
		expect(exitCode).toBe(1);
		expect(JSON.parse(stdout).summary.totalViolations).toBeGreaterThan(0);
	});

	it('exits 2 and logs an error when an integer flag is not a number', async () => {
		const { exitCode, logger } = await runScan([path.join(FIXTURES, 'violations'), '--depth=abc']);
		expect(exitCode).toBe(2);
		expect(logger.error).toHaveBeenCalledWith(
			'Audit scan failed',
			expect.objectContaining({ message: 'Flag --depth must be an integer, got: abc' })
		);
	});
});

describe('audit scan — --output', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync('/tmp/valora-audit-cli-');
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { force: true, recursive: true });
	});

	it('writes the report to the given file instead of stdout', async () => {
		const outPath = path.join(tmpDir, 'report.json');
		const { exitCode, stdout } = await runScan([path.join(FIXTURES, 'violations'), `--output=${outPath}`]);

		expect(exitCode).toBe(1);
		expect(stdout).toBe('');
		expect(fs.existsSync(outPath)).toBe(true);
		expect(JSON.parse(fs.readFileSync(outPath, 'utf-8')).summary.totalViolations).toBeGreaterThan(0);
	});
});
