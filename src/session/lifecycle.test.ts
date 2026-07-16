import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SessionLifecycle } from './lifecycle';
import { SessionStore } from './store';

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// saveSession() always stamps updated_at to "now", so backdating a session's
// age (to exercise archive/cleanup cutoffs) has to bypass it and rewrite the
// persisted file directly.
function backdateSessionFile(sessionsDir: string, sessionId: string, updatedAt: string): void {
	const filePath = path.join(sessionsDir, `${sessionId}.json`);
	const content = JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>;
	content['updated_at'] = updatedAt;
	writeFileSync(filePath, JSON.stringify(content));
}

describe('SessionLifecycle (real SessionStore, real temp directory)', () => {
	let sessionsDir: string;
	let store: SessionStore;
	let lifecycle: SessionLifecycle;

	beforeEach(() => {
		sessionsDir = mkdtempSync(path.join(tmpdir(), 'valora-session-lifecycle-'));
		store = new SessionStore(sessionsDir);
		lifecycle = new SessionLifecycle(store);
	});

	afterEach(() => {
		rmSync(sessionsDir, { force: true, recursive: true });
	});

	describe('create', () => {
		it('creates a persisted, active current session', async () => {
			const manager = await lifecycle.create();

			expect(lifecycle.getCurrentSession()).toBe(manager);
			expect(lifecycle.hasActiveSession()).toBe(true);

			const sessionId = manager.getSession().session_id;
			const loaded = await store.loadSession(sessionId);
			expect(loaded.status).toBe('active');
		});

		it('applies an initial context and persists it', async () => {
			const manager = await lifecycle.create({ initialContext: { goal: 'ship the feature' } });

			const loaded = await store.loadSession(manager.getSession().session_id);
			expect(loaded.context).toEqual({ goal: 'ship the feature' });
		});
	});

	describe('resume', () => {
		it('throws when the session does not exist', async () => {
			await expect(lifecycle.resume({ sessionId: 'does-not-exist' })).rejects.toThrow(/not found/i);
		});

		it('loads an existing session, marks it active, and persists the status change', async () => {
			const created = await lifecycle.create();
			const sessionId = created.getSession().session_id;
			await lifecycle.pause();
			expect((await store.loadSession(sessionId)).status).toBe('paused');

			const resumed = await lifecycle.resume({ sessionId });

			expect(resumed.getSession().status).toBe('active');
			expect((await store.loadSession(sessionId)).status).toBe('active');
		});

		it('clears context when resetContext is set', async () => {
			const created = await lifecycle.create({ initialContext: { foo: 'bar' } });
			const sessionId = created.getSession().session_id;

			const resumed = await lifecycle.resume({ resetContext: true, sessionId });

			expect(resumed.getSession().context).toEqual({});
		});
	});

	describe('getOrCreate', () => {
		it('resumes an existing session by id', async () => {
			const created = await lifecycle.create();
			const sessionId = created.getSession().session_id;
			const otherLifecycle = new SessionLifecycle(store);

			const result = await otherLifecycle.getOrCreate(sessionId);

			expect(result.getSession().session_id).toBe(sessionId);
			expect(result.getSession().status).toBe('active');
		});

		it('creates a new session when the given id does not exist', async () => {
			const result = await lifecycle.getOrCreate('brand-new-id');

			expect(result.getSession().session_id).toBe('brand-new-id');
		});

		it('creates a new session when no id is given', async () => {
			const result = await lifecycle.getOrCreate();

			expect(result.getSession().session_id).toBeTruthy();
		});
	});

	describe('status transitions', () => {
		it('complete() marks the session completed, persists immediately, and clears currentSession', async () => {
			const created = await lifecycle.create();
			const sessionId = created.getSession().session_id;

			await lifecycle.complete();

			expect(lifecycle.getCurrentSession()).toBeNull();
			expect(lifecycle.hasActiveSession()).toBe(false);
			expect((await store.loadSession(sessionId)).status).toBe('completed');
		});

		it('complete() throws when there is no active session', async () => {
			await expect(lifecycle.complete()).rejects.toThrow(/no active session/i);
		});

		it('fail() marks the session failed, records the error in context, persists, and clears currentSession', async () => {
			const created = await lifecycle.create();
			const sessionId = created.getSession().session_id;

			await lifecycle.fail('boom');

			expect(lifecycle.getCurrentSession()).toBeNull();
			const loaded = await store.loadSession(sessionId);
			expect(loaded.status).toBe('failed');
			expect(loaded.context['error']).toBe('boom');
		});

		it('fail() throws when there is no active session', async () => {
			await expect(lifecycle.fail()).rejects.toThrow(/no active session/i);
		});

		it('pause() marks the session paused, persists, but keeps currentSession set', async () => {
			const created = await lifecycle.create();
			const sessionId = created.getSession().session_id;

			await lifecycle.pause();

			expect(lifecycle.getCurrentSession()).not.toBeNull();
			expect((await store.loadSession(sessionId)).status).toBe('paused');
		});

		it('pause() throws when there is no active session', async () => {
			await expect(lifecycle.pause()).rejects.toThrow(/no active session/i);
		});
	});

	describe('persist', () => {
		it('persist(true) rejects when there is no active session', async () => {
			await expect(lifecycle.persist(true)).rejects.toThrow(/no active session/i);
		});

		it('debounces persist(false): nothing is saved until the debounce delay elapses', async () => {
			const created = await lifecycle.create();
			const sessionId = created.getSession().session_id;
			created.updateContext('key', 'value-before-debounced-persist');

			lifecycle.persist(false);
			await sleep(400);
			expect((await store.loadSession(sessionId)).context['key']).toBeUndefined();

			await sleep(800);
			expect((await store.loadSession(sessionId)).context['key']).toBe('value-before-debounced-persist');
		}, 10000);

		it('uses an extended debounce window for a rapid second persist(false) on the same session', async () => {
			const created = await lifecycle.create();
			const sessionId = created.getSession().session_id;

			await lifecycle.persist(true);
			created.updateContext('key', 'second-value');
			lifecycle.persist(false);

			await sleep(1200);
			expect((await store.loadSession(sessionId)).context['key']).toBeUndefined();

			await sleep(4500);
			expect((await store.loadSession(sessionId)).context['key']).toBe('second-value');
		}, 10000);
	});

	describe('flushPendingPersistence', () => {
		it('immediately persists a pending debounced write instead of waiting for the delay', async () => {
			const created = await lifecycle.create();
			const sessionId = created.getSession().session_id;
			created.updateContext('key', 'flushed-value');

			lifecycle.persist(false);
			await lifecycle.flushPendingPersistence();

			expect((await store.loadSession(sessionId)).context['key']).toBe('flushed-value');
		});

		it('is a no-op when there is no pending debounced persistence', async () => {
			await expect(lifecycle.flushPendingPersistence()).resolves.toBeUndefined();
		});
	});

	describe('delegation to SessionStore', () => {
		it('listSessions returns sessions created via the lifecycle', async () => {
			await lifecycle.create();

			const sessions = await lifecycle.listSessions();

			expect(sessions).toHaveLength(1);
		});

		it('getRecentOrCreate reuses the most recent active session', async () => {
			const created = await lifecycle.create();
			const sessionId = created.getSession().session_id;
			const otherLifecycle = new SessionLifecycle(store);

			const result = await otherLifecycle.getRecentOrCreate();

			expect(result.getSession().session_id).toBe(sessionId);
		});

		it('getRecentOrCreate creates a new session when there is no active recent one', async () => {
			const created = await lifecycle.create();
			await lifecycle.complete();
			void created;
			const otherLifecycle = new SessionLifecycle(store);

			const result = await otherLifecycle.getRecentOrCreate();

			expect(result.getSession().status).toBe('active');
		});

		it('archiveOldSessions marks sessions older than the cutoff as completed', async () => {
			const created = await lifecycle.create();
			const sessionId = created.getSession().session_id;
			backdateSessionFile(sessionsDir, sessionId, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

			const count = await lifecycle.archiveOldSessions(7);

			expect(count).toBe(1);
			expect((await store.loadSession(sessionId)).status).toBe('completed');
		});

		it('cleanupOldSessions deletes completed sessions older than the cutoff', async () => {
			const created = await lifecycle.create();
			const sessionId = created.getSession().session_id;
			await lifecycle.complete();
			backdateSessionFile(sessionsDir, sessionId, new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString());

			const count = await lifecycle.cleanupOldSessions(30);

			expect(count).toBe(1);
			await expect(store.sessionExists(sessionId)).resolves.toBe(false);
		});

		it('deleteSession removes the session file', async () => {
			const created = await lifecycle.create();
			const sessionId = created.getSession().session_id;

			await lifecycle.deleteSession(sessionId);

			await expect(store.sessionExists(sessionId)).resolves.toBe(false);
		});
	});
});
