/**
 * SessionStore path-safety tests.
 *
 * `sessionId` reaches `SessionStore`'s file-path-building methods
 * (`getSessionPath`/`getSnapshotPath`) as a raw CLI positional argument via
 * `session delete <id>`/`show`/`export` (`src/cli/commands/session.ts`) with
 * no validation at all — `../` traversal in the ID was a live, unconditional
 * arbitrary-`.json`-file-delete primitive, reachable from a single shell
 * command with no CommandGuard involvement (base command is `valora`, not a
 * recognised destructive keyword or redirect token).
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InputValidationError } from 'utils/input-validator';

vi.mock('utils/file-utils', async (importOriginal) => {
	const actual = await importOriginal<typeof import('utils/file-utils')>();
	return { ...actual, writeFile: vi.fn(actual.writeFile) };
});

import { writeFile } from 'utils/file-utils';

import { SessionStore } from './store';

/** Directly rewrites a session's on-disk `updated_at`/`status` fields, bypassing
 * saveSession()'s own timestamp stamping, to construct sessions of a controlled age. */
function rewriteSessionMetadata(
	sessionsDir: string,
	sessionId: string,
	patch: { status?: string; updated_at?: string }
): void {
	const filePath = path.join(sessionsDir, `${sessionId}.json`);
	const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
	Object.assign(raw, patch);
	writeFileSync(filePath, JSON.stringify(raw, null, 2));
}

describe('SessionStore — sessionId path safety', () => {
	let sessionsDir: string;
	let store: SessionStore;

	beforeEach(() => {
		sessionsDir = mkdtempSync(path.join(tmpdir(), 'valora-sessions-'));
		store = new SessionStore(sessionsDir);
	});

	afterEach(() => {
		rmSync(sessionsDir, { force: true, recursive: true });
	});

	it('rejects a traversal sessionId before loadSession reads any file', async () => {
		await expect(store.loadSession('../../../../etc/passwd')).rejects.toThrow(InputValidationError);
	});

	it('rejects a traversal sessionId before deleteSession can delete anything', async () => {
		// The highest-impact path: deleteSession does fs.unlink(getSessionPath(sessionId))
		// with no scoping. A crafted ID pointing outside sessionsDir must never
		// reach that unlink call.
		const outsideDir = mkdtempSync(path.join(tmpdir(), 'valora-outside-'));
		const canaryFile = path.join(outsideDir, 'mcp-baselines.json');
		writeFileSync(canaryFile, '{"important": true}');

		const traversalId = path.relative(sessionsDir, canaryFile).replace(/\.json$/, '');
		await expect(store.deleteSession(traversalId)).rejects.toThrow(InputValidationError);

		expect(() => writeFileSync(canaryFile, '{"important": true}', { flag: 'r+' })).not.toThrow();
		rmSync(outsideDir, { force: true, recursive: true });
	});

	it('rejects a traversal sessionId in saveSession (via session_id on the session object)', async () => {
		const session = await store.createSession();
		await expect(store.saveSession({ ...session, session_id: '../../../../etc/traversal-via-save' })).rejects.toThrow(
			InputValidationError
		);
	});

	it('still allows a well-formed session ID', async () => {
		const session = await store.createSession('abc123_DEF-456');
		const loaded = await store.loadSession(session.session_id);
		expect(loaded.session_id).toBe('abc123_DEF-456');
	});

	it('still round-trips a real session end-to-end (create/load/delete all use the same validated ID)', async () => {
		const session = await store.createSession();
		const loaded = await store.loadSession(session.session_id);
		expect(loaded.session_id).toBe(session.session_id);

		await store.deleteSession(session.session_id);
		await expect(store.loadSession(session.session_id)).rejects.toThrow();
	});
});

describe('SessionStore — listing, existence, and retrieval', () => {
	let sessionsDir: string;
	let store: SessionStore;

	beforeEach(() => {
		sessionsDir = mkdtempSync(path.join(tmpdir(), 'valora-sessions-'));
		store = new SessionStore(sessionsDir);
	});

	afterEach(() => {
		rmSync(sessionsDir, { force: true, recursive: true });
	});

	it('sessionExists is true for a saved session and false for one never created', async () => {
		const session = await store.createSession('exists-me');
		await expect(store.sessionExists(session.session_id)).resolves.toBe(true);
		await expect(store.sessionExists('never-created')).resolves.toBe(false);
	});

	it('listSessions returns every saved session sorted by most-recently-updated first', async () => {
		const older = await store.createSession('older-session');
		rewriteSessionMetadata(sessionsDir, older.session_id, { updated_at: '2020-01-01T00:00:00.000Z' });
		const newer = await store.createSession('newer-session');
		rewriteSessionMetadata(sessionsDir, newer.session_id, { updated_at: '2026-01-01T00:00:00.000Z' });

		const summaries = await store.listSessions();

		expect(summaries.map((s) => s.session_id)).toEqual(['newer-session', 'older-session']);
	});

	it('listSessions excludes snapshot files from the results', async () => {
		await store.createSession('with-snapshot');

		const summaries = await store.listSessions();

		expect(summaries).toHaveLength(1);
		expect(summaries[0]?.session_id).toBe('with-snapshot');
	});

	it('getRecentSession returns the most-recently-updated session', async () => {
		const older = await store.createSession('older');
		rewriteSessionMetadata(sessionsDir, older.session_id, { updated_at: '2020-01-01T00:00:00.000Z' });
		const newer = await store.createSession('newer');
		rewriteSessionMetadata(sessionsDir, newer.session_id, { updated_at: '2026-01-01T00:00:00.000Z' });

		const recent = await store.getRecentSession();

		expect(recent?.session_id).toBe('newer');
	});

	it('getRecentSession returns null when no sessions exist', async () => {
		await expect(store.getRecentSession()).resolves.toBeNull();
	});
});

describe('SessionStore — archiveSessions', () => {
	let sessionsDir: string;
	let store: SessionStore;

	beforeEach(() => {
		sessionsDir = mkdtempSync(path.join(tmpdir(), 'valora-sessions-'));
		store = new SessionStore(sessionsDir);
	});

	afterEach(() => {
		rmSync(sessionsDir, { force: true, recursive: true });
	});

	it('marks sessions updated before the given date as completed, regardless of current status', async () => {
		const old = await store.createSession('old-active');
		rewriteSessionMetadata(sessionsDir, old.session_id, { status: 'active', updated_at: '2020-01-01T00:00:00.000Z' });
		const recent = await store.createSession('recent-active');
		rewriteSessionMetadata(sessionsDir, recent.session_id, {
			status: 'active',
			updated_at: '2026-01-01T00:00:00.000Z'
		});

		const count = await store.archiveSessions(new Date('2025-01-01'));

		expect(count).toBe(1);
		const archived = await store.loadSession('old-active');
		expect(archived.status).toBe('completed');
		const untouched = await store.loadSession('recent-active');
		expect(untouched.status).toBe('active');
	});

	it('archives nothing when every session is newer than the cutoff', async () => {
		const session = await store.createSession('brand-new');
		rewriteSessionMetadata(sessionsDir, session.session_id, { updated_at: '2026-01-01T00:00:00.000Z' });

		const count = await store.archiveSessions(new Date('2020-01-01'));

		expect(count).toBe(0);
	});
});

describe('SessionStore — cleanupOldSessions', () => {
	let sessionsDir: string;
	let store: SessionStore;

	beforeEach(() => {
		sessionsDir = mkdtempSync(path.join(tmpdir(), 'valora-sessions-'));
		store = new SessionStore(sessionsDir);
	});

	afterEach(() => {
		rmSync(sessionsDir, { force: true, recursive: true });
	});

	it('deletes only completed sessions older than the cutoff, leaving newer or non-completed ones intact', async () => {
		const oldCompleted = await store.createSession('old-completed');
		rewriteSessionMetadata(sessionsDir, oldCompleted.session_id, {
			status: 'completed',
			updated_at: '2020-01-01T00:00:00.000Z'
		});
		const oldActive = await store.createSession('old-active');
		rewriteSessionMetadata(sessionsDir, oldActive.session_id, {
			status: 'active',
			updated_at: '2020-01-01T00:00:00.000Z'
		});
		const recentCompleted = await store.createSession('recent-completed');
		rewriteSessionMetadata(sessionsDir, recentCompleted.session_id, {
			status: 'completed',
			updated_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
		});

		const deletedCount = await store.cleanupOldSessions(30);

		expect(deletedCount).toBe(1);
		await expect(store.sessionExists('old-completed')).resolves.toBe(false);
		await expect(store.sessionExists('old-active')).resolves.toBe(true);
		await expect(store.sessionExists('recent-completed')).resolves.toBe(true);
	});

	it('deletes nothing when no completed session is older than the cutoff', async () => {
		const session = await store.createSession('recent-completed');
		rewriteSessionMetadata(sessionsDir, session.session_id, {
			status: 'completed',
			updated_at: new Date().toISOString()
		});

		const deletedCount = await store.cleanupOldSessions(30);

		expect(deletedCount).toBe(0);
		await expect(store.sessionExists('recent-completed')).resolves.toBe(true);
	});
});

describe('SessionStore — snapshots', () => {
	let sessionsDir: string;
	let store: SessionStore;

	beforeEach(() => {
		sessionsDir = mkdtempSync(path.join(tmpdir(), 'valora-sessions-'));
		store = new SessionStore(sessionsDir);
	});

	afterEach(() => {
		rmSync(sessionsDir, { force: true, recursive: true });
	});

	it('saveSnapshot + loadSnapshot round-trips the essential session fields', async () => {
		const session = await store.createSession('snap-me');

		const snapshot = await store.loadSnapshot(session.session_id);

		expect(snapshot?.session_id).toBe('snap-me');
		expect(snapshot?.status).toBe('active');
	});

	it('loadSnapshot returns null for a session that was never saved', async () => {
		await expect(store.loadSnapshot('never-existed')).resolves.toBeNull();
	});

	it('loadSnapshot returns null and ignores a snapshot with a mismatched version', async () => {
		const session = await store.createSession('versioned');
		const snapshotPath = path.join(sessionsDir, `${session.session_id}.snapshot.json`);
		const raw = JSON.parse(readFileSync(snapshotPath, 'utf-8')) as Record<string, unknown>;
		raw['snapshot_version'] = 999;
		writeFileSync(snapshotPath, JSON.stringify(raw));

		await expect(store.loadSnapshot(session.session_id)).resolves.toBeNull();
	});

	it('deleteSnapshot removes the snapshot file without throwing when it does not exist', async () => {
		await expect(store.deleteSnapshot('never-existed')).resolves.toBeUndefined();
	});

	it('deleteSnapshot removes an existing snapshot file', async () => {
		const session = await store.createSession('to-delete');
		const snapshotPath = path.join(sessionsDir, `${session.session_id}.snapshot.json`);
		expect(readFileSync(snapshotPath, 'utf-8')).toBeTruthy();

		await store.deleteSnapshot(session.session_id);

		expect(() => readFileSync(snapshotPath, 'utf-8')).toThrow();
	});

	describe('isSnapshotSufficient', () => {
		it('is false when the caller needs full history, regardless of snapshot age', async () => {
			const session = await store.createSession('needs-full');
			const snapshot = await store.loadSnapshot(session.session_id);
			expect(store.isSnapshotSufficient(snapshot!, true)).toBe(false);
		});

		it('is true for a fresh snapshot when full history is not needed', async () => {
			const session = await store.createSession('fresh');
			const snapshot = await store.loadSnapshot(session.session_id);
			expect(store.isSnapshotSufficient(snapshot!, false)).toBe(true);
		});

		it('is false for a snapshot older than 5 minutes', async () => {
			const session = await store.createSession('stale');
			const snapshot = await store.loadSnapshot(session.session_id);
			const staleSnapshot = { ...snapshot!, updated_at: new Date(Date.now() - 6 * 60 * 1000).toISOString() };
			expect(store.isSnapshotSufficient(staleSnapshot, false)).toBe(false);
		});
	});
});

describe('SessionStore — saveSession sandboxed EPERM fallback', () => {
	let sessionsDir: string;
	let store: SessionStore;
	const originalEnv = { ...process.env };

	beforeEach(() => {
		sessionsDir = mkdtempSync(path.join(tmpdir(), 'valora-sessions-'));
		store = new SessionStore(sessionsDir);
		vi.mocked(writeFile).mockClear();
	});

	afterEach(() => {
		process.env = { ...originalEnv };
		rmSync(sessionsDir, { force: true, recursive: true });
	});

	it('swallows an EPERM write failure in a sandboxed environment rather than throwing', async () => {
		process.env['NODE_ENV'] = 'test';
		vi.mocked(writeFile).mockRejectedValueOnce(Object.assign(new Error('no perm'), { code: 'EPERM' }));

		await expect(store.createSession('sandboxed-session')).resolves.toBeTruthy();
	});

	it('still throws an EPERM write failure outside a sandboxed environment', async () => {
		delete process.env['NODE_ENV'];
		delete process.env['AI_MCP_ENABLED'];
		vi.mocked(writeFile).mockRejectedValueOnce(Object.assign(new Error('no perm'), { code: 'EPERM' }));

		await expect(store.createSession('unsandboxed-session')).rejects.toThrow();
	});
});
