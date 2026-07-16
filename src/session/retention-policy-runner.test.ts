import * as fs from 'fs';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Config } from 'config/schema';
import type { SessionSummary } from 'types/session.types';

let sessionsRoot: string;
vi.mock('utils/paths', async (importOriginal) => {
	const actual = await importOriginal<typeof import('utils/paths')>();
	return { ...actual, getRuntimeDataDir: () => sessionsRoot };
});

let mockConfig: Partial<Config>;
let mockLoad: () => Promise<Partial<Config>>;
vi.mock('config/loader', () => ({
	getConfigLoader: () => ({
		load: async () => mockLoad()
	})
}));

import { runAutomaticCleanupIfNeeded, runRetentionPolicy, shouldRunAutomaticCleanup } from './retention-policy-runner';

function isoDaysAgo(days: number): string {
	return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function writeSessionFile(sessionsDir: string, sessionId: string, updatedAt: string, sizeBytes = 100): void {
	const filePath = path.join(sessionsDir, `${sessionId}.json`);
	const content: SessionSummary & Record<string, unknown> = {
		command_count: 0,
		created_at: updatedAt,
		last_active: updatedAt,
		session_id: sessionId,
		size_bytes: sizeBytes,
		status: 'completed',
		updated_at: updatedAt
	};
	fs.writeFileSync(filePath, JSON.stringify(content).padEnd(sizeBytes, ' '));
}

describe('retention-policy-runner (real session store)', () => {
	let tmpDir: string;
	let sessionsDir: string;

	beforeEach(() => {
		tmpDir = mkdtempSync(path.join(tmpdir(), 'valora-retention-policy-runner-'));
		sessionsRoot = tmpDir;
		sessionsDir = path.join(tmpDir, 'sessions');
		fs.mkdirSync(sessionsDir, { recursive: true });
		mockConfig = {};
		mockLoad = async () => mockConfig;
	});

	afterEach(() => {
		rmSync(tmpDir, { force: true, recursive: true });
	});

	describe('runRetentionPolicy', () => {
		it('deletes sessions older than the configured max_age_days', async () => {
			writeSessionFile(sessionsDir, 'sess-old', isoDaysAgo(60));
			writeSessionFile(sessionsDir, 'sess-recent', isoDaysAgo(1));
			mockConfig = { sessions: { max_age_days: 30 } as Config['sessions'] };

			const result = await runRetentionPolicy();

			expect(result.deletedSessions).toEqual(['sess-old']);
			expect(fs.existsSync(path.join(sessionsDir, 'sess-old.json'))).toBe(false);
			expect(fs.existsSync(path.join(sessionsDir, 'sess-recent.json'))).toBe(true);
		});

		it('reports what would be deleted without deleting when dryRun is true', async () => {
			writeSessionFile(sessionsDir, 'sess-old', isoDaysAgo(60));
			mockConfig = { sessions: { max_age_days: 30 } as Config['sessions'] };

			const result = await runRetentionPolicy(true);

			expect(result.deletedSessions).toEqual(['sess-old']);
			expect(fs.existsSync(path.join(sessionsDir, 'sess-old.json'))).toBe(true);
		});
	});

	describe('shouldRunAutomaticCleanup', () => {
		it('returns false when session retention is disabled in config', async () => {
			mockConfig = { sessions: { enabled: false } as Config['sessions'] };

			await expect(shouldRunAutomaticCleanup()).resolves.toBe(false);
		});

		it('returns true when the session count exceeds max_count', async () => {
			writeSessionFile(sessionsDir, 'sess-1', isoDaysAgo(1));
			writeSessionFile(sessionsDir, 'sess-2', isoDaysAgo(1));
			mockConfig = { sessions: { enabled: true, max_count: 1 } as Config['sessions'] };

			await expect(shouldRunAutomaticCleanup()).resolves.toBe(true);
		});

		it('returns true when total session size exceeds max_size_mb', async () => {
			writeSessionFile(sessionsDir, 'sess-1', isoDaysAgo(1), 2 * 1024 * 1024);
			mockConfig = { sessions: { enabled: true, max_size_mb: 1 } as Config['sessions'] };

			await expect(shouldRunAutomaticCleanup()).resolves.toBe(true);
		});

		it('returns true when a session is older than max_age_days', async () => {
			writeSessionFile(sessionsDir, 'sess-old', isoDaysAgo(60));
			mockConfig = { sessions: { enabled: true, max_age_days: 30 } as Config['sessions'] };

			await expect(shouldRunAutomaticCleanup()).resolves.toBe(true);
		});

		it('returns false when no limits are exceeded', async () => {
			writeSessionFile(sessionsDir, 'sess-1', isoDaysAgo(1));
			mockConfig = {
				sessions: { enabled: true, max_age_days: 30, max_count: 10, max_size_mb: 100 } as Config['sessions']
			};

			await expect(shouldRunAutomaticCleanup()).resolves.toBe(false);
		});
	});

	describe('runAutomaticCleanupIfNeeded', () => {
		it('does nothing when cleanup is not needed', async () => {
			writeSessionFile(sessionsDir, 'sess-1', isoDaysAgo(1));
			mockConfig = {
				sessions: { enabled: true, max_age_days: 30, max_count: 10, max_size_mb: 100 } as Config['sessions']
			};

			await runAutomaticCleanupIfNeeded();

			expect(fs.existsSync(path.join(sessionsDir, 'sess-1.json'))).toBe(true);
		});

		it('actually deletes sessions when limits are exceeded', async () => {
			writeSessionFile(sessionsDir, 'sess-old', isoDaysAgo(60));
			mockConfig = { sessions: { enabled: true, max_age_days: 30 } as Config['sessions'] };

			await runAutomaticCleanupIfNeeded();

			expect(fs.existsSync(path.join(sessionsDir, 'sess-old.json'))).toBe(false);
		});

		it('does not throw when config loading fails', async () => {
			mockLoad = async () => {
				throw new Error('config load failed');
			};

			await expect(runAutomaticCleanupIfNeeded()).resolves.toBeUndefined();
		});
	});
});
