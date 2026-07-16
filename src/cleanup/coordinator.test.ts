import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Config } from 'config/schema';

let runtimeDataDir: string;
let hasConfig: boolean;
vi.mock('utils/paths', async (importOriginal) => {
	const actual = await importOriginal<typeof import('utils/paths')>();
	return {
		...actual,
		getRuntimeDataDir: () => runtimeDataDir,
		hasAnyValoraConfig: () => hasConfig
	};
});

let mockLoad: () => Promise<Partial<Config>>;
vi.mock('config/loader', () => ({
	getConfigLoader: () => ({
		load: async () => mockLoad()
	})
}));

import {
	getLogCleanupScheduler,
	getSessionCleanupScheduler,
	initializeCleanupSchedulers,
	stopAllCleanupSchedulers
} from './coordinator';

const ENABLED_BOTH: Partial<Config> = {
	logging: {
		cleanup_interval_hours: 24,
		daily_file_max_size_mb: 10,
		dry_run: true,
		enabled: true
	} as Config['logging'],
	sessions: {
		cleanup_interval_hours: 24,
		dry_run: true,
		enabled: true
	} as Config['sessions']
};

describe('cleanup/coordinator lifecycle (real schedulers, mocked config/paths)', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = mkdtempSync(path.join(tmpdir(), 'valora-cleanup-coordinator-'));
		runtimeDataDir = tmpDir;
		hasConfig = true;
		mockLoad = async () => ENABLED_BOTH;
	});

	afterEach(() => {
		stopAllCleanupSchedulers();
		rmSync(tmpDir, { force: true, recursive: true });
	});

	it('creates no schedulers when there is no valora config at all', async () => {
		hasConfig = false;

		await initializeCleanupSchedulers();

		expect(getLogCleanupScheduler()).toBeNull();
		expect(getSessionCleanupScheduler()).toBeNull();
	});

	it('creates both schedulers, started, when config is present and both are enabled', async () => {
		await initializeCleanupSchedulers();

		const logScheduler = getLogCleanupScheduler();
		const sessionScheduler = getSessionCleanupScheduler();
		expect(logScheduler).not.toBeNull();
		expect(sessionScheduler).not.toBeNull();
		expect(logScheduler?.isSchedulerRunning()).toBe(true);
		expect(sessionScheduler?.isSchedulerRunning()).toBe(true);
	});

	it('only creates the log scheduler when session retention is disabled', async () => {
		mockLoad = async () => ({
			...ENABLED_BOTH,
			sessions: { ...ENABLED_BOTH.sessions, enabled: false } as Config['sessions']
		});

		await initializeCleanupSchedulers();

		expect(getLogCleanupScheduler()).not.toBeNull();
		expect(getSessionCleanupScheduler()).toBeNull();
	});

	it('only creates the session scheduler when log retention is disabled', async () => {
		mockLoad = async () => ({
			...ENABLED_BOTH,
			logging: { ...ENABLED_BOTH.logging, enabled: false } as Config['logging']
		});

		await initializeCleanupSchedulers();

		expect(getLogCleanupScheduler()).toBeNull();
		expect(getSessionCleanupScheduler()).not.toBeNull();
	});

	it('is idempotent: a second call after initialization completes is a no-op that keeps the same instances', async () => {
		await initializeCleanupSchedulers();
		const logScheduler = getLogCleanupScheduler();
		const sessionScheduler = getSessionCleanupScheduler();

		await initializeCleanupSchedulers();

		expect(getLogCleanupScheduler()).toBe(logScheduler);
		expect(getSessionCleanupScheduler()).toBe(sessionScheduler);
	});

	it('concurrent calls share the same in-flight initialization and produce exactly one pair of schedulers', async () => {
		await Promise.all([initializeCleanupSchedulers(), initializeCleanupSchedulers()]);

		expect(getLogCleanupScheduler()).not.toBeNull();
		expect(getSessionCleanupScheduler()).not.toBeNull();
	});

	it('rejects and leaves the coordinator retryable when config loading fails', async () => {
		mockLoad = async () => {
			throw new Error('config load failed');
		};

		await expect(initializeCleanupSchedulers()).rejects.toThrow('config load failed');

		// A failed initialization must not get stuck "in-flight" forever — a
		// subsequent call with working config should be able to succeed.
		mockLoad = async () => ENABLED_BOTH;
		await initializeCleanupSchedulers();

		expect(getLogCleanupScheduler()).not.toBeNull();
	});

	it('stopAllCleanupSchedulers stops and clears both schedulers, and allows re-initialization afterward', async () => {
		await initializeCleanupSchedulers();
		const logScheduler = getLogCleanupScheduler();
		const sessionScheduler = getSessionCleanupScheduler();

		stopAllCleanupSchedulers();

		expect(logScheduler?.isSchedulerRunning()).toBe(false);
		expect(sessionScheduler?.isSchedulerRunning()).toBe(false);
		expect(getLogCleanupScheduler()).toBeNull();
		expect(getSessionCleanupScheduler()).toBeNull();

		await initializeCleanupSchedulers();

		expect(getLogCleanupScheduler()).not.toBeNull();
		expect(getLogCleanupScheduler()).not.toBe(logScheduler);
	});

	it('stopAllCleanupSchedulers is a safe no-op when nothing was ever initialized', () => {
		expect(() => stopAllCleanupSchedulers()).not.toThrow();
		expect(getLogCleanupScheduler()).toBeNull();
		expect(getSessionCleanupScheduler()).toBeNull();
	});
});
