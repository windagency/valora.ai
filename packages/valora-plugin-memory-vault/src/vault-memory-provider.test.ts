import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { MemoryProvider } from '@windagency/valora-plugin-api';

import { VaultMemoryProvider } from './vault-memory-provider';

function makeTempVault(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'valora-vault-mp-'));
}

function makeProvider(vaultDir: string, memoryConfig?: Record<string, unknown>): MemoryProvider {
	return new VaultMemoryProvider({ memoryConfig, vaultDir });
}

describe('VaultMemoryProvider', () => {
	let vaultDir: string;

	beforeEach(() => {
		vaultDir = makeTempVault();
	});

	afterEach(() => {
		fs.rmSync(vaultDir, { force: true, recursive: true });
	});

	describe('CRUD round-trip via the MemoryProvider port', () => {
		it('creates an entry and reads it back via get()', async () => {
			const provider = makeProvider(vaultDir);

			const created = await provider.create('episodic', {
				agentRole: 'lead',
				confidence: 'observed',
				content: 'Hello',
				sessionId: 'sess-1',
				source: { command: 'test' },
				tags: ['greeting']
			});

			const fetched = await provider.get('episodic', created.id, false);
			expect(fetched?.entry.content).toBe('Hello');
			expect(fetched?.entry.tags).toEqual(['greeting']);
		});

		it('updates an entry and reflects the patch on next get()', async () => {
			const provider = makeProvider(vaultDir);
			const entry = await provider.create('episodic', {
				agentRole: 'qa',
				confidence: 'inferred',
				content: 'before',
				sessionId: 'sess-2',
				source: { command: 'test' },
				tags: ['x']
			});

			const ok = await provider.update('episodic', entry.id, { content: 'after' });
			expect(ok).toBe(true);

			const fetched = await provider.get('episodic', entry.id, false);
			expect(fetched?.entry.content).toBe('after');
		});

		it('deletes an entry and returns null on subsequent get()', async () => {
			const provider = makeProvider(vaultDir);
			const entry = await provider.create('episodic', {
				agentRole: 'qa',
				confidence: 'observed',
				content: 'doomed',
				sessionId: 'sess-3',
				source: { command: 'test' },
				tags: []
			});

			expect(await provider.delete('episodic', entry.id)).toBe(true);
			expect(await provider.get('episodic', entry.id, false)).toBeNull();
		});
	});

	describe('query() and findByPaths()', () => {
		it('filters by tag', async () => {
			const provider = makeProvider(vaultDir);
			await provider.create('episodic', {
				agentRole: 'lead',
				confidence: 'observed',
				content: 'tagged',
				sessionId: 's',
				source: { command: 'test' },
				tags: ['feature-a']
			});
			await provider.create('episodic', {
				agentRole: 'lead',
				confidence: 'observed',
				content: 'untagged',
				sessionId: 's',
				source: { command: 'test' },
				tags: ['feature-b']
			});

			const results = await provider.query({ strengthen: false, tags: ['feature-a'] });
			expect(results).toHaveLength(1);
			expect(results[0]!.entry.content).toBe('tagged');
		});

		it('findByPaths returns entries with matching relatedPaths', async () => {
			const provider = makeProvider(vaultDir);
			await provider.create('semantic', {
				agentRole: 'arch',
				confidence: 'verified',
				content: 'about-foo',
				relatedPaths: ['src/foo.ts'],
				sessionId: 's',
				source: { command: 'test' },
				tags: []
			});

			const results = await provider.findByPaths(['src/foo.ts']);
			expect(results).toHaveLength(1);
			expect(results[0]!.entry.content).toBe('about-foo');
		});
	});

	describe('purge()', () => {
		it('purges all categories when all=true', async () => {
			const provider = makeProvider(vaultDir);
			await provider.create('episodic', {
				agentRole: 'a',
				confidence: 'observed',
				content: 'x',
				sessionId: 's',
				source: { command: 'test' },
				tags: []
			});
			const result = await provider.purge({ all: true, dryRun: false });
			expect(result.totalDeleted).toBeGreaterThanOrEqual(1);
		});

		it('honours dryRun without deleting', async () => {
			const provider = makeProvider(vaultDir);
			await provider.create('episodic', {
				agentRole: 'a',
				confidence: 'observed',
				content: 'x',
				sessionId: 's',
				source: { command: 'test' },
				tags: []
			});
			const result = await provider.purge({ all: true, dryRun: true });
			expect(result.totalDeleted).toBe(0);
			expect(result.totalWouldDelete).toBeGreaterThanOrEqual(1);
		});
	});

	describe('flush()', () => {
		it('completes without throwing on an empty vault', async () => {
			const provider = makeProvider(vaultDir);
			await expect(provider.flush()).resolves.toBeUndefined();
		});
	});

	describe('info()', () => {
		it('reports the provider name, label, and vault entry count', async () => {
			const provider = makeProvider(vaultDir);
			await provider.create('episodic', {
				agentRole: 'a',
				confidence: 'observed',
				content: 'x',
				sessionId: 's',
				source: { command: 'test' },
				tags: []
			});

			const info = await provider.info();
			expect(info.name).toBe('vault');
			expect(info.label).toMatch(/vault/i);
			expect(info.counts.episodic).toBe(1);
			expect(info.counts.semantic).toBe(0);
			expect(info.counts.decisions).toBe(0);
			expect(Array.isArray(info.capabilities)).toBe(true);
		});
	});

	describe('verify()', () => {
		it('returns ok=true and per-category counts for a healthy vault', async () => {
			const provider = makeProvider(vaultDir);
			await provider.create('episodic', {
				agentRole: 'a',
				confidence: 'observed',
				content: 'x',
				sessionId: 's',
				source: { command: 'test' },
				tags: []
			});

			const report = await provider.verify();
			expect(report.ok).toBe(true);
			expect(report.issues).toEqual([]);
			expect(report.counts.episodic).toBe(1);
		});
	});

	describe('configuration', () => {
		it('falls back to runtime defaults when constructor config omits vaultDir', () => {
			// Should not throw — uses getDefaultVaultDir() under the hood.
			expect(() => new VaultMemoryProvider({})).not.toThrow();
		});

		it('uses the explicitly provided vaultDir when set', async () => {
			const provider = makeProvider(vaultDir);
			await provider.create('episodic', {
				agentRole: 'a',
				confidence: 'observed',
				content: 'check-vault-dir',
				sessionId: 's',
				source: { command: 'test' },
				tags: []
			});
			// If the provider used a different vaultDir, the directory we created
			// in beforeEach would be empty. Read directly from disk to confirm.
			const episodicDir = path.join(vaultDir, 'episodic');
			expect(fs.existsSync(episodicDir)).toBe(true);
			const files = fs.readdirSync(episodicDir).filter((f) => f.endsWith('.md'));
			expect(files.length).toBe(1);
		});
	});
});
