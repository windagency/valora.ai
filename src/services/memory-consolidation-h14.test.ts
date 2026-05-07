/**
 * Focused regression test for H14: mergeCluster must write all decays_from
 * edges in a single appendEntryWithLinks call, not per-member (which overwrites
 * the file each iteration and loses all but the last edge).
 *
 * Uses a real VaultStore backed by a temp dir to observe on-disk edges.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MemoryEntry } from 'types/memory.types';

vi.mock('memory/migration/auto-migrate', () => ({
	runAutoMigrationIfNeeded: vi.fn().mockReturnValue(null)
}));
vi.mock('memory/vault/default-vault-dir');
vi.mock('utils/safe-exec');
vi.mock('output/pipeline-emitter', () => ({
	getPipelineEmitter: () => ({ emitConsolidationComplete: vi.fn() })
}));
vi.mock('output/logger', () => ({
	getLogger: () => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() })
}));
vi.mock('config/loader', () => ({
	getConfigLoader: () => ({ get: vi.fn().mockReturnValue({ memory: { semantic_half_life_days: 30 } }) })
}));

import { MemoryManager, VaultStore } from 'memory';
import { getDefaultVaultDir } from 'memory/vault/default-vault-dir';
import { SafeExecutor } from 'utils/safe-exec';

import { MemoryConsolidationService, resetMemoryConsolidation } from './memory-consolidation.service';

function makeEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
	const now = new Date().toISOString();
	return {
		id: `mem-h14-${Math.random().toString(36).slice(2)}`,
		category: 'episodic',
		content: 'test content',
		tags: ['shared-tag'],
		source: { command: 'test' },
		confidence: 'observed',
		halfLifeDays: 7,
		createdAt: now,
		lastAccessedAt: now,
		updatedAt: now,
		accessCount: 0,
		agentRole: 'lead',
		sessionId: 'sess-h14',
		relatedPaths: [],
		isError: false,
		...overrides
	};
}

describe('MemoryConsolidationService — H14 decays_from edges', () => {
	let tmpDir: string;
	let vaultStore: VaultStore;
	let manager: MemoryManager;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-h14-'));
		vaultStore = new VaultStore(tmpDir);
		manager = new MemoryManager(vaultStore);

		vi.mocked(getDefaultVaultDir).mockReturnValue(tmpDir);
		vi.mocked(SafeExecutor).executeGit = vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });

		resetMemoryConsolidation();
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { force: true, recursive: true });
		resetMemoryConsolidation();
	});

	it('writes decays_from edges for all cluster members in the resulting semantic entry', async () => {
		// Three episodic entries with the same tag — they should form a Jaccard cluster.
		const a = makeEntry({ id: 'mem-h14-a', tags: ['shared-tag'], content: 'content-a' });
		const b = makeEntry({ id: 'mem-h14-b', tags: ['shared-tag'], content: 'content-b' });
		const c = makeEntry({ id: 'mem-h14-c', tags: ['shared-tag'], content: 'content-c' });
		for (const e of [a, b, c]) {
			await vaultStore.appendEntry('episodic', e);
		}

		const service = new MemoryConsolidationService(vaultStore, manager);
		await service.consolidate({ pruneOnly: false });

		// The semantic category should have exactly one entry (the merged result).
		const semanticEntries = await vaultStore.getEntries('semantic');
		expect(semanticEntries.length).toBeGreaterThanOrEqual(1);

		const merged = semanticEntries[0]!;
		const index = await vaultStore.getVaultIndex();
		const outEdges = index.outEdges.get(merged.id) ?? [];

		// ALL three source episodics must appear as decays_from or supersedes edges.
		const linkedIds = new Set(outEdges.map((e) => e.toId));
		expect(linkedIds.has('mem-h14-a')).toBe(true);
		expect(linkedIds.has('mem-h14-b')).toBe(true);
		expect(linkedIds.has('mem-h14-c')).toBe(true);
	});
});
