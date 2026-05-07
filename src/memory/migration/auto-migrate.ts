import { existsSync } from 'node:fs';
import * as path from 'node:path';

import { getLogger } from 'output/logger';

import { migrateJsonToVault, type MigrationResult } from './json-to-vault';
import { readVaultVersion } from './vault-version';

const LEGACY_FILES = ['episodic.json', 'semantic.json', 'decisions.json'];

const checked = new Set<string>();

/**
 * Run the legacy JSON → vault migration if any legacy file is present and the
 * vault has not yet been stamped with a schema version.
 *
 * The check is intentionally cheap (a few `existsSync` calls) so it can fire
 * on every process boot without measurable overhead. The migration itself is
 * idempotent — see `migrateJsonToVault`.
 *
 * Within a single process, each `vaultDir` is only checked once: subsequent
 * calls become cache hits to keep per-stage hot paths free of stat syscalls.
 *
 * Returns:
 *   - The {@link MigrationResult} when a migration ran.
 *   - `null` when no legacy data was found and no migration was needed.
 */
export function runAutoMigrationIfNeeded(jsonDir: string, vaultDir: string): MigrationResult | null {
	const key = `${path.resolve(jsonDir)}::${path.resolve(vaultDir)}`;
	if (checked.has(key)) return null;

	if (!hasLegacyFiles(jsonDir)) {
		checked.add(key);
		return null;
	}
	if (readVaultVersion(vaultDir) !== null) {
		// Vault already stamped — assume earlier migration already handled the data.
		checked.add(key);
		return null;
	}

	getLogger().warn('Legacy JSON memory detected — auto-migrating to vault.');
	const result = migrateJsonToVault({ jsonDir, vaultDir });
	// Cache only after a successful migration so a thrown attempt can be
	// retried on the next call instead of being silently swallowed by the cache.
	checked.add(key);
	return result;
}

/** For tests — drop the in-process cache so a re-run will recheck disk. */
export function resetAutoMigrationCache(): void {
	checked.clear();
}

function hasLegacyFiles(jsonDir: string): boolean {
	return LEGACY_FILES.some((name) => existsSync(path.join(jsonDir, name)));
}
