import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('output/logger', () => ({
	getLogger: () => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() })
}));

import type { MCPApprovalResult } from 'types/mcp-client.types';

import { MCPApprovalCacheService } from './mcp-approval-cache.service';

const SESSION_EXPIRY_MS = 8 * 60 * 60 * 1000;
const PERSISTENT_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

function makeResult(overrides: Partial<MCPApprovalResult> = {}): MCPApprovalResult {
	return { approved: true, decision: 'approve', remember: true, timestamp: new Date(), ...overrides };
}

describe('MCPApprovalCacheService', () => {
	let tmpDir: string;
	let cachePath: string;
	let service: MCPApprovalCacheService;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), 'valora-mcp-approval-cache-'));
		cachePath = join(tmpDir, '.mcp-approvals.json');
		service = new MCPApprovalCacheService(cachePath);
	});

	afterEach(() => {
		vi.useRealTimers();
		rmSync(tmpDir, { force: true, recursive: true });
	});

	describe('memory-type routing', () => {
		it('does not cache anything for "always_ask"', async () => {
			await service.cacheApproval('server-1', makeResult(), 'always_ask');

			expect(service.isApproved('server-1')).toBe(false);
			expect(existsSync(cachePath)).toBe(false);
		});

		it('caches "session" in memory only, without writing to disk', async () => {
			await service.cacheApproval('server-1', makeResult(), 'session');

			expect(service.isApproved('server-1')).toBe(true);
			expect(existsSync(cachePath)).toBe(false);
		});

		it('caches "persistent" both in memory and on disk', async () => {
			await service.cacheApproval('server-1', makeResult(), 'persistent');

			expect(service.isApproved('server-1')).toBe(true);
			expect(existsSync(cachePath)).toBe(true);
			const saved = JSON.parse(readFileSync(cachePath, 'utf8')) as { entries: Array<{ serverId: string }> };
			expect(saved.entries.map((e) => e.serverId)).toContain('server-1');
		});
	});

	describe('calculateExpiry (observed via getApproval().expiresAt)', () => {
		it('sets a session entry to expire exactly 8 hours from now', async () => {
			vi.useFakeTimers();
			const now = new Date('2026-01-01T00:00:00.000Z');
			vi.setSystemTime(now);

			await service.cacheApproval('server-1', makeResult(), 'session');

			const entry = service.getApproval('server-1');
			expect(entry?.expiresAt?.getTime()).toBe(now.getTime() + SESSION_EXPIRY_MS);
		});

		it('sets a persistent entry to expire exactly 30 days from now', async () => {
			vi.useFakeTimers();
			const now = new Date('2026-01-01T00:00:00.000Z');
			vi.setSystemTime(now);

			await service.cacheApproval('server-1', makeResult(), 'persistent');

			const entry = service.getApproval('server-1');
			expect(entry?.expiresAt?.getTime()).toBe(now.getTime() + PERSISTENT_EXPIRY_MS);
		});
	});

	describe('expiry enforcement', () => {
		it('treats a session approval as expired once 8 hours have elapsed', async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
			await service.cacheApproval('server-1', makeResult(), 'session');
			expect(service.isApproved('server-1')).toBe(true);

			vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z').getTime() + SESSION_EXPIRY_MS + 1);

			expect(service.isApproved('server-1')).toBe(false);
			expect(service.getApproval('server-1')).toBeNull();
		});

		it('still honours a session approval a moment before it expires', async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
			await service.cacheApproval('server-1', makeResult(), 'session');

			vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z').getTime() + SESSION_EXPIRY_MS - 1);

			expect(service.isApproved('server-1')).toBe(true);
		});

		it('treats a persistent approval as expired once 30 days have elapsed', async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
			await service.cacheApproval('server-1', makeResult(), 'persistent');
			expect(service.isApproved('server-1')).toBe(true);

			vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z').getTime() + PERSISTENT_EXPIRY_MS + 1);

			expect(service.isApproved('server-1')).toBe(false);
		});
	});

	describe('getAllowedTools', () => {
		it('returns the tools recorded on the cached approval', async () => {
			await service.cacheApproval(
				'server-1',
				makeResult({ allowedTools: ['tool_a', 'tool_b'], decision: 'configure' }),
				'session'
			);

			expect(service.getAllowedTools('server-1')).toEqual(['tool_a', 'tool_b']);
		});

		it('returns null when there is no cached approval', () => {
			expect(service.getAllowedTools('unknown-server')).toBeNull();
		});
	});

	describe('loadPersistentCache', () => {
		it('loads previously persisted, still-valid entries from disk', async () => {
			await service.cacheApproval('server-1', makeResult(), 'persistent');

			const freshService = new MCPApprovalCacheService(cachePath);
			await freshService.loadPersistentCache();

			expect(freshService.isApproved('server-1')).toBe(true);
		});

		it('does not load an entry from disk whose expiresAt is already in the past', async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
			await service.cacheApproval('server-1', makeResult(), 'persistent');

			vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z').getTime() + PERSISTENT_EXPIRY_MS + 1);
			vi.useRealTimers();

			const freshService = new MCPApprovalCacheService(cachePath);
			await freshService.loadPersistentCache();

			expect(freshService.isApproved('server-1')).toBe(false);
			expect(freshService.getApproval('server-1')).toBeNull();
		});

		it('is a no-op on a second call (does not re-read the file)', async () => {
			await service.cacheApproval('server-1', makeResult(), 'persistent');
			const freshService = new MCPApprovalCacheService(cachePath);
			await freshService.loadPersistentCache();

			// Mutate the file on disk directly, then load again — a second
			// loadPersistentCache() call must be a no-op given persistentCacheLoaded.
			rmSync(cachePath);
			await freshService.loadPersistentCache();

			expect(freshService.isApproved('server-1')).toBe(true);
		});

		it('resolves without throwing when no cache file exists yet', async () => {
			const freshService = new MCPApprovalCacheService(join(tmpDir, 'never-created.json'));

			await expect(freshService.loadPersistentCache()).resolves.toBeUndefined();
			expect(freshService.isApproved('anything')).toBe(false);
		});

		it('resolves without throwing when the cache file contains malformed JSON', async () => {
			const { writeFileSync, mkdirSync } = await import('fs');
			mkdirSync(tmpDir, { recursive: true });
			writeFileSync(cachePath, '{ not valid json', 'utf8');

			await expect(service.loadPersistentCache()).resolves.toBeUndefined();
			expect(service.isApproved('anything')).toBe(false);
		});
	});

	describe('revokeApproval', () => {
		it('removes a server from both session and persistent caches, and persists the removal', async () => {
			await service.cacheApproval('server-1', makeResult(), 'session');
			await service.cacheApproval('server-1', makeResult(), 'persistent');

			await service.revokeApproval('server-1');

			expect(service.isApproved('server-1')).toBe(false);
			const saved = JSON.parse(readFileSync(cachePath, 'utf8')) as { entries: unknown[] };
			expect(saved.entries).toHaveLength(0);
		});
	});

	describe('clearSessionApprovals / clearAllApprovals', () => {
		it('clearSessionApprovals only removes session-cached approvals, leaving persistent ones intact', async () => {
			await service.cacheApproval('session-server', makeResult(), 'session');
			await service.cacheApproval('persistent-server', makeResult(), 'persistent');

			service.clearSessionApprovals();

			expect(service.isApproved('session-server')).toBe(false);
			expect(service.isApproved('persistent-server')).toBe(true);
		});

		it('clearAllApprovals removes both session and persistent approvals', async () => {
			await service.cacheApproval('session-server', makeResult(), 'session');
			await service.cacheApproval('persistent-server', makeResult(), 'persistent');

			await service.clearAllApprovals();

			expect(service.isApproved('session-server')).toBe(false);
			expect(service.isApproved('persistent-server')).toBe(false);
		});
	});

	describe('getStats', () => {
		it('reports accurate counts per cache', async () => {
			await service.cacheApproval('s1', makeResult(), 'session');
			await service.cacheApproval('p1', makeResult(), 'persistent');
			await service.cacheApproval('p2', makeResult(), 'persistent');

			expect(service.getStats()).toEqual({ persistentCount: 2, sessionCount: 1 });
		});
	});
});
