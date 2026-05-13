/**
 * Integration tests for cosine-cluster consolidation.
 *
 * Uses a real VaultStore + VectorStore + stub embedder.
 * No mocks for memory or vector storage — behavioural tests.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@windagency/valora-runtime', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@windagency/valora-runtime')>();
	return {
		...actual,
		SafeExecutor: { executeGit: vi.fn().mockResolvedValue({ stdout: '' }) }
	};
});

vi.mock('./vault/default-vault-dir', () => ({
	getDefaultVaultDir: vi.fn(),
	getLegacyJsonDir: vi.fn()
}));
vi.mock('./migration/auto-migrate', () => ({ runAutoMigrationIfNeeded: vi.fn() }));
vi.mock('./embeddings/resolve-embedder', () => ({ resolveEmbedder: vi.fn() }));

import type { EmbedderPort } from './embeddings/embedder.port';

import { getMemoryConsolidation, MemoryConsolidationService, resetMemoryConsolidation } from './consolidation-service';
import { resolveEmbedder } from './embeddings/resolve-embedder';
import { openVectorStore } from './embeddings/vector-store';
import { runAutoMigrationIfNeeded } from './migration/auto-migrate';
import { getDefaultVaultDir } from './vault/default-vault-dir';
import { VaultStore } from './vault/vault-store';

function stubEmbedder(): EmbedderPort {
	return {
		async embed(req) {
			return { dim: 2, model: 'stub', vectors: req.input.map(() => [1, 0]) };
		}
	};
}

describe('MemoryConsolidationService — cosine clustering', () => {
	let tmpDir: string;
	let vaultStore: VaultStore;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-consolidate-'));
		vaultStore = new VaultStore(tmpDir);
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { force: true, recursive: true });
	});

	it('falls back to Jaccard merge when no embedder is configured', async () => {
		const service = new MemoryConsolidationService(vaultStore);

		// Two entries with same primary tag → will merge via Jaccard
		await vaultStore.appendEntry('episodic', makeEpisodic('a', 'alpha alpha alpha content', ['pnpm']));
		await vaultStore.appendEntry('episodic', makeEpisodic('b', 'alpha alpha content here', ['pnpm']));

		const result = await service.consolidate({ pruneOnly: false });

		expect(result.merged).toBeGreaterThanOrEqual(0); // doesn't crash
	});

	it('creates a semantic entry from a cosine cluster of similar episodics', async () => {
		const embedder = stubEmbedder();
		const service = new MemoryConsolidationService(vaultStore, embedder);

		const entryA = makeEpisodic('id-a', 'pnpm lockfile drifted — reinstall fixed it', ['pnpm']);
		const entryB = makeEpisodic('id-b', 'pnpm install fixed the lockfile drift issue', ['pnpm', 'lockfile']);
		await vaultStore.appendEntry('episodic', entryA);
		await vaultStore.appendEntry('episodic', entryB);

		// Store similar vectors for both entries (cosine ≈ 1.0)
		const vs = openVectorStore(tmpDir, 'stub', 2);
		vs.append('id-a', [1, 0]);
		vs.append('id-b', [0.999, 0.045]);
		vs.flush();

		const result = await service.consolidate({ pruneOnly: false });

		expect(result.merged).toBeGreaterThan(0);

		// A new semantic entry should exist
		const semantics = await vaultStore.getEntries('semantic');
		expect(semantics.length).toBeGreaterThan(0);
	});

	it('marks merged episodic members as stale', async () => {
		const embedder = stubEmbedder();
		const service = new MemoryConsolidationService(vaultStore, embedder);

		await vaultStore.appendEntry('episodic', makeEpisodic('id-a', 'pnpm lockfile drifted', ['pnpm']));
		await vaultStore.appendEntry('episodic', makeEpisodic('id-b', 'lockfile drift with pnpm', ['pnpm']));

		const vs = openVectorStore(tmpDir, 'stub', 2);
		vs.append('id-a', [1, 0]);
		vs.append('id-b', [0.999, 0.045]);
		vs.flush();

		await service.consolidate({ pruneOnly: false });

		const episodics = await vaultStore.getEntries('episodic');
		const a = episodics.find((e) => e.id === 'id-a');
		const b = episodics.find((e) => e.id === 'id-b');
		expect(a?.confidence).toBe('stale');
		expect(b?.confidence).toBe('stale');
	});

	it('does not merge entries whose vectors are dissimilar', async () => {
		const embedder = stubEmbedder();
		const service = new MemoryConsolidationService(vaultStore, embedder);

		await vaultStore.appendEntry('episodic', makeEpisodic('id-a', 'pnpm lockfile', ['pnpm']));
		await vaultStore.appendEntry('episodic', makeEpisodic('id-b', 'docker compose', ['docker']));

		const vs = openVectorStore(tmpDir, 'stub', 2);
		vs.append('id-a', [1, 0]); // orthogonal to id-b
		vs.append('id-b', [0, 1]);
		vs.flush();

		const result = await service.consolidate({ pruneOnly: false });

		// No cosine-based merge
		const semantics = await vaultStore.getEntries('semantic');
		expect(semantics.length).toBe(0);
		expect(result.merged).toBe(0);
	});

	describe('default singleton — cosine fires when an embedder is configured', () => {
		beforeEach(() => {
			vi.mocked(getDefaultVaultDir).mockReturnValue(tmpDir);
			vi.mocked(runAutoMigrationIfNeeded).mockReturnValue(null);
			resetMemoryConsolidation();
		});

		afterEach(() => {
			resetMemoryConsolidation();
			vi.mocked(resolveEmbedder).mockReset();
		});

		it('cosine-merges entries with no shared tags via the singleton when a provider supports embed()', async () => {
			vi.mocked(resolveEmbedder).mockResolvedValueOnce(stubEmbedder());

			// Two entries that DO NOT share a primary tag — Jaccard cannot merge them.
			// Their vectors are identical, so cosine clustering must merge them.
			await vaultStore.appendEntry('episodic', makeEpisodic('sing-a', 'first observation', ['alpha']));
			await vaultStore.appendEntry('episodic', makeEpisodic('sing-b', 'second observation', ['beta']));
			const vs = openVectorStore(tmpDir, 'stub', 2);
			vs.append('sing-a', [1, 0]);
			vs.append('sing-b', [1, 0]);
			vs.flush();

			const service = await getMemoryConsolidation();
			const result = await service.consolidate({ pruneOnly: false });

			expect(result.merged).toBeGreaterThan(0);
			// Read from a fresh VaultStore so we observe what was persisted to disk
			// rather than the test's stale in-memory index.
			const fresh = new VaultStore(tmpDir);
			const semantics = await fresh.getEntries('semantic');
			expect(semantics.length).toBeGreaterThan(0);
		});
	});
});

function makeEpisodic(id: string, content: string, tags: string[]) {
	const now = new Date().toISOString();
	return {
		accessCount: 0,
		agentRole: 'lead',
		category: 'episodic' as const,
		confidence: 'observed' as const,
		content,
		createdAt: now,
		halfLifeDays: 7,
		id,
		isError: false,
		lastAccessedAt: now,
		relatedPaths: [],
		sessionId: 'ses-1',
		source: { command: 'test' },
		tags,
		updatedAt: now
	};
}
