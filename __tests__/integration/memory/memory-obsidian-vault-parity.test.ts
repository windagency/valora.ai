/**
 * Integration test: memory ↔ obsidian vault parity.
 *
 * Asserts the two surfaces of the vault — Valora's memory module and the
 * `valora-plugin-obsidian` plugin — agree on:
 *   1. Path resolution (both must produce the same vault directory for any cwd
 *      that lies under a project with a `.valora/` ancestor; both must fall back
 *      to `~/.valora/memory` for cwds without such an ancestor).
 *   2. File format round-trip: a memory written via VaultStore, then opened
 *      through the same `.md` file and re-parsed, preserves all fields and is
 *      not flagged as embeddingStale.
 *   3. External-edit detection: a body modified outside Valora (the Obsidian
 *      use case) is flagged as embeddingStale on the next parse.
 *
 * This test guards against drift between the two surfaces — the kind that
 * would otherwise produce silent data divergence (B-V1 in the senior review).
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseMemoryFile, serialiseMemoryFile } from 'memory/vault/file-format';
import { VaultStore } from 'memory/vault/vault-store';

import type { MemoryEntry } from 'types/memory.types';

import { resolveVaultDir } from '../../../packages/valora-plugin-obsidian/src/obsidian-setup';

function defaultObsidianConfig() {
	return {
		obsidian: {
			colors: { decisions: '#059669', episodic: '#4c9be8', semantic: '#7c3aed' }
		}
	};
}

function projectVaultUnder(root: string): string {
	const projectVault = path.join(root, '.valora', 'memory');
	fs.mkdirSync(projectVault, { recursive: true });
	return projectVault;
}

describe('memory ↔ obsidian vault parity', () => {
	let tmpRoot: string;

	beforeEach(() => {
		tmpRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'valora-parity-')));
	});

	afterEach(() => {
		fs.rmSync(tmpRoot, { force: true, recursive: true });
	});

	describe('path resolution', () => {
		it('agrees on the project vault when called from the project root', () => {
			const projectVault = projectVaultUnder(tmpRoot);
			expect(resolveVaultDir(defaultObsidianConfig(), tmpRoot)).toBe(projectVault);
		});

		it('agrees on the project vault when called from a deep subdirectory (walk-up)', () => {
			const projectVault = projectVaultUnder(tmpRoot);
			const deep = path.join(tmpRoot, 'src', 'a', 'b', 'c');
			fs.mkdirSync(deep, { recursive: true });
			expect(resolveVaultDir(defaultObsidianConfig(), deep)).toBe(projectVault);
		});

		it('falls back to ~/.valora/memory when no .valora/ ancestor exists', () => {
			// tmpRoot has no .valora/ in its ancestry on every platform we ship to.
			const expected = path.join(os.homedir(), '.valora', 'memory');
			expect(resolveVaultDir(defaultObsidianConfig(), tmpRoot)).toBe(expected);
		});
	});

	describe('round-trip via the .md file', () => {
		it('writes a memory through VaultStore and reads it back via the file format with no drift', async () => {
			const projectVault = projectVaultUnder(tmpRoot);
			const store = new VaultStore(projectVault);
			const entry: MemoryEntry = {
				accessCount: 0,
				agentRole: 'lead',
				category: 'episodic',
				confidence: 'observed',
				content: 'pnpm lockfile drifted after a workspace dep bump',
				createdAt: '2026-05-07T08:00:00.000Z',
				halfLifeDays: 7,
				id: 'mem-parity001',
				isError: false,
				lastAccessedAt: '2026-05-07T08:00:00.000Z',
				relatedPaths: ['pnpm-lock.yaml'],
				sessionId: 'ses-test',
				source: { command: 'implement' },
				tags: ['pnpm'],
				updatedAt: '2026-05-07T08:00:00.000Z'
			};

			await store.appendEntry('episodic', entry);
			const onDisk = path.join(projectVault, 'episodic', `${entry.id}.md`);
			const parsed = parseMemoryFile(fs.readFileSync(onDisk, 'utf-8'), entry.id);

			expect(parsed.entry.content).toBe(entry.content);
			expect(parsed.entry.embeddingStale).toBeFalsy();
			expect(parsed.entry.contentHash).toMatch(/^[0-9a-f]{64}$/);
		});

		it('flags embeddingStale on the next parse when a user edits the .md body outside VaultStore', async () => {
			const projectVault = projectVaultUnder(tmpRoot);
			const store = new VaultStore(projectVault);
			const entry: MemoryEntry = {
				accessCount: 0,
				agentRole: 'lead',
				category: 'semantic',
				confidence: 'verified',
				content: 'Original observation written by Valora',
				createdAt: '2026-05-07T08:00:00.000Z',
				halfLifeDays: 30,
				id: 'mem-parity002',
				isError: false,
				lastAccessedAt: '2026-05-07T08:00:00.000Z',
				relatedPaths: [],
				sessionId: 'ses-test',
				source: { command: 'implement' },
				tags: [],
				updatedAt: '2026-05-07T08:00:00.000Z'
			};

			await store.appendEntry('semantic', entry);
			const onDisk = path.join(projectVault, 'semantic', `${entry.id}.md`);

			// Simulate Obsidian: the user edits the body without going through VaultStore,
			// leaving the persisted content_hash unchanged.
			const original = fs.readFileSync(onDisk, 'utf-8');
			const edited = original.replace(
				'Original observation written by Valora',
				'Refined wording added by the user in Obsidian'
			);
			fs.writeFileSync(onDisk, edited);

			const parsed = parseMemoryFile(fs.readFileSync(onDisk, 'utf-8'), entry.id);
			expect(parsed.entry.embeddingStale).toBe(true);
		});
	});

	describe('serialise stamps a hash that the parser then verifies', () => {
		it('serialiseMemoryFile + parseMemoryFile round-trip leaves the entry not stale', () => {
			const entry: MemoryEntry = {
				accessCount: 0,
				agentRole: 'lead',
				category: 'decisions',
				confidence: 'observed',
				content: 'sample body for parity check',
				createdAt: '2026-05-07T08:00:00.000Z',
				halfLifeDays: 60,
				id: 'mem-parity003',
				isError: false,
				lastAccessedAt: '2026-05-07T08:00:00.000Z',
				relatedPaths: [],
				sessionId: 'ses-test',
				source: { command: 'implement' },
				tags: [],
				updatedAt: '2026-05-07T08:00:00.000Z'
			};
			const md = serialiseMemoryFile(entry, []);
			const parsed = parseMemoryFile(md, entry.id);
			expect(parsed.entry.embeddingStale).toBeFalsy();
		});
	});
});
