import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { MemoryEntry, MemoryStoreFile } from 'types/memory.types';

import { migrateJsonToVault } from './json-to-vault';
import { readVaultVersion } from './vault-version';

function makeEntry(id: string, overrides: Partial<MemoryEntry> = {}): MemoryEntry {
	const now = '2026-04-01T00:00:00.000Z';
	return {
		accessCount: 0,
		agentRole: 'implementer',
		category: 'episodic',
		confidence: 'observed',
		content: `Memory about ${id}`,
		createdAt: now,
		halfLifeDays: 7,
		id,
		isError: false,
		lastAccessedAt: now,
		relatedPaths: [],
		sessionId: 'ses-001',
		source: { command: 'test' },
		tags: ['test'],
		updatedAt: now,
		...overrides
	};
}

function writeJsonStore(jsonDir: string, category: string, entries: MemoryEntry[]): void {
	fs.mkdirSync(jsonDir, { recursive: true });
	const store: MemoryStoreFile = {
		entries,
		lastWrittenAt: '2026-04-01T00:00:00.000Z',
		version: 1
	};
	fs.writeFileSync(path.join(jsonDir, `${category}.json`), JSON.stringify(store, null, 2));
}

describe('migrateJsonToVault', () => {
	let tmpDir: string;
	let jsonDir: string;
	let vaultDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-migrate-'));
		jsonDir = path.join(tmpDir, 'json');
		vaultDir = path.join(tmpDir, 'vault');
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { force: true, recursive: true });
	});

	it('creates one .md file per JSON entry', async () => {
		writeJsonStore(jsonDir, 'episodic', [makeEntry('mem-001'), makeEntry('mem-002')]);

		await migrateJsonToVault({ jsonDir, vaultDir });

		expect(fs.existsSync(path.join(vaultDir, 'episodic', 'mem-001.md'))).toBe(true);
		expect(fs.existsSync(path.join(vaultDir, 'episodic', 'mem-002.md'))).toBe(true);
	});

	it('preserves all entry fields in the migrated files', async () => {
		const entry = makeEntry('mem-003', { tags: ['alpha', 'beta'], relatedPaths: ['src/foo.ts'] });
		writeJsonStore(jsonDir, 'episodic', [entry]);

		await migrateJsonToVault({ jsonDir, vaultDir });

		const { VaultStore } = await import('../vault/vault-store');
		const store = new VaultStore(vaultDir);
		const entries = await store.getEntries('episodic');
		const migrated = entries.find((e) => e.id === 'mem-003');

		expect(migrated).toBeDefined();
		expect(migrated!.tags).toEqual(['alpha', 'beta']);
		expect(migrated!.relatedPaths).toEqual(['src/foo.ts']);
		expect(migrated!.content).toBe(entry.content);
	});

	it('migrates entries from all three categories', async () => {
		writeJsonStore(jsonDir, 'episodic', [makeEntry('mem-ep', { category: 'episodic' })]);
		writeJsonStore(jsonDir, 'semantic', [makeEntry('mem-sem', { category: 'semantic' })]);
		writeJsonStore(jsonDir, 'decisions', [makeEntry('mem-dec', { category: 'decisions' })]);

		await migrateJsonToVault({ jsonDir, vaultDir });

		expect(fs.existsSync(path.join(vaultDir, 'episodic', 'mem-ep.md'))).toBe(true);
		expect(fs.existsSync(path.join(vaultDir, 'semantic', 'mem-sem.md'))).toBe(true);
		expect(fs.existsSync(path.join(vaultDir, 'decisions', 'mem-dec.md'))).toBe(true);
	});

	it('writes a vault version file', async () => {
		writeJsonStore(jsonDir, 'episodic', [makeEntry('mem-v')]);
		await migrateJsonToVault({ jsonDir, vaultDir });
		expect(readVaultVersion(vaultDir)).toBe(1);
	});

	it('moves JSON files to _legacy/ after migration', async () => {
		writeJsonStore(jsonDir, 'episodic', [makeEntry('mem-arch')]);
		await migrateJsonToVault({ jsonDir, vaultDir });

		const legacyFiles = fs.readdirSync(path.join(jsonDir, '_legacy'));
		expect(legacyFiles.some((f) => f.includes('episodic'))).toBe(true);
	});

	it('reconstructs supersedes links as wikilinks', async () => {
		const older = makeEntry('mem-old');
		const newer = makeEntry('mem-new', { supersedes: 'mem-old' });
		writeJsonStore(jsonDir, 'episodic', [older, newer]);

		await migrateJsonToVault({ jsonDir, vaultDir });

		const mdContent = fs.readFileSync(path.join(vaultDir, 'episodic', 'mem-new.md'), 'utf-8');
		expect(mdContent).toContain('[[mem-old|supersedes]]');
	});

	it('reports migration counts in the result', async () => {
		writeJsonStore(jsonDir, 'episodic', [makeEntry('mem-r1'), makeEntry('mem-r2')]);
		writeJsonStore(jsonDir, 'semantic', [makeEntry('mem-r3', { category: 'semantic' })]);

		const result = await migrateJsonToVault({ jsonDir, vaultDir });

		expect(result.migrated).toBe(3);
		expect(result.skipped).toBe(0);
	});

	it('a second run on archived sources is a no-op (idempotent)', async () => {
		writeJsonStore(jsonDir, 'episodic', [makeEntry('mem-1'), makeEntry('mem-2')]);

		await migrateJsonToVault({ jsonDir, vaultDir });
		const firstCount = fs.readdirSync(path.join(vaultDir, 'episodic')).length;

		const second = await migrateJsonToVault({ jsonDir, vaultDir });
		const secondCount = fs.readdirSync(path.join(vaultDir, 'episodic')).length;

		expect(secondCount).toBe(firstCount);
		expect(second.migrated).toBe(0);
	});

	it('a second run with the source still present skips already-migrated entries', async () => {
		// Simulates a crash after .md files were written but before the JSON
		// was archived: the source stays in place, vault entries already exist.
		const entries = [makeEntry('mem-a'), makeEntry('mem-b')];
		writeJsonStore(jsonDir, 'episodic', entries);

		// First migration creates vault files and archives the source.
		await migrateJsonToVault({ jsonDir, vaultDir });
		// Re-create the source as if it never archived.
		writeJsonStore(jsonDir, 'episodic', entries);

		const second = await migrateJsonToVault({ jsonDir, vaultDir });
		const dirEntries = fs.readdirSync(path.join(vaultDir, 'episodic'));

		expect(dirEntries.length).toBe(entries.length);
		expect(second.migrated).toBe(0);
		expect(second.skipped).toBeGreaterThanOrEqual(entries.length);
	});

	it('writes the vault version file atomically (no .tmp file remains)', async () => {
		writeJsonStore(jsonDir, 'episodic', [makeEntry('mem-v')]);
		await migrateJsonToVault({ jsonDir, vaultDir });

		const stragglers = fs.readdirSync(vaultDir).filter((f) => f.endsWith('.tmp'));
		expect(stragglers).toEqual([]);
	});
});
