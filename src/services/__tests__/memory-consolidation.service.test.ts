/**
 * Tests for MemoryConsolidationService
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MemoryEntry } from 'types/memory.types';

// Mock the MemoryManager and MemoryStore
vi.mock('memory/manager');
vi.mock('memory/store');
vi.mock('utils/safe-exec');
vi.mock('output/pipeline-emitter', () => ({
	getPipelineEmitter: () => ({
		emitConsolidationComplete: vi.fn()
	})
}));
vi.mock('output/logger', () => ({
	getLogger: () => ({
		debug: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warn: vi.fn()
	})
}));

import { MemoryManager } from 'memory/manager';
import { MemoryStore } from 'memory/store';
import { SafeExecutor } from 'utils/safe-exec';

import {
	getMemoryConsolidation,
	MemoryConsolidationService,
	resetMemoryConsolidation
} from '../memory-consolidation.service';

const MockMemoryManager = vi.mocked(MemoryManager);
const MockMemoryStore = vi.mocked(MemoryStore);
const MockSafeExecutor = vi.mocked(SafeExecutor);

/** Build a minimal MemoryEntry for testing. */
function makeEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
	return {
		id: 'mem-test-001',
		category: 'episodic',
		content: 'Test memory content',
		tags: ['testing'],
		source: { command: 'test' },
		confidence: 'observed',
		halfLifeDays: 7,
		createdAt: new Date().toISOString(),
		lastAccessedAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		accessCount: 0,
		agentRole: 'lead',
		sessionId: 'sess-001',
		relatedPaths: [],
		isError: false,
		...overrides
	};
}

describe('MemoryConsolidationService', () => {
	let mockManagerInstance: {
		prune: ReturnType<typeof vi.fn>;
		invalidateByPaths: ReturnType<typeof vi.fn>;
		markStaleByPaths: ReturnType<typeof vi.fn>;
		promote: ReturnType<typeof vi.fn>;
		delete: ReturnType<typeof vi.fn>;
		update: ReturnType<typeof vi.fn>;
		flush: ReturnType<typeof vi.fn>;
	};
	let mockStoreInstance: {
		getMetadata: ReturnType<typeof vi.fn>;
		getEntries: ReturnType<typeof vi.fn>;
		setLastConsolidatedAt: ReturnType<typeof vi.fn>;
		flush: ReturnType<typeof vi.fn>;
	};

	beforeEach(() => {
		vi.clearAllMocks();

		mockStoreInstance = {
			getMetadata: vi.fn().mockResolvedValue({ version: 1, lastWrittenAt: new Date().toISOString() }),
			getEntries: vi.fn().mockResolvedValue([]),
			setLastConsolidatedAt: vi.fn().mockResolvedValue(undefined),
			flush: vi.fn().mockResolvedValue(undefined)
		};

		mockManagerInstance = {
			prune: vi.fn().mockResolvedValue(3),
			invalidateByPaths: vi.fn().mockResolvedValue(0),
			markStaleByPaths: vi.fn().mockResolvedValue(0),
			promote: vi.fn().mockResolvedValue(makeEntry({ category: 'semantic' })),
			delete: vi.fn().mockResolvedValue(true),
			update: vi.fn().mockResolvedValue(true),
			flush: vi.fn().mockResolvedValue(undefined)
		};

		// Make constructors return our mock instances
		MockMemoryStore.mockImplementation(() => mockStoreInstance as unknown as MemoryStore);
		MockMemoryManager.mockImplementation(() => mockManagerInstance as unknown as MemoryManager);

		// Default: git returns empty output
		MockSafeExecutor.executeGit = vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });

		resetMemoryConsolidation();
	});

	afterEach(() => {
		resetMemoryConsolidation();
	});

	// ------------------------------------------------------------------ 1
	describe('consolidate()', () => {
		it('calls manager.prune() and returns the pruned count', async () => {
			mockManagerInstance.prune.mockResolvedValue(5);

			const service = new MemoryConsolidationService();
			const result = await service.consolidate();

			expect(mockManagerInstance.prune).toHaveBeenCalledOnce();
			expect(result.pruned).toBe(5);
		});
	});

	// ------------------------------------------------------------------ 2
	describe('consolidate({ pruneOnly: true })', () => {
		it('skips merge and promote steps when pruneOnly is true', async () => {
			// Provide entries that would trigger merge/promote if not skipped
			const highAccessVerified = makeEntry({
				id: 'mem-a',
				accessCount: 10,
				confidence: 'verified',
				tags: ['perf', 'caching']
			});
			mockStoreInstance.getEntries.mockResolvedValue([highAccessVerified]);

			const service = new MemoryConsolidationService();
			const result = await service.consolidate({ pruneOnly: true });

			expect(mockManagerInstance.promote).not.toHaveBeenCalled();
			expect(result.merged).toBe(0);
			expect(result.promoted).toBe(0);
		});
	});

	// ------------------------------------------------------------------ 3
	describe('consolidate({ dryRun: true })', () => {
		it('does NOT call store.setLastConsolidatedAt() in dry run mode', async () => {
			const service = new MemoryConsolidationService();
			await service.consolidate({ dryRun: true });

			expect(mockStoreInstance.setLastConsolidatedAt).not.toHaveBeenCalled();
		});

		it('does NOT call manager.prune() in dry run mode', async () => {
			const service = new MemoryConsolidationService();
			await service.consolidate({ dryRun: true });

			expect(mockManagerInstance.prune).not.toHaveBeenCalled();
		});
	});

	// ------------------------------------------------------------------ 4
	describe('Git invalidation', () => {
		it('calls invalidateByPaths with changed files from git log output', async () => {
			const gitOutput = [
				'COMMIT:abc123 fix: update auth module',
				'src/auth/login.ts',
				'src/auth/token.ts',
				'',
				'COMMIT:def456 refactor: move helpers',
				'src/utils/helpers.ts'
			].join('\n');

			MockSafeExecutor.executeGit = vi.fn().mockResolvedValue({ exitCode: 0, stdout: gitOutput, stderr: '' });

			const service = new MemoryConsolidationService();
			await service.consolidate();

			expect(mockManagerInstance.invalidateByPaths).toHaveBeenCalledWith(
				expect.arrayContaining(['src/auth/login.ts', 'src/auth/token.ts', 'src/utils/helpers.ts'])
			);
		});

		it('uses lastConsolidatedAt from store metadata as the --since value', async () => {
			const lastConsolidated = '2026-04-01T00:00:00.000Z';
			mockStoreInstance.getMetadata.mockResolvedValue({
				version: 1,
				lastWrittenAt: new Date().toISOString(),
				lastConsolidatedAt: lastConsolidated
			});

			const service = new MemoryConsolidationService();
			await service.consolidate();

			expect(MockSafeExecutor.executeGit).toHaveBeenCalledWith(expect.arrayContaining([`--since=${lastConsolidated}`]));
		});

		it('uses 7-day fallback when no lastConsolidatedAt is set', async () => {
			mockStoreInstance.getMetadata.mockResolvedValue({
				version: 1,
				lastWrittenAt: new Date().toISOString()
				// no lastConsolidatedAt
			});

			const service = new MemoryConsolidationService();
			await service.consolidate();

			// The --since arg should be roughly 7 days ago — just verify it's an ISO string
			const callArgs = (MockSafeExecutor.executeGit as ReturnType<typeof vi.fn>).mock.calls[0][0] as string[];
			const sinceArg = callArgs.find((a: string) => a.startsWith('--since='));
			expect(sinceArg).toBeDefined();
			const sinceDate = new Date(sinceArg!.replace('--since=', ''));
			const ageMs = Date.now() - sinceDate.getTime();
			const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
			// Allow ±5 seconds tolerance
			expect(ageMs).toBeGreaterThan(sevenDaysMs - 5000);
			expect(ageMs).toBeLessThan(sevenDaysMs + 5000);
		});

		it('returns zero gitInvalidated when git command fails', async () => {
			MockSafeExecutor.executeGit = vi.fn().mockRejectedValue(new Error('not a git repo'));

			const service = new MemoryConsolidationService();
			const result = await service.consolidate();

			expect(result.gitInvalidated).toBe(0);
			expect(result.staleMarked).toBe(0);
		});
	});

	// ------------------------------------------------------------------ 5
	describe('Git invalidation — stale marking', () => {
		it.each([
			['revert: remove old feature', 'revert'],
			['remove deprecated endpoint', 'remove'],
			['delete unused files', 'delete'],
			['migrate from legacy system', 'migrate from']
		])('marks stale for commit message "%s"', async (message) => {
			const gitOutput = [`COMMIT:aaa111 ${message}`, 'src/legacy/old-module.ts'].join('\n');

			MockSafeExecutor.executeGit = vi.fn().mockResolvedValue({ exitCode: 0, stdout: gitOutput, stderr: '' });
			mockManagerInstance.markStaleByPaths.mockResolvedValue(2);

			const service = new MemoryConsolidationService();
			const result = await service.consolidate();

			expect(mockManagerInstance.markStaleByPaths).toHaveBeenCalledWith(
				expect.arrayContaining(['src/legacy/old-module.ts'])
			);
			expect(result.staleMarked).toBe(2);
		});

		it('does NOT mark stale for normal commit messages', async () => {
			const gitOutput = ['COMMIT:bbb222 feat: add new endpoint', 'src/api/new-endpoint.ts'].join('\n');

			MockSafeExecutor.executeGit = vi.fn().mockResolvedValue({ exitCode: 0, stdout: gitOutput, stderr: '' });

			const service = new MemoryConsolidationService();
			const result = await service.consolidate();

			expect(mockManagerInstance.markStaleByPaths).not.toHaveBeenCalled();
			expect(result.staleMarked).toBe(0);
		});
	});

	// ------------------------------------------------------------------ 6
	describe('Merge step — episodic entries with Jaccard >= 0.6', () => {
		it('merges similar entries via manager.promote() and deletes the rest', async () => {
			const entryA = makeEntry({
				id: 'mem-merge-a',
				tags: ['auth', 'jwt', 'security'],
				content: 'JWT token validation approach'
			});
			const entryB = makeEntry({
				id: 'mem-merge-b',
				tags: ['auth', 'jwt', 'middleware'],
				content: 'JWT middleware setup'
			});

			// Jaccard(['auth','jwt','security'], ['auth','jwt','middleware']) = 2/4 = 0.5 — below 0.6
			// Let's use tags with 3/4 overlap = 0.75
			entryB.tags = ['auth', 'jwt', 'security', 'middleware'];

			mockStoreInstance.getEntries.mockResolvedValue([entryA, entryB]);

			const service = new MemoryConsolidationService();
			const result = await service.consolidate();

			expect(mockManagerInstance.promote).toHaveBeenCalledWith(
				entryA.id,
				expect.stringContaining('JWT token validation approach'),
				expect.arrayContaining(['auth', 'jwt', 'security', 'middleware'])
			);
			expect(mockManagerInstance.delete).toHaveBeenCalledWith('episodic', entryB.id);
			expect(result.merged).toBe(1);
		});

		it('does NOT merge entries with Jaccard < 0.6', async () => {
			const entryA = makeEntry({
				id: 'mem-no-merge-a',
				tags: ['auth', 'jwt'],
				content: 'JWT notes'
			});
			const entryB = makeEntry({
				id: 'mem-no-merge-b',
				tags: ['database', 'postgres'],
				content: 'Database notes'
			});

			mockStoreInstance.getEntries.mockResolvedValue([entryA, entryB]);

			const service = new MemoryConsolidationService();
			const result = await service.consolidate();

			// promote is only called from merge, not from auto-promote (accessCount=0)
			expect(mockManagerInstance.promote).not.toHaveBeenCalled();
			expect(result.merged).toBe(0);
		});
	});

	// ------------------------------------------------------------------ 7
	describe('Auto-promote step', () => {
		it('promotes entries with accessCount >= 5 and confidence === "verified"', async () => {
			const highValueEntry = makeEntry({
				id: 'mem-promote-001',
				accessCount: 7,
				confidence: 'verified',
				content: 'Proven architectural pattern',
				tags: ['architecture', 'patterns']
			});
			mockStoreInstance.getEntries.mockResolvedValue([highValueEntry]);

			const service = new MemoryConsolidationService();
			const result = await service.consolidate();

			expect(mockManagerInstance.promote).toHaveBeenCalledWith(
				highValueEntry.id,
				highValueEntry.content,
				highValueEntry.tags
			);
			expect(result.promoted).toBe(1);
		});

		it('does NOT promote entries with accessCount < 5', async () => {
			const lowAccessEntry = makeEntry({
				id: 'mem-no-promote-001',
				accessCount: 3,
				confidence: 'verified'
			});
			mockStoreInstance.getEntries.mockResolvedValue([lowAccessEntry]);

			const service = new MemoryConsolidationService();
			const result = await service.consolidate();

			expect(mockManagerInstance.promote).not.toHaveBeenCalled();
			expect(result.promoted).toBe(0);
		});

		it('does NOT promote entries with confidence !== "verified"', async () => {
			const unverifiedEntry = makeEntry({
				id: 'mem-no-promote-002',
				accessCount: 10,
				confidence: 'observed'
			});
			mockStoreInstance.getEntries.mockResolvedValue([unverifiedEntry]);

			const service = new MemoryConsolidationService();
			const result = await service.consolidate();

			expect(mockManagerInstance.promote).not.toHaveBeenCalled();
			expect(result.promoted).toBe(0);
		});

		it('does NOT promote entries that are already superseded', async () => {
			const supersededEntry = makeEntry({
				id: 'mem-no-promote-003',
				accessCount: 8,
				confidence: 'verified',
				supersededBy: 'mem-newer-001'
			});
			mockStoreInstance.getEntries.mockResolvedValue([supersededEntry]);

			const service = new MemoryConsolidationService();
			const result = await service.consolidate();

			expect(mockManagerInstance.promote).not.toHaveBeenCalled();
			expect(result.promoted).toBe(0);
		});
	});

	// ------------------------------------------------------------------ 8
	describe('ConsolidationResult shape', () => {
		it('returns a result with all expected fields', async () => {
			mockManagerInstance.prune.mockResolvedValue(2);
			mockManagerInstance.invalidateByPaths.mockResolvedValue(1);

			const service = new MemoryConsolidationService();
			const result = await service.consolidate();

			expect(result).toMatchObject({
				durationMs: expect.any(Number),
				gitInvalidated: expect.any(Number),
				merged: expect.any(Number),
				promoted: expect.any(Number),
				pruned: expect.any(Number),
				staleMarked: expect.any(Number)
			});
			expect(result.durationMs).toBeGreaterThanOrEqual(0);
		});
	});

	// ------------------------------------------------------------------ singleton
	describe('Singleton helpers', () => {
		it('getMemoryConsolidation() returns the same instance on repeated calls', () => {
			const a = getMemoryConsolidation();
			const b = getMemoryConsolidation();
			expect(a).toBe(b);
		});

		it('resetMemoryConsolidation() causes getMemoryConsolidation() to return a new instance', () => {
			const a = getMemoryConsolidation();
			resetMemoryConsolidation();
			const b = getMemoryConsolidation();
			expect(a).not.toBe(b);
		});
	});
});
