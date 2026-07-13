import * as fs from 'fs';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RetentionManager } from './retention-manager';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MB = 1024 * 1024;

function writeLogFile(dir: string, name: string, opts: { ageDays?: number; sizeBytes?: number } = {}): string {
	const filePath = path.join(dir, name);
	const line = `${JSON.stringify({ level: 'info', message: 'test log line' })}\n`;
	const content = opts.sizeBytes ? line.padEnd(opts.sizeBytes, ' ') : line;
	fs.writeFileSync(filePath, content);
	if (opts.ageDays !== undefined) {
		const mtime = new Date(Date.now() - opts.ageDays * MS_PER_DAY);
		fs.utimesSync(filePath, mtime, mtime);
	}
	return filePath;
}

function dateDaysAgo(days: number): string {
	return new Date(Date.now() - days * MS_PER_DAY).toISOString().split('T')[0]!;
}

describe('RetentionManager.analyzeDirectory', () => {
	it('returns an empty list when the log directory does not exist', async () => {
		const manager = new RetentionManager({ maxAgeDays: 30 });
		const result = await manager.analyzeDirectory('/nonexistent/valora-logs-that-cannot-exist');
		expect(result).toEqual([]);
	});
});

describe('RetentionManager.cleanup (real filesystem)', () => {
	let logDir: string;

	beforeEach(() => {
		logDir = mkdtempSync(path.join(tmpdir(), 'valora-retention-test-'));
	});

	afterEach(() => {
		rmSync(logDir, { force: true, recursive: true });
	});

	describe('age-based cleanup', () => {
		it('deletes a non-daily-named file older than maxAgeDays and keeps a recent one', async () => {
			writeLogFile(logDir, 'old-legacy.log', { ageDays: 40 });
			writeLogFile(logDir, 'recent-legacy.log', { ageDays: 5 });
			const manager = new RetentionManager({ maxAgeDays: 30 });

			const result = await manager.cleanup(logDir);

			expect(result.deletedFiles).toEqual(['old-legacy.log']);
			expect(fs.existsSync(path.join(logDir, 'old-legacy.log'))).toBe(false);
			expect(fs.existsSync(path.join(logDir, 'recent-legacy.log'))).toBe(true);
		});

		it("deletes every file in an old daily-rotated set together, and keeps today's set", async () => {
			const oldDate = dateDaysAgo(40);
			const today = dateDaysAgo(0);
			writeLogFile(logDir, `ai-${oldDate}.log`, { ageDays: 40 });
			writeLogFile(logDir, `ai-${oldDate}.1.log`, { ageDays: 40 });
			writeLogFile(logDir, `ai-${today}.log`, { ageDays: 0 });
			const manager = new RetentionManager({ maxAgeDays: 30 });

			const result = await manager.cleanup(logDir);

			expect(result.deletedFiles.sort()).toEqual([`ai-${oldDate}.1.log`, `ai-${oldDate}.log`].sort());
			expect(fs.existsSync(path.join(logDir, `ai-${today}.log`))).toBe(true);
		});

		it('does not double-process a non-daily-named file through both the daily and non-daily grouping paths', async () => {
			// groupFilesByDate() falls back to a file's modification-time date when
			// its name doesn't match the ai-YYYY-MM-DD pattern — every non-daily file
			// previously landed in BOTH the daily-grouped bucket (via that fallback)
			// AND the separately-filtered non-daily bucket, so it was independently
			// evaluated (and, for old files, unlinked) by both code paths.
			const oldPath = writeLogFile(logDir, 'old-legacy.log', { ageDays: 40 });
			const recentPath = writeLogFile(logDir, 'recent-legacy.log', { ageDays: 1 });
			const oldSize = fs.statSync(oldPath).size;
			const recentSize = fs.statSync(recentPath).size;
			const manager = new RetentionManager({ maxAgeDays: 30 });

			const result = await manager.cleanup(logDir);

			expect(result.deletedFiles).toEqual(['old-legacy.log']);
			expect(result.errors).toEqual([]);
			expect(result.totalSizeBefore).toBe(oldSize + recentSize);
			// A duplicated toKeep entry would double-count recent-legacy.log's size here.
			expect(result.totalSizeAfter).toBe(recentSize);
		});
	});

	describe('count-based cleanup', () => {
		it('deletes only the oldest files beyond maxFiles, keeping the newest N', async () => {
			writeLogFile(logDir, 'log-a.log', { ageDays: 10 });
			writeLogFile(logDir, 'log-b.log', { ageDays: 9 });
			writeLogFile(logDir, 'log-c.log', { ageDays: 8 });
			writeLogFile(logDir, 'log-d.log', { ageDays: 7 });
			writeLogFile(logDir, 'log-e.log', { ageDays: 6 });
			const manager = new RetentionManager({ maxFiles: 3 });

			const result = await manager.cleanup(logDir);

			expect(result.deletedFiles.sort()).toEqual(['log-a.log', 'log-b.log'].sort());
			expect(fs.existsSync(path.join(logDir, 'log-c.log'))).toBe(true);
			expect(fs.existsSync(path.join(logDir, 'log-d.log'))).toBe(true);
			expect(fs.existsSync(path.join(logDir, 'log-e.log'))).toBe(true);
		});

		it('deletes nothing when the file count is already at or below maxFiles', async () => {
			writeLogFile(logDir, 'log-a.log', { ageDays: 2 });
			writeLogFile(logDir, 'log-b.log', { ageDays: 1 });
			const manager = new RetentionManager({ maxFiles: 5 });

			const result = await manager.cleanup(logDir);

			expect(result.deletedFiles).toEqual([]);
		});
	});

	describe('size-based cleanup', () => {
		it('deletes the oldest files until total size is under maxSizeMB', async () => {
			writeLogFile(logDir, 'big-old.log', { ageDays: 5, sizeBytes: 3 * MB });
			writeLogFile(logDir, 'big-new.log', { ageDays: 1, sizeBytes: 3 * MB });
			const manager = new RetentionManager({ maxSizeMB: 4 });

			const result = await manager.cleanup(logDir);

			expect(result.deletedFiles).toEqual(['big-old.log']);
			expect(fs.existsSync(path.join(logDir, 'big-new.log'))).toBe(true);
		});

		it('deletes nothing when already under the size budget', async () => {
			writeLogFile(logDir, 'small.log', { ageDays: 1, sizeBytes: 1024 });
			const manager = new RetentionManager({ maxSizeMB: 10 });

			const result = await manager.cleanup(logDir);

			expect(result.deletedFiles).toEqual([]);
		});
	});

	describe('empty/corrupted file cleanup', () => {
		it('deletes a zero-byte log file regardless of any other policy', async () => {
			fs.writeFileSync(path.join(logDir, 'empty.log'), '');
			const manager = new RetentionManager({});

			const result = await manager.cleanup(logDir);

			expect(result.deletedFiles).toContain('empty.log');
		});

		it('deletes a log file whose lines are mostly invalid JSON (corrupted)', async () => {
			// Corruption requires at least one valid line alongside more invalid than
			// valid ones (see checkupEmptyFiles's `validLines > 0 && invalidLines > validLines`)
			// — all-garbage content with zero valid lines does not trigger this check.
			fs.writeFileSync(
				path.join(logDir, 'corrupted.log'),
				`${JSON.stringify({ ok: true })}\nnot json\nalso not json\n`
			);
			const manager = new RetentionManager({});

			const result = await manager.cleanup(logDir);

			expect(result.deletedFiles).toContain('corrupted.log');
		});

		it('keeps a valid log file whose lines are all valid JSON', async () => {
			writeLogFile(logDir, 'valid.log');
			const manager = new RetentionManager({});

			const result = await manager.cleanup(logDir);

			expect(result.deletedFiles).not.toContain('valid.log');
		});
	});

	describe('compression policy', () => {
		it('compresses an old daily log set into .gz and removes the original', async () => {
			const oldDate = dateDaysAgo(20);
			writeLogFile(logDir, `ai-${oldDate}.log`, { ageDays: 20 });
			const manager = new RetentionManager({ compressAfterDays: 10 });

			const result = await manager.cleanup(logDir);

			expect(result.compressedFiles).toEqual([`ai-${oldDate}.log`]);
			expect(fs.existsSync(path.join(logDir, `ai-${oldDate}.log`))).toBe(false);
			expect(fs.existsSync(path.join(logDir, `ai-${oldDate}.log.gz`))).toBe(true);
		});

		it("never compresses today's daily log, even if it matches the cutoff window", async () => {
			const today = dateDaysAgo(0);
			writeLogFile(logDir, `ai-${today}.log`, { ageDays: 0 });
			const manager = new RetentionManager({ compressAfterDays: 0 });

			const result = await manager.cleanup(logDir);

			expect(result.compressedFiles).toEqual([]);
			expect(fs.existsSync(path.join(logDir, `ai-${today}.log`))).toBe(true);
		});
	});

	it('reports totalSizeBefore/totalSizeAfter reflecting what was actually deleted', async () => {
		writeLogFile(logDir, 'old.log', { ageDays: 40, sizeBytes: 1000 });
		writeLogFile(logDir, 'new.log', { ageDays: 1, sizeBytes: 500 });
		const manager = new RetentionManager({ maxAgeDays: 30 });

		const result = await manager.cleanup(logDir);

		expect(result.totalSizeBefore).toBe(1500);
		expect(result.totalSizeAfter).toBe(500);
	});
});
