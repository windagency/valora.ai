/**
 * Registry-swap integration test.
 *
 * Proves the memory subsystem's indirection actually swaps backends. A test
 * fixture (in-memory `MemoryProvider`) is registered with the registry as
 * `'test-mem'`. After `setActive('test-mem')`, every call through
 * `getMemoryRegistry().getActive()` routes into the fixture; the bundled
 * vault is never instantiated and never writes to disk.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type {
	ConsolidationOptions,
	ConsolidationResult,
	MemoryCategory,
	MemoryCreateOptions,
	MemoryEntry,
	MemoryProvider,
	MemoryProviderInfo,
	MemoryQueryOptions,
	MemoryQueryResult,
	MemoryVerifyReport,
	PurgeCriteria,
	PurgeResult
} from '@windagency/valora-plugin-api';

import { getMemoryRegistry, resetMemoryRegistry } from 'memory/registry';

class InMemoryFixtureProvider implements MemoryProvider {
	readonly calls: string[] = [];
	private readonly entries: Map<string, MemoryEntry> = new Map();
	private nextId = 1;

	constructor(_config: Record<string, unknown>) {}

	async consolidate(_options?: ConsolidationOptions): Promise<ConsolidationResult> {
		this.calls.push('consolidate');
		return {
			durationMs: 0,
			gitInvalidated: 0,
			merged: 0,
			promoted: 0,
			pruned: 0,
			staleMarked: 0
		};
	}

	async create(category: MemoryCategory, options: MemoryCreateOptions): Promise<MemoryEntry> {
		this.calls.push('create');
		const id = `fixture-${this.nextId++}`;
		const now = new Date().toISOString();
		const entry: MemoryEntry = {
			accessCount: 0,
			agentRole: options.agentRole,
			category,
			confidence: options.confidence,
			content: options.content,
			createdAt: now,
			halfLifeDays: options.halfLifeDays ?? 7,
			id,
			isError: options.isError ?? false,
			lastAccessedAt: now,
			relatedPaths: options.relatedPaths ?? [],
			sessionId: options.sessionId,
			source: options.source,
			tags: options.tags,
			updatedAt: now
		};
		this.entries.set(id, entry);
		return entry;
	}

	async delete(_category: MemoryCategory, id: string): Promise<boolean> {
		this.calls.push('delete');
		return this.entries.delete(id);
	}

	async findByPaths(_paths: string[]): Promise<MemoryQueryResult[]> {
		this.calls.push('findByPaths');
		return [];
	}

	async flush(): Promise<void> {
		this.calls.push('flush');
	}

	async get(_category: MemoryCategory, id: string, _strengthen?: boolean): Promise<MemoryQueryResult | null> {
		this.calls.push('get');
		const entry = this.entries.get(id);
		return entry === undefined ? null : { entry, strength: 1 };
	}

	async info(): Promise<MemoryProviderInfo> {
		this.calls.push('info');
		return {
			capabilities: [],
			counts: { decisions: 0, episodic: this.entries.size, semantic: 0 },
			edgeCount: 0,
			embeddingCoverage: 0,
			label: 'In-Memory Fixture',
			name: 'test-mem'
		};
	}

	async invalidateByPaths(_paths: string[]): Promise<number> {
		this.calls.push('invalidateByPaths');
		return 0;
	}

	async markStaleByPaths(_paths: string[]): Promise<number> {
		this.calls.push('markStaleByPaths');
		return 0;
	}

	async prune(_threshold?: number): Promise<number> {
		this.calls.push('prune');
		return 0;
	}

	async purge(criteria: PurgeCriteria): Promise<PurgeResult> {
		this.calls.push('purge');
		const wouldDelete = this.entries.size;
		if (!criteria.dryRun) {
			this.entries.clear();
		}
		return {
			dryRun: criteria.dryRun ?? false,
			totalDeleted: criteria.dryRun ? 0 : wouldDelete,
			totalWouldDelete: wouldDelete
		};
	}

	async query(options: MemoryQueryOptions): Promise<MemoryQueryResult[]> {
		this.calls.push('query');
		const matching = [...this.entries.values()].filter(
			(entry) => options.category === undefined || entry.category === options.category
		);
		return matching.map((entry) => ({ entry, strength: 1 }));
	}

	async update(_category: MemoryCategory, id: string, patch: Partial<MemoryEntry>): Promise<boolean> {
		this.calls.push('update');
		const existing = this.entries.get(id);
		if (existing === undefined) return false;
		this.entries.set(id, { ...existing, ...patch });
		return true;
	}

	async verify(): Promise<MemoryVerifyReport> {
		this.calls.push('verify');
		return {
			counts: { decisions: 0, episodic: this.entries.size, semantic: 0 },
			issues: [],
			ok: true
		};
	}
}

describe('registry-swap integration', () => {
	let tmpVaultDir: string;

	beforeEach(() => {
		resetMemoryRegistry();
		tmpVaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-registry-swap-'));
	});

	afterEach(() => {
		resetMemoryRegistry();
		fs.rmSync(tmpVaultDir, { force: true, recursive: true });
	});

	it('routes every contract call to the registered fixture, never the bundled vault', async () => {
		const registry = getMemoryRegistry();
		registry.registerProvider('test-mem', InMemoryFixtureProvider, {
			owner: 'integration-test'
		});
		registry.setActive('test-mem', {});

		expect(registry.getActiveName()).toBe('test-mem');

		const provider = registry.getActive();
		expect(provider).toBeInstanceOf(InMemoryFixtureProvider);

		const created = await provider.create('episodic', {
			agentRole: 'lead',
			confidence: 'observed',
			content: 'routed via fixture',
			sessionId: 'sess-x',
			source: { command: 'test' },
			tags: ['swap']
		});
		expect(created.id).toMatch(/^fixture-/);

		const results = await provider.query({ category: 'episodic', limit: 10, strengthen: false });
		expect(results).toHaveLength(1);
		expect(results[0]?.entry.content).toBe('routed via fixture');

		const info = await provider.info();
		expect(info.name).toBe('test-mem');
		expect(info.counts.episodic).toBe(1);

		const fixture = provider as InMemoryFixtureProvider;
		expect(fixture.calls).toEqual(expect.arrayContaining(['create', 'query', 'info']));

		// The bundled vault was never instantiated, so no vault files should
		// have appeared in the temp dir during this test.
		const stragglerFiles = fs.readdirSync(tmpVaultDir);
		expect(stragglerFiles).toEqual([]);
	});

	it('a registered-but-not-active provider is reachable via the registry but does not become getActive()', () => {
		const registry = getMemoryRegistry();
		registry.registerProvider('test-mem', InMemoryFixtureProvider, {
			owner: 'integration-test'
		});

		expect(registry.hasProvider('test-mem')).toBe(true);
		expect(registry.hasActive()).toBe(false);
		expect(() => registry.getActive()).toThrow(/No active memory provider/);
	});

	it('two competing registrations under the same key surface a conflict error', () => {
		const registry = getMemoryRegistry();
		registry.registerProvider('test-mem', InMemoryFixtureProvider, { owner: 'plugin-a' });

		expect(() => registry.registerProvider('test-mem', InMemoryFixtureProvider, { owner: 'plugin-b' })).toThrow(
			/already registered by "plugin-a"/
		);
	});

	it('an override registration replaces the previous binding', () => {
		const registry = getMemoryRegistry();
		registry.registerProvider('test-mem', InMemoryFixtureProvider, { owner: 'plugin-a' });
		registry.registerProvider('test-mem', InMemoryFixtureProvider, {
			override: true,
			owner: 'plugin-b'
		});

		expect(registry.getOwner('test-mem')).toBe('plugin-b');
	});
});
