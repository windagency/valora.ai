import type { Edge, MemoryCategory, MemoryEntry, MemoryStoreFile } from '@windagency/valora-plugin-api';

import { getLogger } from '@windagency/valora-runtime';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import * as path from 'node:path';

import { atomicWriteFile, serialiseMemoryFile } from '../vault/file-format.js';
import { writeVaultVersion } from './vault-version.js';

export interface MigrationOptions {
	jsonDir: string;
	vaultDir: string;
}

export interface MigrationResult {
	migrated: number;
	skipped: number;
}

const CATEGORIES: MemoryCategory[] = ['episodic', 'semantic', 'decisions'];
const LOCK_FILENAME = '.migration.lock';

/**
 * Migrate the three legacy JSON memory stores into the per-memory Markdown vault.
 *
 * The migration:
 * 1. Reads each `{category}.json` in `jsonDir`.
 * 2. For every entry, writes `{vaultDir}/{category}/{id}.md` with frontmatter + body —
 *    skipping entries whose vault file already exists (idempotent).
 * 3. Reconstructs `supersedes` links as `[[id|supersedes]]` wikilinks.
 * 4. Moves the source JSON files to `{jsonDir}/_legacy/`.
 * 5. Writes the vault version file atomically.
 *
 * The migration is guarded by a sentinel `{vaultDir}/.migration.lock` file so a
 * concurrent or crashed run cannot corrupt the vault. The lock is removed on
 * success and on any failure (try/finally), making re-runs safe.
 */
interface CategoryMigrationResult {
	migrated: number;
	skipped: number;
}

export function migrateJsonToVault(options: MigrationOptions): MigrationResult {
	const { jsonDir, vaultDir } = options;

	mkdirSync(vaultDir, { recursive: true });
	const lockPath = path.join(vaultDir, LOCK_FILENAME);
	if (existsSync(lockPath)) {
		throw new Error(
			`Migration lock present at ${lockPath}. Another run is in progress, or a previous run crashed; remove the file and retry.`
		);
	}

	atomicWriteFile(lockPath, new Date().toISOString());

	try {
		let migrated = 0;
		let skipped = 0;

		for (const category of CATEGORIES) {
			const categoryResult = migrateCategory(jsonDir, vaultDir, category);
			migrated += categoryResult.migrated;
			skipped += categoryResult.skipped;
		}

		writeVaultVersion(vaultDir);
		return { migrated, skipped };
	} finally {
		try {
			rmSync(lockPath, { force: true });
		} catch (err) {
			getLogger().warn(`Migration: could not remove lock file ${lockPath}: ${String(err)}`);
		}
	}
}

function archiveSourceJson(jsonDir: string, jsonPath: string, category: MemoryCategory): void {
	if (!existsSync(jsonPath)) return;
	try {
		const legacyDir = path.join(jsonDir, '_legacy');
		mkdirSync(legacyDir, { recursive: true });
		const ts = new Date().toISOString().replace(/[:.]/g, '-');
		renameSync(jsonPath, path.join(legacyDir, `${category}-${ts}.json`));
	} catch (err) {
		getLogger().warn(`Migration: could not archive ${category}.json: ${String(err)}`);
	}
}

function buildEntryLinks(entry: MemoryEntry): Edge[] {
	const links: Edge[] = [];
	if (entry.supersedes) {
		links.push({ fromId: entry.id, kind: 'supersedes', toId: entry.supersedes });
	}
	return links;
}

function migrateCategory(jsonDir: string, vaultDir: string, category: MemoryCategory): CategoryMigrationResult {
	const jsonPath = path.join(jsonDir, `${category}.json`);
	const storeFile = readJsonStore(jsonPath);
	if (storeFile === null) return { migrated: 0, skipped: 0 };

	let migrated = 0;
	let skipped = 0;

	for (const entry of storeFile.entries) {
		const result = migrateEntry(entry, vaultDir, category);
		if (result === 'migrated') migrated++;
		else skipped++;
	}

	archiveSourceJson(jsonDir, jsonPath, category);
	return { migrated, skipped };
}

function migrateEntry(entry: MemoryEntry, vaultDir: string, category: MemoryCategory): 'migrated' | 'skipped' {
	const mdPath = path.join(vaultDir, category, `${entry.id}.md`);
	if (existsSync(mdPath)) return 'skipped';

	try {
		const links = buildEntryLinks(entry);
		atomicWriteFile(mdPath, serialiseMemoryFile(entry, links));
		return 'migrated';
	} catch (err) {
		getLogger().warn(`Migration: skipping entry ${entry.id}: ${String(err)}`);
		return 'skipped';
	}
}

function readJsonStore(jsonPath: string): MemoryStoreFile | null {
	try {
		const raw = readFileSync(jsonPath, 'utf-8');
		return JSON.parse(raw) as MemoryStoreFile;
	} catch {
		return null;
	}
}
