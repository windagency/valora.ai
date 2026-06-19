import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetPendingUpdateCheck, scheduleUpdateCheck, settleUpdateCheck } from './index';
import { DEFAULT_STATE, readUpdateState, writeUpdateState } from './state';
import type { UpdateCheckState } from './throttle';

let tmpDir: string;
let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
	tmpDir = path.join(os.tmpdir(), `valora-updater-idx-${randomUUID()}`);
	await fs.mkdir(tmpDir, { recursive: true });
	// reset the singleton and drain any in-flight fetch from a previous test
	resetPendingUpdateCheck();
	await settleUpdateCheck(0);
	fetchSpy = vi.spyOn(globalThis, 'fetch');
});

afterEach(async () => {
	fetchSpy.mockRestore();
	await fs.rm(tmpDir, { force: true, recursive: true });
});

async function flushAsync(): Promise<void> {
	// allow microtasks from readUpdateState / scheduleUpdateCheck to settle
	for (let i = 0; i < 20; i++) {
		await new Promise((r) => setImmediate(r));
	}
}

describe('settleUpdateCheck', () => {
	it('returns null when no check is pending', async () => {
		expect(await settleUpdateCheck(50)).toBeNull();
	});

	it('returns updated state and writes to disk on successful fetch', async () => {
		fetchSpy.mockResolvedValue(new Response(JSON.stringify({ version: '2.6.0' }), { status: 200 }));

		const now = new Date('2026-04-20T12:00:00Z');
		scheduleUpdateCheck(tmpDir, '2.5.0', 7, now);
		await flushAsync();

		const settled = await settleUpdateCheck(1000);
		expect(settled).not.toBeNull();
		expect(settled?.latestVersion).toBe('2.6.0');
		expect(settled?.installedVersionAtCheck).toBe('2.5.0');
		expect(settled?.lastCheckAt).toBe(now.toISOString());
		expect(settled?.lastSuccessAt).toBe(now.toISOString());

		const persisted = await readUpdateState(tmpDir);
		expect(persisted.latestVersion).toBe('2.6.0');
	});

	it('does not schedule a check when still inside the frequency window', async () => {
		const now = new Date('2026-04-20T12:00:00Z');
		// Write fresh state right now
		const recentState: UpdateCheckState = { ...DEFAULT_STATE, lastCheckAt: now.toISOString() };
		await writeUpdateState(tmpDir, recentState);

		scheduleUpdateCheck(tmpDir, '2.5.0', 7, now);
		await flushAsync();

		expect(fetchSpy).not.toHaveBeenCalled();
		expect(await settleUpdateCheck(50)).toBeNull();
	});

	it('times out when fetch is slow', async () => {
		fetchSpy.mockImplementation(
			() =>
				new Promise<Response>((resolve) => {
					setTimeout(() => resolve(new Response('{}', { status: 200 })), 500);
				})
		);

		const now = new Date('2026-04-20T12:00:00Z');
		scheduleUpdateCheck(tmpDir, '2.5.0', 7, now);
		await flushAsync();

		const settled = await settleUpdateCheck(50);
		expect(settled).toBeNull();
	});

	it('returns updated state even when fetch returns null (network error)', async () => {
		fetchSpy.mockRejectedValue(new Error('network'));

		const now = new Date('2026-04-20T12:00:00Z');
		scheduleUpdateCheck(tmpDir, '2.5.0', 7, now);
		await flushAsync();

		const settled = await settleUpdateCheck(1000);
		expect(settled).not.toBeNull();
		expect(settled?.latestVersion).toBeNull();
		expect(settled?.lastCheckAt).toBe(now.toISOString());
		// lastSuccessAt remains null because fetch failed
		expect(settled?.lastSuccessAt).toBeNull();
	});

	it('ignores a second scheduleUpdateCheck call while one is already pending', async () => {
		fetchSpy.mockResolvedValue(new Response(JSON.stringify({ version: '2.6.0' }), { status: 200 }));

		const now = new Date('2026-04-20T12:00:00Z');
		// Call twice — second call must be a no-op (first-write-wins)
		scheduleUpdateCheck(tmpDir, '2.5.0', 7, now);
		scheduleUpdateCheck(tmpDir, '2.5.1', 7, now);
		await flushAsync();

		await settleUpdateCheck(1000);

		// fetch must have been invoked at most once, not twice
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});
});
