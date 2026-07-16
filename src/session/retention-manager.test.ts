import * as fs from 'fs';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { SessionSummary } from 'types/session.types';

import { SessionRetentionManager } from './retention-manager';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MB = 1024 * 1024;

function isoDaysAgo(days: number): string {
	return new Date(Date.now() - days * MS_PER_DAY).toISOString();
}

function makeSession(sessionId: string, overrides: Partial<SessionSummary> = {}): SessionSummary {
	return {
		command_count: 1,
		created_at: isoDaysAgo(10),
		last_active: isoDaysAgo(10),
		session_id: sessionId,
		size_bytes: 1024,
		status: 'completed',
		updated_at: isoDaysAgo(10),
		...overrides
	} as SessionSummary;
}

function writeSessionFile(sessionDir: string, sessionId: string, sizeBytes = 100): void {
	const filePath = path.join(sessionDir, `${sessionId}.json`);
	fs.writeFileSync(filePath, JSON.stringify({ session_id: sessionId }).padEnd(sizeBytes, ' '));
}

describe('SessionRetentionManager (real filesystem)', () => {
	let sessionDir: string;

	beforeEach(() => {
		sessionDir = mkdtempSync(path.join(tmpdir(), 'valora-session-retention-test-'));
	});

	afterEach(() => {
		rmSync(sessionDir, { force: true, recursive: true });
	});

	describe('analyzeSessionDirectory', () => {
		it('maps each session .json file to its matching SessionSummary by id, skipping unmatched files', async () => {
			writeSessionFile(sessionDir, 'sess-a');
			writeSessionFile(sessionDir, 'sess-orphan'); // no matching summary
			const summaries = [makeSession('sess-a')];
			const manager = new SessionRetentionManager({});

			const files = await manager.analyzeSessionDirectory(sessionDir, summaries);

			expect(files.map((f) => f.sessionId)).toEqual(['sess-a']);
		});

		it('excludes .snapshot.json files from the analysed set', async () => {
			writeSessionFile(sessionDir, 'sess-a');
			fs.writeFileSync(path.join(sessionDir, 'sess-a.snapshot.json'), '{}');
			const summaries = [makeSession('sess-a')];
			const manager = new SessionRetentionManager({});

			const files = await manager.analyzeSessionDirectory(sessionDir, summaries);

			expect(files).toHaveLength(1);
			expect(files[0]?.sessionId).toBe('sess-a');
		});

		it('sorts results by session updated_at, most recent first', async () => {
			writeSessionFile(sessionDir, 'sess-old');
			writeSessionFile(sessionDir, 'sess-new');
			const summaries = [
				makeSession('sess-old', { updated_at: isoDaysAgo(30) }),
				makeSession('sess-new', { updated_at: isoDaysAgo(1) })
			];
			const manager = new SessionRetentionManager({});

			const files = await manager.analyzeSessionDirectory(sessionDir, summaries);

			expect(files.map((f) => f.sessionId)).toEqual(['sess-new', 'sess-old']);
		});
	});

	describe('cleanup — age-based', () => {
		it('deletes sessions whose updated_at is older than maxAgeDays and keeps recent ones', async () => {
			writeSessionFile(sessionDir, 'sess-old');
			writeSessionFile(sessionDir, 'sess-recent');
			const summaries = [
				makeSession('sess-old', { updated_at: isoDaysAgo(60) }),
				makeSession('sess-recent', { updated_at: isoDaysAgo(1) })
			];
			const manager = new SessionRetentionManager({ maxAgeDays: 30 });

			const result = await manager.cleanup(sessionDir, summaries);

			expect(result.deletedSessions).toEqual(['sess-old']);
			expect(fs.existsSync(path.join(sessionDir, 'sess-old.json'))).toBe(false);
			expect(fs.existsSync(path.join(sessionDir, 'sess-recent.json'))).toBe(true);
		});

		it('also deletes the associated .snapshot.json file when deleting a session', async () => {
			writeSessionFile(sessionDir, 'sess-old');
			fs.writeFileSync(path.join(sessionDir, 'sess-old.snapshot.json'), '{}');
			const summaries = [makeSession('sess-old', { updated_at: isoDaysAgo(60) })];
			const manager = new SessionRetentionManager({ maxAgeDays: 30 });

			await manager.cleanup(sessionDir, summaries);

			expect(fs.existsSync(path.join(sessionDir, 'sess-old.snapshot.json'))).toBe(false);
		});

		it('does not delete anything in dry-run mode, but still reports what would be deleted', async () => {
			writeSessionFile(sessionDir, 'sess-old');
			const summaries = [makeSession('sess-old', { updated_at: isoDaysAgo(60) })];
			const manager = new SessionRetentionManager({ maxAgeDays: 30 }, true);

			const result = await manager.cleanup(sessionDir, summaries);

			expect(result.deletedSessions).toEqual(['sess-old']);
			expect(fs.existsSync(path.join(sessionDir, 'sess-old.json'))).toBe(true);
		});
	});

	describe('cleanup — size-based', () => {
		it('keeps the most recently updated sessions and deletes the oldest ones until total size is under maxSizeMB', async () => {
			// Regression test: applySizeBasedCleanup used to walk the
			// most-recent-first sorted list while shrinking a running total that
			// started at the *full* size, marking items for deletion from the
			// front (i.e. the newest) until the remainder fit under the cap —
			// backwards from the documented intent ("remove until under limit"
			// implies removing the oldest first) and from every other policy in
			// this class (age/count-based cleanup both keep recent, drop old).
			writeSessionFile(sessionDir, 'sess-oldest', 3 * MB);
			writeSessionFile(sessionDir, 'sess-middle', 3 * MB);
			writeSessionFile(sessionDir, 'sess-newest', 3 * MB);
			const summaries = [
				makeSession('sess-oldest', { updated_at: isoDaysAgo(30) }),
				makeSession('sess-middle', { updated_at: isoDaysAgo(15) }),
				makeSession('sess-newest', { updated_at: isoDaysAgo(1) })
			];
			const manager = new SessionRetentionManager({ maxSizeMB: 5 });

			const result = await manager.cleanup(sessionDir, summaries);

			expect(result.deletedSessions.sort()).toEqual(['sess-middle', 'sess-oldest']);
			expect(fs.existsSync(path.join(sessionDir, 'sess-newest.json'))).toBe(true);
			expect(fs.existsSync(path.join(sessionDir, 'sess-oldest.json'))).toBe(false);
		});

		it('deletes nothing when total size is already under maxSizeMB', async () => {
			writeSessionFile(sessionDir, 'sess-a', 100);
			const summaries = [makeSession('sess-a')];
			const manager = new SessionRetentionManager({ maxSizeMB: 5 });

			const result = await manager.cleanup(sessionDir, summaries);

			expect(result.deletedSessions).toEqual([]);
		});
	});

	describe('cleanup — count-based', () => {
		it('keeps only the maxCount most recently updated sessions', async () => {
			writeSessionFile(sessionDir, 'sess-1');
			writeSessionFile(sessionDir, 'sess-2');
			writeSessionFile(sessionDir, 'sess-3');
			const summaries = [
				makeSession('sess-1', { updated_at: isoDaysAgo(3) }),
				makeSession('sess-2', { updated_at: isoDaysAgo(2) }),
				makeSession('sess-3', { updated_at: isoDaysAgo(1) })
			];
			const manager = new SessionRetentionManager({ maxCount: 2 });

			const result = await manager.cleanup(sessionDir, summaries);

			expect(result.deletedSessions).toEqual(['sess-1']);
			expect(fs.existsSync(path.join(sessionDir, 'sess-2.json'))).toBe(true);
			expect(fs.existsSync(path.join(sessionDir, 'sess-3.json'))).toBe(true);
		});
	});

	describe('cleanup — compression', () => {
		it('compresses (and removes the original of) a session older than compressAfterDays', async () => {
			writeSessionFile(sessionDir, 'sess-old', 500);
			const summaries = [makeSession('sess-old', { updated_at: isoDaysAgo(30) })];
			const manager = new SessionRetentionManager({ compressAfterDays: 7 });

			const result = await manager.cleanup(sessionDir, summaries);

			expect(result.compressedSessions).toEqual(['sess-old']);
			expect(fs.existsSync(path.join(sessionDir, 'sess-old.json'))).toBe(false);
			expect(fs.existsSync(path.join(sessionDir, 'sess-old.json.gz'))).toBe(true);
		});

		it('does not re-compress a session file whose name already indicates compression', async () => {
			const compressedPath = path.join(sessionDir, 'sess-old.json.gz');
			fs.writeFileSync(compressedPath, 'gzip-content-placeholder');
			// isCompressed is derived from the filename ending in .json.gz — construct
			// the analysed file info directly to avoid depending on real gzip content.
			const manager = new SessionRetentionManager({ compressAfterDays: 7 });
			const summaries = [makeSession('sess-old', { updated_at: isoDaysAgo(30) })];

			// The real analyzeSessionDirectory() filter only picks up plain .json files
			// (not .json.gz), so a session already compressed on disk has no matching
			// file to re-compress — cleanup() should report nothing.
			const result = await manager.cleanup(sessionDir, summaries);

			expect(result.compressedSessions).toEqual([]);
		});
	});

	describe('cleanup — totalSizeBefore/After accounting', () => {
		it('reports accurate before/after total size across a mixed cleanup', async () => {
			writeSessionFile(sessionDir, 'sess-old', 1000);
			writeSessionFile(sessionDir, 'sess-recent', 500);
			const summaries = [
				makeSession('sess-old', { updated_at: isoDaysAgo(60) }),
				makeSession('sess-recent', { updated_at: isoDaysAgo(1) })
			];
			const manager = new SessionRetentionManager({ maxAgeDays: 30 });

			const result = await manager.cleanup(sessionDir, summaries);

			expect(result.totalSizeBefore).toBe(1500);
			expect(result.totalSizeAfter).toBe(500);
		});
	});

	describe('cleanup — error handling', () => {
		it('records an error and continues when the session directory does not exist', async () => {
			const manager = new SessionRetentionManager({ maxAgeDays: 30 });

			const result = await manager.cleanup('/nonexistent/valora-sessions-dir', []);

			expect(result.errors.length).toBeGreaterThan(0);
			expect(result.deletedSessions).toEqual([]);
		});
	});
});
