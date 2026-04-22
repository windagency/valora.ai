/**
 * Read and write the update-check state file atomically.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { UpdateCheckState } from './throttle';

import { UPDATE_CHECK_STATE_SCHEMA } from './state.schema';

const STATE_FILENAME = 'update-check.json';

export const DEFAULT_STATE: UpdateCheckState = {
	installedVersionAtCheck: null,
	lastCheckAt: new Date(0).toISOString(),
	lastSuccessAt: null,
	latestVersion: null,
	latestVersionFetchedAt: null,
	remindedForVersion: null,
	schemaVersion: 1
};

function cloneDefault(): UpdateCheckState {
	return { ...DEFAULT_STATE };
}

/**
 * Reads the update state file; returns DEFAULT_STATE on any error.
 */
export async function readUpdateState(stateDir: string): Promise<UpdateCheckState> {
	const filePath = path.join(stateDir, STATE_FILENAME);
	try {
		const raw = await fs.readFile(filePath, 'utf-8');
		const parsed = JSON.parse(raw) as unknown;
		const result = UPDATE_CHECK_STATE_SCHEMA.safeParse(parsed);
		if (!result.success) {
			return cloneDefault();
		}
		return result.data;
	} catch {
		return cloneDefault();
	}
}

/**
 * Atomically write the update state file with mode 0o600.
 * Uses write-then-rename on the same directory.
 */
export async function writeUpdateState(stateDir: string, state: UpdateCheckState): Promise<void> {
	await fs.mkdir(stateDir, { recursive: true });
	const filePath = path.join(stateDir, STATE_FILENAME);
	const tmpPath = `${filePath}.tmp`;
	const data = `${JSON.stringify(state, null, 2)}\n`;
	await fs.writeFile(tmpPath, data, { encoding: 'utf-8', mode: 0o600 });
	// Ensure mode (umask may have masked the mode above on some platforms)
	try {
		await fs.chmod(tmpPath, 0o600);
	} catch {
		// ignore; some filesystems (e.g. Windows) don't support chmod
	}
	await fs.rename(tmpPath, filePath);
}
