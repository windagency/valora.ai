import * as fs from 'fs';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { SessionSummary } from 'types/session.types';

import { SessionCleanupScheduler } from './cleanup-scheduler';
import { SessionRetentionManager } from './retention-manager';
import { SessionStore } from './store';

function isoDaysAgo(days: number): string {
	return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe('SessionCleanupScheduler (real filesystem)', () => {
	let sessionsDir: string;
	let store: SessionStore;

	beforeEach(() => {
		sessionsDir = mkdtempSync(path.join(tmpdir(), 'valora-session-cleanup-scheduler-'));
		store = new SessionStore(sessionsDir);
	});

	afterEach(() => {
		rmSync(sessionsDir, { force: true, recursive: true });
	});

	describe('start/stop lifecycle', () => {
		it('does not start when the schedule is disabled', () => {
			const retentionManager = new SessionRetentionManager({});
			const scheduler = new SessionCleanupScheduler(retentionManager, store, {
				enabled: false,
				intervalHours: 1
			});

			scheduler.start();

			expect(scheduler.isSchedulerRunning()).toBe(false);
		});

		it('reports running after start() and not running after stop()', () => {
			const retentionManager = new SessionRetentionManager({});
			const scheduler = new SessionCleanupScheduler(retentionManager, store, {
				enabled: true,
				intervalHours: 1
			});

			scheduler.start();
			expect(scheduler.isSchedulerRunning()).toBe(true);

			scheduler.stop();
			expect(scheduler.isSchedulerRunning()).toBe(false);
		});

		it('stays running when start() is called again while already running', () => {
			const retentionManager = new SessionRetentionManager({});
			const scheduler = new SessionCleanupScheduler(retentionManager, store, {
				enabled: true,
				intervalHours: 1
			});

			scheduler.start();
			scheduler.start();

			expect(scheduler.isSchedulerRunning()).toBe(true);
			scheduler.stop();
		});

		it('is a no-op to stop a scheduler that was never started', () => {
			const retentionManager = new SessionRetentionManager({});
			const scheduler = new SessionCleanupScheduler(retentionManager, store, {
				enabled: true,
				intervalHours: 1
			});

			expect(() => scheduler.stop()).not.toThrow();
			expect(scheduler.isSchedulerRunning()).toBe(false);
		});
	});

	describe('runNow', () => {
		it('actually deletes sessions past maxAgeDays and reports the result', async () => {
			const oldId = 'sess-old';
			const recentId = 'sess-recent';
			fs.writeFileSync(path.join(sessionsDir, `${oldId}.json`), JSON.stringify(makeSessionFile(oldId)));
			fs.writeFileSync(path.join(sessionsDir, `${recentId}.json`), JSON.stringify(makeSessionFile(recentId)));
			// Backdate the old session's updated_at by rewriting it after listSessions would derive it from content.
			const oldPath = path.join(sessionsDir, `${oldId}.json`);
			const oldContent = JSON.parse(fs.readFileSync(oldPath, 'utf8')) as Record<string, unknown>;
			oldContent['updated_at'] = isoDaysAgo(60);
			fs.writeFileSync(oldPath, JSON.stringify(oldContent));

			const retentionManager = new SessionRetentionManager({ maxAgeDays: 30 });
			const scheduler = new SessionCleanupScheduler(retentionManager, store, {
				enabled: true,
				intervalHours: 1
			});

			const result = await scheduler.runNow();

			expect(result.deletedSessions).toEqual([oldId]);
			expect(fs.existsSync(oldPath)).toBe(false);
			expect(fs.existsSync(path.join(sessionsDir, `${recentId}.json`))).toBe(true);
		});
	});
});

function makeSessionFile(sessionId: string): SessionSummary & Record<string, unknown> {
	const now = new Date().toISOString();
	return {
		command_count: 1,
		created_at: now,
		last_active: now,
		session_id: sessionId,
		size_bytes: 0,
		status: 'completed',
		updated_at: now
	};
}
