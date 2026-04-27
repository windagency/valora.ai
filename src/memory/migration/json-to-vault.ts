import { atomicWriteFile, serialiseMemoryFile } from 'memory/vault/file-format';
import { mkdirSync, readFileSync, renameSync } from 'node:fs';
import * as path from 'node:path';

import type { Edge, MemoryCategory, MemoryEntry, MemoryStoreFile } from 'types/memory.types';

import { getLogger } from 'output/logger';

import { writeVaultVersion } from './vault-version';

export interface MigrationOptions {
	jsonDir: string;
	vaultDir: string;
}

export interface MigrationResult {
	migrated: number;
	skipped: number;
}

const CATEGORIES: MemoryCategory[] = ['episodic', 'semantic', 'decisions'];

/**
 * Migrate the three legacy JSON memory stores into the per-memory Markdown vault.
 *
 * The migration:
 * 1. Reads each `{category}.json` in `jsonDir`.
 * 2. For every entry, writes `{vaultDir}/{category}/{id}.md` with frontmatter + body.
 * 3. Reconstructs `supersedes` links as `[[id|supersedes]]` wikilinks.
 * 4. Moves the source JSON files to `{jsonDir}/_legacy/`.
 * 5. Writes the vault version file.
 */
export function migrateJsonToVault(options: MigrationOptions): MigrationResult {
	const { jsonDir, vaultDir } = options;

	let migrated = 0;
	let skipped = 0;

	for (const category of CATEGORIES) {
		const jsonPath = path.join(jsonDir, `${category}.json`);
		let storeFile: MemoryStoreFile;

		try {
			const raw = readFileSync(jsonPath, 'utf-8');
			storeFile = JSON.parse(raw) as MemoryStoreFile;
		} catch {
			// no file for this category — skip
			continue;
		}

		for (const entry of storeFile.entries) {
			try {
				const links = buildEntryLinks(entry);
				const mdPath = path.join(vaultDir, category, `${entry.id}.md`);
				atomicWriteFile(mdPath, serialiseMemoryFile(entry, links));
				migrated++;
			} catch (err) {
				getLogger().warn(`Migration: skipping entry ${entry.id}: ${String(err)}`);
				skipped++;
			}
		}

		// Archive the source JSON
		try {
			const legacyDir = path.join(jsonDir, '_legacy');
			mkdirSync(legacyDir, { recursive: true });
			const ts = new Date().toISOString().replace(/[:.]/g, '-');
			renameSync(jsonPath, path.join(legacyDir, `${category}-${ts}.json`));
		} catch (err) {
			getLogger().warn(`Migration: could not archive ${category}.json: ${String(err)}`);
		}
	}

	writeVaultVersion(vaultDir);

	return { migrated, skipped };
}

function buildEntryLinks(entry: MemoryEntry): Edge[] {
	const links: Edge[] = [];
	if (entry.supersedes) {
		links.push({ fromId: entry.id, kind: 'supersedes', toId: entry.supersedes });
	}
	return links;
}
