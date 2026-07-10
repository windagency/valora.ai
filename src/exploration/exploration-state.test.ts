/**
 * ExplorationStateManager path-safety tests.
 *
 * `explorationId` reaches `status`/`compare`/`dashboard`/`cleanup`'s CLI
 * handlers as a raw positional argument and flows unvalidated into every
 * path-building method here via `getExplorationDir()` — `path.join(base,
 * '../../../../etc')` walks straight out of the explorations directory, with
 * no equivalent to `WorktreeManager`'s `InputValidator.validatePath`/
 * `validateBranchName` calls. `deleteExploration()` (the `cleanup` command's
 * path) turns that into an arbitrary recursive directory deletion primitive.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { InputValidationError } from 'utils/input-validator';

import { ExplorationStateManager } from './exploration-state';

describe('ExplorationStateManager — explorationId path safety', () => {
	let explorationsDir: string;
	let manager: ExplorationStateManager;

	beforeEach(() => {
		explorationsDir = mkdtempSync(path.join(tmpdir(), 'valora-explorations-'));
		manager = new ExplorationStateManager(explorationsDir);
	});

	afterEach(() => {
		rmSync(explorationsDir, { force: true, recursive: true });
	});

	it('rejects a traversal explorationId when building the exploration directory path', () => {
		expect(() => manager.getExplorationDir('../../../../etc')).toThrow(InputValidationError);
	});

	it('rejects a traversal explorationId before loadExploration reads any file', async () => {
		await expect(manager.loadExploration('../../../../etc/passwd')).rejects.toThrow(InputValidationError);
	});

	it('rejects a traversal explorationId before deleteExploration can delete anything', async () => {
		// The highest-impact path: real docker/deleteExploration deletes
		// `getExplorationDir(explorationId)` recursively with force:true. A
		// crafted ID pointing outside explorationsDir must never reach fs.rm.
		const outsideDir = mkdtempSync(path.join(tmpdir(), 'valora-outside-'));
		const canaryFile = path.join(outsideDir, 'important.txt');
		writeFileSync(canaryFile, 'do not delete me');

		const traversalId = path.relative(explorationsDir, outsideDir);
		await expect(manager.deleteExploration(traversalId)).rejects.toThrow(InputValidationError);

		expect(() => writeFileSync(canaryFile, 'still here', { flag: 'r+' })).not.toThrow();
		rmSync(outsideDir, { force: true, recursive: true });
	});

	it('still allows a well-formed exploration ID', () => {
		expect(() => manager.getExplorationDir('exp-abc123')).not.toThrow();
	});

	it('still round-trips a real exploration end-to-end (create/load/delete all use the same validated ID)', async () => {
		const exploration = await manager.createExploration('test task', {
			auto_merge: false,
			branches: 1,
			cpu_limit: '1',
			docker_image: 'node:20',
			memory_limit: '512m',
			mode: 'parallel',
			no_cleanup: false,
			port_range_end: 4000,
			port_range_start: 3000,
			timeout_minutes: 10
		});
		const loaded = await manager.loadExploration(exploration.id);
		expect(loaded.id).toBe(exploration.id);

		await manager.deleteExploration(exploration.id);
		await expect(manager.loadExploration(exploration.id)).rejects.toThrow();
	});
});
