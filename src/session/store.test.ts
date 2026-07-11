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
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { InputValidationError } from 'utils/input-validator';

import { SessionStore } from './store';

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
