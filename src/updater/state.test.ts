import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_STATE, readUpdateState, writeUpdateState } from './state';
import type { UpdateCheckState } from './throttle';

let tmpDir: string;

beforeEach(async () => {
	tmpDir = path.join(os.tmpdir(), `valora-updater-${randomUUID()}`);
	await fs.mkdir(tmpDir, { recursive: true });
});

afterEach(async () => {
	await fs.rm(tmpDir, { force: true, recursive: true });
});

describe('readUpdateState', () => {
	it('returns DEFAULT_STATE when the file is missing', async () => {
		const state = await readUpdateState(tmpDir);
		expect(state).toEqual(DEFAULT_STATE);
	});

	it('returns parsed state for a valid v2 file', async () => {
		const fixture: UpdateCheckState = {
			schemaVersion: 2,
			lastCheckAt: '2026-04-20T00:00:00.000Z',
			lastSuccessAt: '2026-04-20T00:00:00.000Z',
			latestVersion: '2.6.0',
			latestVersionFetchedAt: '2026-04-20T00:00:00.000Z',
			remindedForVersion: null,
			installedVersionAtCheck: '2.5.0',
			plugins: {}
		};
		await fs.writeFile(path.join(tmpDir, 'update-check.json'), JSON.stringify(fixture));
		expect(await readUpdateState(tmpDir)).toEqual(fixture);
	});

	it('migrates a valid v1 file to v2 by adding an empty plugins map', async () => {
		const v1Fixture = {
			schemaVersion: 1,
			lastCheckAt: '2026-04-20T00:00:00.000Z',
			lastSuccessAt: '2026-04-20T00:00:00.000Z',
			latestVersion: '2.6.0',
			latestVersionFetchedAt: '2026-04-20T00:00:00.000Z',
			remindedForVersion: null,
			installedVersionAtCheck: '2.5.0'
		};
		await fs.writeFile(path.join(tmpDir, 'update-check.json'), JSON.stringify(v1Fixture));

		const state = await readUpdateState(tmpDir);
		expect(state.schemaVersion).toBe(2);
		expect(state.latestVersion).toBe('2.6.0');
		expect(state.plugins).toEqual({});
	});

	it('returns DEFAULT_STATE when JSON is malformed', async () => {
		await fs.writeFile(path.join(tmpDir, 'update-check.json'), '{not json');
		expect(await readUpdateState(tmpDir)).toEqual(DEFAULT_STATE);
	});

	it('returns DEFAULT_STATE when schemaVersion is an unrecognised value', async () => {
		await fs.writeFile(path.join(tmpDir, 'update-check.json'), JSON.stringify({ schemaVersion: 99, lastCheckAt: 'x' }));
		expect(await readUpdateState(tmpDir)).toEqual(DEFAULT_STATE);
	});

	it('returns DEFAULT_STATE when latestVersion is a number instead of a string', async () => {
		await fs.writeFile(
			path.join(tmpDir, 'update-check.json'),
			JSON.stringify({
				schemaVersion: 2,
				lastCheckAt: '2026-04-20T00:00:00.000Z',
				lastSuccessAt: null,
				latestVersion: 42,
				latestVersionFetchedAt: null,
				remindedForVersion: null,
				installedVersionAtCheck: null,
				plugins: {}
			})
		);
		expect(await readUpdateState(tmpDir)).toEqual(DEFAULT_STATE);
	});

	it('returns DEFAULT_STATE when schemaVersion field is missing', async () => {
		await fs.writeFile(
			path.join(tmpDir, 'update-check.json'),
			JSON.stringify({
				lastCheckAt: '2026-04-20T00:00:00.000Z',
				lastSuccessAt: null,
				latestVersion: '2.6.0',
				latestVersionFetchedAt: null,
				remindedForVersion: null,
				installedVersionAtCheck: null
			})
		);
		expect(await readUpdateState(tmpDir)).toEqual(DEFAULT_STATE);
	});

	it('accepts a valid v2 file with extra unknown fields and strips them', async () => {
		const fixture: UpdateCheckState = {
			schemaVersion: 2,
			lastCheckAt: '2026-04-20T00:00:00.000Z',
			lastSuccessAt: null,
			latestVersion: '2.6.0',
			latestVersionFetchedAt: null,
			remindedForVersion: null,
			installedVersionAtCheck: null,
			plugins: {}
		};
		await fs.writeFile(
			path.join(tmpDir, 'update-check.json'),
			JSON.stringify({ ...fixture, unexpectedField: 'should-be-stripped' })
		);
		expect(await readUpdateState(tmpDir)).toEqual(fixture);
	});

	it('preserves per-plugin entries in a v2 file', async () => {
		const fixture: UpdateCheckState = {
			schemaVersion: 2,
			lastCheckAt: '2026-04-20T00:00:00.000Z',
			lastSuccessAt: null,
			latestVersion: null,
			latestVersionFetchedAt: null,
			remindedForVersion: null,
			installedVersionAtCheck: null,
			plugins: {
				'valora-plugin-rtk': {
					latestVersion: '2.0.0',
					latestVersionFetchedAt: '2026-04-20T00:00:00.000Z',
					remindedForVersion: null
				}
			}
		};
		await fs.writeFile(path.join(tmpDir, 'update-check.json'), JSON.stringify(fixture));
		const state = await readUpdateState(tmpDir);
		expect(state.plugins['valora-plugin-rtk']?.latestVersion).toBe('2.0.0');
	});
});

describe('writeUpdateState', () => {
	it('writes the file with correct JSON content', async () => {
		const state: UpdateCheckState = {
			...DEFAULT_STATE,
			latestVersion: '2.6.0'
		};
		await writeUpdateState(tmpDir, state);
		const raw = await fs.readFile(path.join(tmpDir, 'update-check.json'), 'utf-8');
		expect(JSON.parse(raw)).toEqual(state);
	});

	it('sets file mode to 0o600', async () => {
		await writeUpdateState(tmpDir, DEFAULT_STATE);
		const stat = await fs.stat(path.join(tmpDir, 'update-check.json'));
		// Only compare permission bits
		expect(stat.mode & 0o777).toBe(0o600);
	});

	it('round-trips state through write then read', async () => {
		const state: UpdateCheckState = {
			schemaVersion: 2,
			lastCheckAt: '2026-04-20T10:00:00.000Z',
			lastSuccessAt: '2026-04-20T10:00:00.000Z',
			latestVersion: '2.7.0',
			latestVersionFetchedAt: '2026-04-20T10:00:00.000Z',
			remindedForVersion: '2.7.0',
			installedVersionAtCheck: '2.5.0',
			plugins: {}
		};
		await writeUpdateState(tmpDir, state);
		const read = await readUpdateState(tmpDir);
		expect(read).toEqual(state);
	});

	it('creates the directory if it does not exist', async () => {
		const nested = path.join(tmpDir, 'nested', 'dir');
		await writeUpdateState(nested, DEFAULT_STATE);
		const stat = await fs.stat(path.join(nested, 'update-check.json'));
		expect(stat.isFile()).toBe(true);
	});
});
