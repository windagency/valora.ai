import { getRuntimeDataDir } from '@windagency/valora-runtime';
import * as path from 'node:path';

/**
 * Resolve the default per-project vault directory.
 *
 * The vault is the authoritative memory store (ADR-013). All production code
 * paths — pipeline, CLI, services — must agree on this single location so the
 * agent and the operator are reading and writing the same data.
 */
export function getDefaultVaultDir(): string {
	return path.join(getRuntimeDataDir(), 'memory');
}

/**
 * Resolve the directory that historically held the legacy JSON memory stores
 * (`episodic.json` etc.). Identical to {@link getDefaultVaultDir} because the
 * vault was introduced under the same root: the auto-migration helper inspects
 * this directory for legacy `*.json` files and, if found, migrates them in
 * place into the per-memory Markdown vault.
 */
export function getLegacyJsonDir(): string {
	return getDefaultVaultDir();
}
