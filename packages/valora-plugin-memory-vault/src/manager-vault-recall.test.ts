/**
 * Behavioural tests for MemoryManager vault recall.
 *
 * Covers:
 *   - Graceful fallback to lexical path when no embedder is configured
 *   - co_access increments between co-returned entries
 *   - ANN + spreading activation surfaces semantically similar entries
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { EmbedderPort } from './embeddings/embedder.port';
import { openVectorStore } from './embeddings/vector-store';
import { MemoryManager } from './manager';
import { VaultStore } from './vault/vault-store';

function stubEmbedder(vectors: number[][]): EmbedderPort {
	let callCount = 0;
	return {
		async embed(req) {
			const result = vectors[callCount % vectors.length] ?? vectors[0] ?? [1, 0];
			callCount++;
			return { dim: result.length, model: 'stub', vectors: req.input.map(() => result) };
		}
	};
}

describe('MemoryManager — vault recall', () => {
	let tmpDir: string;
	let vaultStore: VaultStore;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-mgr-vault-'));
		vaultStore = new VaultStore(tmpDir);
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { force: true, recursive: true });
	});

	it('falls back to lexical path without throwing when no embedder is configured', async () => {
		const manager = new MemoryManager(vaultStore);
		await manager.create('episodic', {
			agentRole: 'lead',
			confidence: 'observed',
			content: 'pnpm lockfile drifted',
			relatedPaths: [],
			sessionId: 'ses-1',
			source: { command: 'test' },
			tags: ['pnpm']
		});

		const results = await manager.query({ text: 'lockfile', strengthen: false });
		expect(() => results).not.toThrow();
	});

	it('accumulates co_access for every pair across N>=3 results without losing updates', async () => {
		// With ≥3 results the naive read-modify-write loop loses earlier updates
		// because the loop holds stale entry references after each persist.
		const manager = new MemoryManager(vaultStore);
		const ids: string[] = [];
		for (let i = 0; i < 3; i++) {
			const e = await manager.create('episodic', {
				agentRole: 'lead',
				confidence: 'observed',
				content: `entry ${i}`,
				relatedPaths: [],
				sessionId: 'ses-trio',
				source: { command: 'test' },
				tags: ['trio']
			});
			ids.push(e.id);
		}

		await manager.query({ tags: ['trio'], strengthen: false });

		// Reload from disk — the in-memory index reads should also expose the
		// fully accumulated counts.
		const fresh = new VaultStore(tmpDir);
		const entries = await fresh.getEntries('episodic');
		for (const id of ids) {
			const entry = entries.find((e) => e.id === id);
			expect(entry).toBeDefined();
			for (const peer of ids) {
				if (peer === id) continue;
				expect(entry!.coAccess?.[peer]).toBe(1);
			}
		}
	});

	it('increments co_access between all pairs of returned entries', async () => {
		const manager = new MemoryManager(vaultStore);
		const a = await manager.create('episodic', {
			agentRole: 'lead',
			confidence: 'observed',
			content: 'entry A',
			relatedPaths: [],
			sessionId: 'ses-1',
			source: { command: 'test' },
			tags: ['alpha']
		});
		const b = await manager.create('episodic', {
			agentRole: 'lead',
			confidence: 'observed',
			content: 'entry B',
			relatedPaths: [],
			sessionId: 'ses-1',
			source: { command: 'test' },
			tags: ['alpha']
		});

		// Query returns both entries
		await manager.query({ tags: ['alpha'], strengthen: false });

		// Reload entries to check co_access was persisted
		const entries = await vaultStore.getEntries('episodic');
		const updatedA = entries.find((e) => e.id === a.id);
		const updatedB = entries.find((e) => e.id === b.id);

		expect(updatedA?.coAccess?.[b.id]).toBeGreaterThan(0);
		expect(updatedB?.coAccess?.[a.id]).toBeGreaterThan(0);
	});

	it('always returns at least the first entry even when it alone exceeds the tokenBudget', async () => {
		const manager = new MemoryManager(vaultStore);
		const longContent = 'x'.repeat(400); // ~100 tokens on its own

		await manager.create('episodic', {
			agentRole: 'lead',
			confidence: 'observed',
			content: longContent,
			relatedPaths: [],
			sessionId: 'ses-1',
			source: { command: 'test' },
			tags: ['oversized']
		});

		// Budget of 10 tokens ≈ 40 chars, far smaller than the single entry.
		const results = await manager.query({ tags: ['oversized'], tokenBudget: 10, strengthen: false });
		expect(results.length).toBeGreaterThanOrEqual(1);
	});

	it('truncates query results to fit within tokenBudget', async () => {
		const manager = new MemoryManager(vaultStore);

		// 100-char content is roughly 25 tokens.
		const longContent = 'x'.repeat(100);
		await manager.create('episodic', {
			agentRole: 'lead',
			confidence: 'observed',
			content: longContent,
			relatedPaths: [],
			sessionId: 'ses-1',
			source: { command: 'test' },
			tags: ['budget']
		});
		await manager.create('episodic', {
			agentRole: 'lead',
			confidence: 'observed',
			content: longContent,
			relatedPaths: [],
			sessionId: 'ses-1',
			source: { command: 'test' },
			tags: ['budget']
		});
		await manager.create('episodic', {
			agentRole: 'lead',
			confidence: 'observed',
			content: longContent,
			relatedPaths: [],
			sessionId: 'ses-1',
			source: { command: 'test' },
			tags: ['budget']
		});

		// Budget of 50 tokens ≈ 200 chars ≈ 2 entries.
		const results = await manager.query({
			tags: ['budget'],
			tokenBudget: 50,
			strengthen: false
		});

		expect(results.length).toBeLessThanOrEqual(2);
	});

	it('does not return entries whose confidence is "stale"', async () => {
		const manager = new MemoryManager(vaultStore);

		const original = await manager.create('episodic', {
			agentRole: 'lead',
			confidence: 'observed',
			content: 'use the original auth flow',
			relatedPaths: [],
			sessionId: 'ses-1',
			source: { command: 'test' },
			tags: ['auth']
		});

		const replacement = await manager.create('episodic', {
			agentRole: 'lead',
			confidence: 'observed',
			content: 'use the new auth flow',
			relatedPaths: [],
			sessionId: 'ses-1',
			source: { command: 'test' },
			supersedes: original.id,
			tags: ['auth']
		});

		const results = await manager.query({ tags: ['auth'], strengthen: false });
		const ids = results.map((r) => r.entry.id);
		expect(ids).toContain(replacement.id);
		expect(ids).not.toContain(original.id);
	});

	it('returns semantically similar entry first when embedder and vectors are available', async () => {
		const manager = new MemoryManager(vaultStore);

		// docker entry: much longer half-life → higher strength in lexical path → would rank first
		const dockerEntry = await manager.create('episodic', {
			agentRole: 'lead',
			confidence: 'observed',
			content: 'docker compose up starts the devcontainer',
			halfLifeDays: 9999,
			relatedPaths: [],
			sessionId: 'ses-2',
			source: { command: 'test' },
			tags: ['docker']
		});
		// pnpm entry: short half-life → lower strength in lexical path → would rank last
		const pnpmEntry = await manager.create('episodic', {
			agentRole: 'lead',
			confidence: 'observed',
			content: 'pnpm install --lockfile-only fixes drift',
			halfLifeDays: 1,
			relatedPaths: [],
			sessionId: 'ses-1',
			source: { command: 'test' },
			tags: ['pnpm']
		});

		// Vectors: pnpm is [1,0,0] (matches query), docker is [0,1,0] (orthogonal)
		const vs = openVectorStore(tmpDir, 'stub', 3);
		vs.append(pnpmEntry.id, [1, 0, 0]);
		vs.append(dockerEntry.id, [0, 1, 0]);
		vs.flush();

		// Embedder always returns [1,0,0] — semantically close to pnpm
		const manager2 = new MemoryManager(vaultStore, undefined, stubEmbedder([[1, 0, 0]]));

		const results = await manager2.query({ text: 'pnpm lockfile', strengthen: false });

		expect(results.length).toBeGreaterThan(0);
		expect(results[0]?.entry.id).toBe(pnpmEntry.id);
	});
});
