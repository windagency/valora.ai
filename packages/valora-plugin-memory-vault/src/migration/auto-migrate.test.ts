import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resetAutoMigrationCache, runAutoMigrationIfNeeded } from './auto-migrate';

describe('runAutoMigrationIfNeeded', () => {
	let jsonDir: string;
	let vaultDir: string;

	beforeEach(() => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-auto-mig-'));
		jsonDir = path.join(root, 'legacy');
		vaultDir = path.join(root, 'vault');
		fs.mkdirSync(jsonDir, { recursive: true });
		fs.mkdirSync(vaultDir, { recursive: true });
		resetAutoMigrationCache();
	});

	afterEach(() => {
		resetAutoMigrationCache();
		try {
			fs.rmSync(path.dirname(jsonDir), { force: true, recursive: true });
		} catch {
			/* ignore cleanup errors */
		}
	});

	function writeLegacyEpisodic(): void {
		const payload = {
			entries: [
				{
					accessCount: 0,
					agentRole: 'lead',
					category: 'episodic',
					confidence: 'observed',
					content: 'legacy entry',
					createdAt: new Date().toISOString(),
					halfLifeDays: 7,
					id: 'mem-legacy-1',
					isError: false,
					lastAccessedAt: new Date().toISOString(),
					relatedPaths: [],
					sessionId: 'ses-legacy',
					source: { command: 'legacy' },
					tags: ['legacy'],
					updatedAt: new Date().toISOString()
				}
			],
			lastWrittenAt: new Date().toISOString(),
			version: 1
		};
		fs.writeFileSync(path.join(jsonDir, 'episodic.json'), JSON.stringify(payload, null, 2));
	}

	it('runs the migration when a legacy file is present and the vault has no version', () => {
		writeLegacyEpisodic();

		const result = runAutoMigrationIfNeeded(jsonDir, vaultDir);

		expect(result).not.toBeNull();
		expect(result!.migrated).toBe(1);
	});

	it('returns null and skips migration when no legacy files exist', () => {
		const result = runAutoMigrationIfNeeded(jsonDir, vaultDir);
		expect(result).toBeNull();
	});

	it('does not re-run a successful migration on a second call (cache hit)', () => {
		writeLegacyEpisodic();

		const first = runAutoMigrationIfNeeded(jsonDir, vaultDir);
		expect(first?.migrated).toBe(1);

		const second = runAutoMigrationIfNeeded(jsonDir, vaultDir);
		expect(second).toBeNull();
	});

	it('retries the migration on a subsequent call after a previous attempt threw', () => {
		writeLegacyEpisodic();

		// Pre-create a stale lock so the first migration attempt throws.
		const lockPath = path.join(vaultDir, '.migration.lock');
		fs.writeFileSync(lockPath, 'stale');

		expect(() => runAutoMigrationIfNeeded(jsonDir, vaultDir)).toThrow(/Migration lock/);

		// Operator cleans up the lock; retry must NOT be cached as "done".
		fs.rmSync(lockPath, { force: true });

		const retry = runAutoMigrationIfNeeded(jsonDir, vaultDir);
		expect(retry).not.toBeNull();
		expect(retry!.migrated).toBe(1);
	});
});
