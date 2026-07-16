/**
 * Tests for the destructive session subcommands (delete/clean/clear/import).
 *
 * `list`/`resume`/`browse`/`archive`/`show` and `export`'s outputPath-validation
 * path are covered elsewhere (session-export.test.ts); this file exists
 * specifically because delete/clean/clear/import had zero coverage despite
 * being irreversible, bulk-deletion-capable commands.
 *
 * Uses a real SessionStore against a real temp directory (mocking only
 * utils/paths.getRuntimeDataDir, since session.ts's action handlers always
 * construct `new SessionStore()`/`new SessionCleanupUI(ui)` with no way to
 * inject a custom directory from the CLI layer) — real collaborators over
 * mocks wherever the command actually mutates filesystem state.
 */
import { Command } from 'commander';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Session } from 'types/session.types';

let sessionsRoot: string;
vi.mock('utils/paths', async (importOriginal) => {
	const actual = await importOriginal<typeof import('utils/paths')>();
	return { ...actual, getRuntimeDataDir: () => sessionsRoot };
});

const mockPromptFn = vi.hoisted(() => vi.fn());
vi.mock('ui/prompt-adapter.interface', () => ({
	getPromptAdapter: () => ({ prompt: mockPromptFn })
}));

const noopSpinner = { fail: () => noopSpinner, start: () => noopSpinner, succeed: () => noopSpinner, text: '' };
vi.mock('ui/spinner-adapter.interface', () => ({
	getSpinnerAdapter: () => ({ create: () => noopSpinner })
}));

vi.mock('output/color-adapter.interface', () => ({
	getColorAdapter: () => ({
		bold: (s: string) => s,
		cyan: (s: string) => s,
		gray: (s: string) => s,
		green: (s: string) => s,
		red: (s: string) => s,
		yellow: (s: string) => s
	})
}));

import { configureSessionCommand } from './session';
import { SessionStore } from 'session/store';

function makeProgram(): Command {
	const program = new Command();
	program.exitOverride();
	configureSessionCommand(program as never);
	return program;
}

async function runCommand(program: Command, args: string[]): Promise<void> {
	await program.parseAsync(['node', 'valora', ...args]);
}

describe('session delete/clean/clear/import (real session store)', () => {
	let tmpDir: string;
	let sessionsDir: string;
	let store: SessionStore;
	let exitSpy: ReturnType<typeof vi.spyOn>;
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
	let consoleLogSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'valora-session-cmd-'));
		sessionsRoot = tmpDir;
		sessionsDir = path.join(tmpDir, 'sessions');
		store = new SessionStore(sessionsDir);
		mockPromptFn.mockReset();
		exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { force: true, recursive: true });
		vi.restoreAllMocks();
	});

	function loggedOutput(): string {
		return consoleLogSpy.mock.calls.map((c) => c.join(' ')).join('\n');
	}

	/** Seeds a real session file, bypassing saveSession()'s always-stamp-now updated_at so tests can backdate it. */
	async function seedSession(id: string, overrides: Partial<Session> = {}): Promise<Session> {
		const created = await store.createSession(id);
		const session: Session = { ...created, ...overrides };
		await fs.mkdir(sessionsDir, { recursive: true });
		await fs.writeFile(path.join(sessionsDir, `${id}.json`), JSON.stringify(session, null, 2));
		return session;
	}

	function daysAgoIso(days: number): string {
		return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
	}

	describe('delete', () => {
		it('deletes the session file when the user confirms', async () => {
			await seedSession('sess-del-confirm');
			mockPromptFn.mockResolvedValueOnce({ confirm: true });

			await runCommand(makeProgram(), ['session', 'delete', 'sess-del-confirm']);

			await expect(store.sessionExists('sess-del-confirm')).resolves.toBe(false);
			expect(exitSpy).not.toHaveBeenCalled();
		});

		it('leaves the session untouched when the user declines confirmation', async () => {
			await seedSession('sess-del-decline');
			mockPromptFn.mockResolvedValueOnce({ confirm: false });

			await runCommand(makeProgram(), ['session', 'delete', 'sess-del-decline']);

			await expect(store.sessionExists('sess-del-decline')).resolves.toBe(true);
			expect(loggedOutput()).toContain('Deletion cancelled');
		});

		it('skips the confirmation prompt and deletes immediately with --force', async () => {
			await seedSession('sess-del-force');

			await runCommand(makeProgram(), ['session', 'delete', 'sess-del-force', '--force']);

			await expect(store.sessionExists('sess-del-force')).resolves.toBe(false);
			expect(mockPromptFn).not.toHaveBeenCalled();
		});

		it('exits with an error when deleting a session that does not exist', async () => {
			await runCommand(makeProgram(), ['session', 'delete', 'never-existed', '--force']);

			expect(exitSpy).toHaveBeenCalledWith(1);
			expect(consoleErrorSpy).toHaveBeenCalled();
		});
	});

	describe('clean --dry-run', () => {
		it('reports what would be deleted without deleting anything', async () => {
			await seedSession('sess-old-1', { status: 'completed', updated_at: daysAgoIso(60) });
			await seedSession('sess-old-2', { status: 'completed', updated_at: daysAgoIso(45) });
			await seedSession('sess-fresh', { status: 'active', updated_at: daysAgoIso(1) });

			await runCommand(makeProgram(), ['session', 'clean', '--older-than', '30', '--dry-run']);

			expect(loggedOutput()).toContain('Would delete 2 session');
			await expect(store.sessionExists('sess-old-1')).resolves.toBe(true);
			await expect(store.sessionExists('sess-old-2')).resolves.toBe(true);
			await expect(store.sessionExists('sess-fresh')).resolves.toBe(true);
		});
	});

	describe('clean --older-than --force', () => {
		it('deletes only sessions older than the given threshold, leaving fresher ones untouched', async () => {
			await seedSession('sess-old', { updated_at: daysAgoIso(60) });
			await seedSession('sess-fresh', { updated_at: daysAgoIso(1) });

			await runCommand(makeProgram(), ['session', 'clean', '--older-than', '30', '--force']);

			await expect(store.sessionExists('sess-old')).resolves.toBe(false);
			await expect(store.sessionExists('sess-fresh')).resolves.toBe(true);
			expect(mockPromptFn).not.toHaveBeenCalled();
		});
	});

	describe('clean --status', () => {
		it('deletes only sessions matching the given status', async () => {
			await seedSession('sess-failed', { status: 'failed' });
			await seedSession('sess-active', { status: 'active' });

			await runCommand(makeProgram(), ['session', 'clean', '--status', 'failed', '--force']);

			await expect(store.sessionExists('sess-failed')).resolves.toBe(false);
			await expect(store.sessionExists('sess-active')).resolves.toBe(true);
		});

		it('exits with an error for an unrecognised status value', async () => {
			await runCommand(makeProgram(), ['session', 'clean', '--status', 'bogus', '--force']);

			expect(exitSpy).toHaveBeenCalledWith(1);
			expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid status'));
		});
	});

	describe('clean — bulk-deletion warning threshold', () => {
		it('warns and aborts when declined, deleting nothing, when more than 50% of sessions would be deleted', async () => {
			await seedSession('sess-1', { status: 'failed' });
			await seedSession('sess-2', { status: 'failed' });
			await seedSession('sess-3', { status: 'active' });
			// 2 of 3 (67%) match — crosses the 50% warning threshold.
			mockPromptFn.mockResolvedValueOnce({ confirmed: false });

			await runCommand(makeProgram(), ['session', 'clean', '--status', 'failed']);

			expect(loggedOutput()).toContain('WARNING');
			await expect(store.sessionExists('sess-1')).resolves.toBe(true);
			await expect(store.sessionExists('sess-2')).resolves.toBe(true);
		});

		it('proceeds to delete once both the warning and the deletion prompt are confirmed', async () => {
			await seedSession('sess-1', { status: 'failed' });
			await seedSession('sess-2', { status: 'failed' });
			await seedSession('sess-3', { status: 'active' });
			mockPromptFn.mockResolvedValueOnce({ confirmed: true }); // the >50% warning
			mockPromptFn.mockResolvedValueOnce({ confirmed: true }); // the "delete N sessions?" prompt

			await runCommand(makeProgram(), ['session', 'clean', '--status', 'failed']);

			await expect(store.sessionExists('sess-1')).resolves.toBe(false);
			await expect(store.sessionExists('sess-2')).resolves.toBe(false);
			await expect(store.sessionExists('sess-3')).resolves.toBe(true);
		});

		it('does not warn when at or below 50% of sessions would be deleted', async () => {
			await seedSession('sess-1', { status: 'failed' });
			await seedSession('sess-2', { status: 'active' });
			await seedSession('sess-3', { status: 'active' });
			// 1 of 3 (33%) matches — below the warning threshold, but deletion still needs its own confirmation.
			mockPromptFn.mockResolvedValueOnce({ confirmed: true });

			await runCommand(makeProgram(), ['session', 'clean', '--status', 'failed']);

			expect(loggedOutput()).not.toContain('WARNING');
			expect(mockPromptFn).toHaveBeenCalledTimes(1);
			await expect(store.sessionExists('sess-1')).resolves.toBe(false);
		});
	});

	describe('clear (deprecated alias)', () => {
		it('deletes only completed sessions older than the default cleanup window (30 days)', async () => {
			await seedSession('sess-old-completed', { status: 'completed', updated_at: daysAgoIso(60) });
			await seedSession('sess-fresh-completed', { status: 'completed', updated_at: daysAgoIso(1) });
			await seedSession('sess-old-active', { status: 'active', updated_at: daysAgoIso(60) });

			await runCommand(makeProgram(), ['session', 'clear']);

			await expect(store.sessionExists('sess-old-completed')).resolves.toBe(false);
			await expect(store.sessionExists('sess-fresh-completed')).resolves.toBe(true);
			await expect(store.sessionExists('sess-old-active')).resolves.toBe(true);
			expect(mockPromptFn).not.toHaveBeenCalled();
			expect(loggedOutput()).toContain('Cleared 1 inactive session');
		});
	});

	describe('import --overwrite', () => {
		async function exportRealZip(sessionId: string): Promise<string> {
			const { createArchiveAdapter } = await import('session/archive-adapter');
			const { SessionExporter } = await import('session/session-exporter');
			const exporter = new SessionExporter(store, createArchiveAdapter());
			return exporter.exportSession(sessionId, { outputPath: path.join(tmpDir, `${sessionId}-export.zip`) });
		}

		it('refuses to import over an existing session without --overwrite', async () => {
			await seedSession('sess-conflict');
			const zipPath = await exportRealZip('sess-conflict');

			await runCommand(makeProgram(), ['session', 'import', zipPath]);

			expect(exitSpy).toHaveBeenCalledWith(1);
			expect(consoleErrorSpy.mock.calls.flat().join(' ')).toContain('already exists');
		});

		it('overwrites the existing session when --overwrite is passed', async () => {
			const original = await seedSession('sess-overwrite-target', { context: { note: 'original' } });
			const zipPath = await exportRealZip('sess-overwrite-target');
			// Mutate the on-disk session after export so we can tell whether import actually re-wrote it.
			await seedSession('sess-overwrite-target', { ...original, context: { note: 'mutated-before-import' } });

			await runCommand(makeProgram(), ['session', 'import', zipPath, '--overwrite']);

			expect(exitSpy).not.toHaveBeenCalled();
			const imported = await store.loadSession('sess-overwrite-target');
			expect(imported.context['note']).toBe('original');
		});

		it('imports successfully under a new target session id with no conflict', async () => {
			await seedSession('sess-import-source');
			const zipPath = await exportRealZip('sess-import-source');

			await runCommand(makeProgram(), ['session', 'import', zipPath, 'sess-import-renamed']);

			expect(exitSpy).not.toHaveBeenCalled();
			await expect(store.sessionExists('sess-import-renamed')).resolves.toBe(true);
		});
	});
});
