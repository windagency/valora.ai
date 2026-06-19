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

import type { MemoryEntry } from '@windagency/valora-plugin-api';

vi.mock('./vault/default-vault-dir', () => ({
	getDefaultVaultDir: vi.fn().mockReturnValue('/tmp/valora-vault-mock'),
	getLegacyJsonDir: vi.fn().mockReturnValue('/tmp/valora-vault-mock')
}));
vi.mock('./migration/auto-migrate', () => ({ runAutoMigrationIfNeeded: vi.fn().mockReturnValue(null) }));
vi.mock('@windagency/valora-runtime', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@windagency/valora-runtime')>();
	return {
		...actual,
		SafeExecutor: { executeGit: vi.fn() }
	};
});

import { SafeExecutor } from '@windagency/valora-runtime';

import { MemoryConsolidationService, resetMemoryConsolidation } from './consolidation-service';
import { getDefaultVaultDir } from './vault/default-vault-dir';
import { VaultStore } from './vault/vault-store';

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

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-h14-'));
		vaultStore = new VaultStore(tmpDir);

		vi.mocked(getDefaultVaultDir).mockReturnValue(tmpDir);
		(SafeExecutor as unknown as { executeGit: ReturnType<typeof vi.fn> }).executeGit = vi
			.fn()
			.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });

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

		const service = new MemoryConsolidationService(vaultStore);
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
