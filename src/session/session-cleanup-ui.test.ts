import * as fs from 'fs';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { SessionSummary } from 'types/session.types';
import type { UIAdapter, UIQuestion } from 'types/ui.types';

import { SessionCleanupUI } from './session-cleanup-ui';
import { SessionStore } from './store';

function isoDaysAgo(days: number): string {
	return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function writeSessionFile(sessionsDir: string, sessionId: string, overrides: Partial<SessionSummary> = {}): void {
	const now = new Date().toISOString();
	const content: SessionSummary & Record<string, unknown> = {
		command_count: 0,
		created_at: now,
		last_active: now,
		session_id: sessionId,
		size_bytes: 100,
		status: 'completed',
		updated_at: now,
		...overrides
	};
	fs.writeFileSync(
		path.join(sessionsDir, `${sessionId}.json`),
		JSON.stringify(content).padEnd(content.size_bytes, ' ')
	);
}

class FakeUIAdapter implements UIAdapter {
	displayed: string[] = [];
	errors: string[] = [];
	promptQueue: Array<null | Record<string, unknown>> = [];
	successes: string[] = [];
	warnings: string[] = [];

	display(message: string): void {
		this.displayed.push(message);
	}

	displayError(message: string): void {
		this.errors.push(message);
	}

	displayHeader(): void {}

	displaySeparator(): void {}

	displaySuccess(message: string): void {
		this.successes.push(message);
	}

	displayWarning(message: string): void {
		this.warnings.push(message);
	}

	format(text: string): string {
		return text;
	}

	formatBytes(bytes: number): string {
		return `${bytes}B`;
	}

	async prompt(_questions: UIQuestion[]): Promise<null | Record<string, unknown>> {
		if (this.promptQueue.length === 0) {
			throw new Error('FakeUIAdapter.prompt() called with no queued response');
		}
		return this.promptQueue.shift() ?? null;
	}
}

describe('SessionCleanupUI (real SessionStore, hand-faked UIAdapter)', () => {
	let sessionsDir: string;
	let store: SessionStore;
	let ui: FakeUIAdapter;
	let cleanupUi: SessionCleanupUI;

	beforeEach(() => {
		sessionsDir = mkdtempSync(path.join(tmpdir(), 'valora-session-cleanup-ui-'));
		store = new SessionStore(sessionsDir);
		ui = new FakeUIAdapter();
		cleanupUi = new SessionCleanupUI(ui, store);
	});

	afterEach(() => {
		rmSync(sessionsDir, { force: true, recursive: true });
	});

	describe('previewCleanup', () => {
		it('matches sessions older than minAgeDays', async () => {
			writeSessionFile(sessionsDir, 'sess-old', { updated_at: isoDaysAgo(60) });
			writeSessionFile(sessionsDir, 'sess-recent', { updated_at: isoDaysAgo(1) });

			const preview = await cleanupUi.previewCleanup({ minAgeDays: 30 });

			expect(preview.sessionsToDelete.map((s) => s.session_id)).toEqual(['sess-old']);
		});

		it('matches sessions by status', async () => {
			writeSessionFile(sessionsDir, 'sess-active', { status: 'active' });
			writeSessionFile(sessionsDir, 'sess-failed', { status: 'failed' });

			const preview = await cleanupUi.previewCleanup({ status: ['failed'] });

			expect(preview.sessionsToDelete.map((s) => s.session_id)).toEqual(['sess-failed']);
		});

		it('matches sessions by minimum size', async () => {
			writeSessionFile(sessionsDir, 'sess-small', { size_bytes: 100 });
			writeSessionFile(sessionsDir, 'sess-big', { size_bytes: 5 * 1024 * 1024 });

			const preview = await cleanupUi.previewCleanup({ minSizeMB: 1 });

			expect(preview.sessionsToDelete.map((s) => s.session_id)).toEqual(['sess-big']);
			expect(preview.totalSizeBytes).toBe(5 * 1024 * 1024);
		});

		it('combines criteria with AND semantics', async () => {
			writeSessionFile(sessionsDir, 'sess-old-failed', { status: 'failed', updated_at: isoDaysAgo(60) });
			writeSessionFile(sessionsDir, 'sess-old-completed', { status: 'completed', updated_at: isoDaysAgo(60) });
			writeSessionFile(sessionsDir, 'sess-recent-failed', { status: 'failed', updated_at: isoDaysAgo(1) });

			const preview = await cleanupUi.previewCleanup({ minAgeDays: 30, status: ['failed'] });

			expect(preview.sessionsToDelete.map((s) => s.session_id)).toEqual(['sess-old-failed']);
		});
	});

	describe('getAllSessions', () => {
		it('returns every session in the store', async () => {
			writeSessionFile(sessionsDir, 'sess-1');
			writeSessionFile(sessionsDir, 'sess-2');

			const sessions = await cleanupUi.getAllSessions();

			expect(sessions).toHaveLength(2);
		});
	});

	describe('cleanupByCriteria', () => {
		it('reports what would be deleted without deleting when dryRun is true', async () => {
			writeSessionFile(sessionsDir, 'sess-old', { updated_at: isoDaysAgo(60) });

			const count = await cleanupUi.cleanupByCriteria({ minAgeDays: 30 }, true);

			expect(count).toBe(1);
			expect(fs.existsSync(path.join(sessionsDir, 'sess-old.json'))).toBe(true);
		});

		it('actually deletes matching sessions when dryRun is false', async () => {
			writeSessionFile(sessionsDir, 'sess-old', { updated_at: isoDaysAgo(60) });
			writeSessionFile(sessionsDir, 'sess-recent', { updated_at: isoDaysAgo(1) });

			const count = await cleanupUi.cleanupByCriteria({ minAgeDays: 30 }, false);

			expect(count).toBe(1);
			expect(fs.existsSync(path.join(sessionsDir, 'sess-old.json'))).toBe(false);
			expect(fs.existsSync(path.join(sessionsDir, 'sess-recent.json'))).toBe(true);
		});

		it('counts only successful deletions and reports the failure when one deletion fails', async () => {
			writeSessionFile(sessionsDir, 'sess-old-1', { updated_at: isoDaysAgo(60) });
			writeSessionFile(sessionsDir, 'sess-old-2', { updated_at: isoDaysAgo(60) });
			// A real disk/permission error deleting one specific session file is hard to
			// force deterministically in a portable test; a thin override of deleteSession
			// on the real store (delegating to the real implementation for every other id)
			// exercises the same Promise.allSettled partial-failure path in executeCleanup.
			class FlakyStore extends SessionStore {
				override async deleteSession(sessionId: string): Promise<void> {
					if (sessionId === 'sess-old-1') {
						throw new Error('simulated disk error');
					}
					return super.deleteSession(sessionId);
				}
			}
			const flakyStore = new FlakyStore(sessionsDir);
			const flakyCleanupUi = new SessionCleanupUI(ui, flakyStore);

			const count = await flakyCleanupUi.cleanupByCriteria({ minAgeDays: 30 }, false);

			expect(count).toBe(1);
			expect(fs.existsSync(path.join(sessionsDir, 'sess-old-1.json'))).toBe(true);
			expect(fs.existsSync(path.join(sessionsDir, 'sess-old-2.json'))).toBe(false);
			expect(ui.errors.some((e) => e.includes('sess-old-1') && e.includes('simulated disk error'))).toBe(true);
		});
	});

	describe('interactiveCleanup', () => {
		it('returns 0 and warns when the user cancels at the criteria prompt', async () => {
			ui.promptQueue.push(null);

			const deleted = await cleanupUi.interactiveCleanup();

			expect(deleted).toBe(0);
			expect(ui.warnings.some((w) => /cancelled/i.test(w))).toBe(true);
		});

		it('returns 0 and warns when no criteria are selected', async () => {
			ui.promptQueue.push({ minAgeDays: '', minSizeMB: '', status: [] });

			const deleted = await cleanupUi.interactiveCleanup();

			expect(deleted).toBe(0);
			expect(ui.warnings.some((w) => /cancelled/i.test(w))).toBe(true);
		});

		it('returns 0 and reports success when criteria match no sessions', async () => {
			writeSessionFile(sessionsDir, 'sess-recent', { updated_at: isoDaysAgo(1) });
			ui.promptQueue.push({ minAgeDays: 30, minSizeMB: '', status: [] });

			const deleted = await cleanupUi.interactiveCleanup();

			expect(deleted).toBe(0);
			expect(ui.successes.some((s) => /no sessions match/i.test(s))).toBe(true);
		});

		it('deletes matching sessions when the user confirms', async () => {
			writeSessionFile(sessionsDir, 'sess-old', { updated_at: isoDaysAgo(60) });
			ui.promptQueue.push({ minAgeDays: 30, minSizeMB: '', status: [] });
			ui.promptQueue.push({ confirmed: true });

			const deleted = await cleanupUi.interactiveCleanup();

			expect(deleted).toBe(1);
			expect(fs.existsSync(path.join(sessionsDir, 'sess-old.json'))).toBe(false);
		});

		it('does not delete anything when the user declines the final confirmation', async () => {
			writeSessionFile(sessionsDir, 'sess-old', { updated_at: isoDaysAgo(60) });
			ui.promptQueue.push({ minAgeDays: 30, minSizeMB: '', status: [] });
			ui.promptQueue.push({ confirmed: false });

			const deleted = await cleanupUi.interactiveCleanup();

			expect(deleted).toBe(0);
			expect(fs.existsSync(path.join(sessionsDir, 'sess-old.json'))).toBe(true);
			expect(ui.warnings.some((w) => /cancelled/i.test(w))).toBe(true);
		});
	});
});
