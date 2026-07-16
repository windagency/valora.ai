import { existsSync, mkdtempSync, promises as fs, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('output/logger', () => ({
	getLogger: () => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() })
}));

import { FileLockManager } from './file-lock';

describe('FileLockManager', () => {
	let tmpDir: string;
	let filePath: string;
	let manager: FileLockManager;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), 'valora-file-lock-test-'));
		filePath = join(tmpDir, 'data.json');
		manager = new FileLockManager();
	});

	afterEach(() => {
		rmSync(tmpDir, { force: true, recursive: true });
	});

	describe('acquireLock / releaseLock', () => {
		it('acquires a lock and creates a real lock file on disk', async () => {
			const lock = await manager.acquireLock(filePath, 'worktree-a');

			expect(lock.acquired_by).toBe('worktree-a');
			expect(existsSync(`${filePath}.lock`)).toBe(true);
		});

		it('releases a lock, removing the lock file so a subsequent acquire succeeds immediately', async () => {
			const lock = await manager.acquireLock(filePath, 'worktree-a');

			await manager.releaseLock(filePath, lock.lock_id);

			expect(existsSync(`${filePath}.lock`)).toBe(false);
			await expect(manager.acquireLock(filePath, 'worktree-b')).resolves.toMatchObject({ acquired_by: 'worktree-b' });
		});

		it('rejects releasing with the wrong lock_id (not force), leaving the lock file in place', async () => {
			const lock = await manager.acquireLock(filePath, 'worktree-a');

			await expect(manager.releaseLock(filePath, 'someone-elses-lock-id')).rejects.toThrow(/lock ID mismatch/);
			expect(existsSync(`${filePath}.lock`)).toBe(true);

			// Clean up with the real id so afterEach's rmSync isn't masking a leaked lock.
			await manager.releaseLock(filePath, lock.lock_id);
		});

		it('force-releases regardless of lock_id', async () => {
			await manager.acquireLock(filePath, 'worktree-a');

			await expect(manager.releaseLock(filePath, 'wrong-id', true)).resolves.toBeUndefined();
			expect(existsSync(`${filePath}.lock`)).toBe(false);
		});

		it('releasing a lock that was never acquired resolves without throwing', async () => {
			await expect(manager.releaseLock(filePath, 'never-acquired-id')).resolves.toBeUndefined();
		});

		it('blocks a second acquire attempt while the first lock is still held and valid, eventually throwing after retries', async () => {
			await manager.acquireLock(filePath, 'worktree-a', { timeout_ms: 60_000 });

			await expect(manager.acquireLock(filePath, 'worktree-b', { retries: 1, retry_delay_ms: 5 })).rejects.toThrow(
				/Failed to acquire lock .* after 1 retries/
			);
		});

		it('reclaims a stale (expired) lock instead of blocking on it', async () => {
			// Write an already-expired lock directly, simulating a lock left
			// behind by a process that died before releasing it.
			await fs.writeFile(
				`${filePath}.lock`,
				JSON.stringify({
					acquired_at: new Date(Date.now() - 10_000).toISOString(),
					acquired_by: 'dead-worktree',
					expires_at: new Date(Date.now() - 5000).toISOString(),
					lock_id: 'stale-lock-id'
				}),
				{ flag: 'wx' }
			);

			const lock = await manager.acquireLock(filePath, 'worktree-b', { retries: 1, retry_delay_ms: 5 });

			expect(lock.acquired_by).toBe('worktree-b');
			expect(lock.lock_id).not.toBe('stale-lock-id');
		});

		it('allows exactly one winner when many concurrent attempts race for the same lock', async () => {
			// Fires all attempts together (no sequential awaiting) so this
			// actually exercises the atomic-create race, not just two calls that
			// happen to run one after the other — a broken, non-atomic
			// (existsSync-then-writeFileSync) reimplementation would let more
			// than one attempt observe "no lock yet" and both "succeed".
			const attemptCount = 20;
			const attempts = Array.from({ length: attemptCount }, (_, i) =>
				manager.acquireLock(filePath, `worktree-${i}`, { retries: 0 })
			);

			const results = await Promise.allSettled(attempts);

			const fulfilled = results.filter((r) => r.status === 'fulfilled');
			const rejected = results.filter((r) => r.status === 'rejected');
			expect(fulfilled).toHaveLength(1);
			expect(rejected).toHaveLength(attemptCount - 1);
		});

		it('reclaims a lock that expires while the second acquirer is retrying', async () => {
			await manager.acquireLock(filePath, 'worktree-a', { timeout_ms: 50 });

			const lock = await manager.acquireLock(filePath, 'worktree-b', { retries: 5, retry_delay_ms: 30 });

			expect(lock.acquired_by).toBe('worktree-b');
		});
	});

	describe('isLocked / getLockInfo', () => {
		it('reports locked with the lock details for a fresh lock', async () => {
			const lock = await manager.acquireLock(filePath, 'worktree-a');

			await expect(manager.isLocked(filePath)).resolves.toBe(true);
			await expect(manager.getLockInfo(filePath)).resolves.toMatchObject({ acquired_by: 'worktree-a' });

			await manager.releaseLock(filePath, lock.lock_id);
		});

		it('reports not locked when no lock file exists', async () => {
			await expect(manager.isLocked(filePath)).resolves.toBe(false);
			await expect(manager.getLockInfo(filePath)).resolves.toBeNull();
		});

		it('reports not locked for an expired lock, without removing it', async () => {
			await fs.writeFile(
				`${filePath}.lock`,
				JSON.stringify({
					acquired_at: new Date(Date.now() - 10_000).toISOString(),
					acquired_by: 'dead-worktree',
					expires_at: new Date(Date.now() - 5000).toISOString(),
					lock_id: 'stale-lock-id'
				})
			);

			await expect(manager.isLocked(filePath)).resolves.toBe(false);
			await expect(manager.getLockInfo(filePath)).resolves.toBeNull();
			expect(existsSync(`${filePath}.lock`)).toBe(true);
		});
	});

	describe('readWithLock / writeWithLock / updateWithLock', () => {
		it('writeWithLock writes the file atomically, releases the lock, and leaves no temp file behind', async () => {
			await manager.writeWithLock(filePath, { hello: 'world' }, 'worktree-a');

			const written = JSON.parse(await fs.readFile(filePath, 'utf-8'));
			expect(written).toEqual({ hello: 'world' });
			await expect(manager.isLocked(filePath)).resolves.toBe(false);
			const dirEntries = await fs.readdir(tmpDir);
			expect(dirEntries.some((f) => f.includes('.tmp.'))).toBe(false);
		});

		it('readWithLock reads existing file content and releases the lock afterwards', async () => {
			await fs.writeFile(filePath, JSON.stringify({ value: 42 }));

			const result = await manager.readWithLock<{ value: number }>(filePath, 'worktree-a');

			expect(result).toEqual({ value: 42 });
			await expect(manager.isLocked(filePath)).resolves.toBe(false);
		});

		it('readWithLock returns null when the file does not exist', async () => {
			await expect(manager.readWithLock(filePath, 'worktree-a')).resolves.toBeNull();
		});

		it('updateWithLock performs a real read-modify-write round trip', async () => {
			await manager.writeWithLock(filePath, { count: 1 }, 'worktree-a');

			const updated = await manager.updateWithLock<{ count: number }>(filePath, 'worktree-b', (current) => ({
				count: (current?.count ?? 0) + 1
			}));

			expect(updated).toEqual({ count: 2 });
			const onDisk = JSON.parse(await fs.readFile(filePath, 'utf-8'));
			expect(onDisk).toEqual({ count: 2 });
		});

		it('updateWithLock passes null to the updater when the file does not yet exist', async () => {
			const result = await manager.updateWithLock<{ count: number }>(filePath, 'worktree-a', (current) => ({
				count: (current?.count ?? 0) + 1
			}));

			expect(result).toEqual({ count: 1 });
		});
	});

	describe('appendToArray', () => {
		it('initializes the array when the file does not exist', async () => {
			await manager.appendToArray(filePath, 'first-item', 'worktree-a');

			const onDisk = JSON.parse(await fs.readFile(filePath, 'utf-8'));
			expect(onDisk).toEqual({ items: ['first-item'] });
		});

		it('appends to an existing array under a custom key without disturbing other fields', async () => {
			await manager.writeWithLock(filePath, { events: ['a'], other: 'preserved' }, 'worktree-a');

			await manager.appendToArray(filePath, 'b', 'worktree-b', 'events');

			const onDisk = JSON.parse(await fs.readFile(filePath, 'utf-8'));
			expect(onDisk).toEqual({ events: ['a', 'b'], other: 'preserved' });
		});
	});

	describe('cleanupExpiredLocks / forceRemoveAllLocks', () => {
		it('removes only expired lock files, leaving valid ones in place', async () => {
			const validLock = await manager.acquireLock(join(tmpDir, 'valid.json'), 'worktree-a', { timeout_ms: 60_000 });
			await fs.writeFile(
				join(tmpDir, 'expired.json.lock'),
				JSON.stringify({
					acquired_at: new Date(Date.now() - 10_000).toISOString(),
					acquired_by: 'dead-worktree',
					expires_at: new Date(Date.now() - 5000).toISOString(),
					lock_id: 'stale-lock-id'
				})
			);

			const cleaned = await manager.cleanupExpiredLocks(tmpDir);

			expect(cleaned).toBe(1);
			expect(existsSync(join(tmpDir, 'expired.json.lock'))).toBe(false);
			expect(existsSync(`${join(tmpDir, 'valid.json')}.lock`)).toBe(true);

			await manager.releaseLock(join(tmpDir, 'valid.json'), validLock.lock_id);
		});

		it('removes unparseable lock files too', async () => {
			await fs.writeFile(join(tmpDir, 'corrupt.json.lock'), 'not valid json');

			const cleaned = await manager.cleanupExpiredLocks(tmpDir);

			expect(cleaned).toBe(1);
			expect(existsSync(join(tmpDir, 'corrupt.json.lock'))).toBe(false);
		});

		it('forceRemoveAllLocks removes every lock file regardless of expiry', async () => {
			const validLock = await manager.acquireLock(join(tmpDir, 'valid.json'), 'worktree-a', { timeout_ms: 60_000 });

			const removed = await manager.forceRemoveAllLocks(tmpDir);

			expect(removed).toBe(1);
			expect(existsSync(`${join(tmpDir, 'valid.json')}.lock`)).toBe(false);
			// Lock already gone — releasing again must still be a no-op, not a throw.
			await expect(manager.releaseLock(join(tmpDir, 'valid.json'), validLock.lock_id)).resolves.toBeUndefined();
		});
	});
});
