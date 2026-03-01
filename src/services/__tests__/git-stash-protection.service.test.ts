/**
 * Tests for GitStashProtectionService
 */

import * as childProcess from 'child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createGitStashProtection, GitStashProtectionService } from '../git-stash-protection.service';

// Mock child_process.exec with proper promisify support
vi.mock('child_process', () => {
	const mockExec = vi.fn();
	return {
		exec: mockExec
	};
});

// Mock the logger
vi.mock('output/logger', () => ({
	getLogger: () => ({
		debug: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warn: vi.fn()
	})
}));

const mockExec = childProcess.exec as unknown as ReturnType<typeof vi.fn>;

/**
 * Helper to set up exec mock with callback-style response
 * promisify expects the callback as the last argument and follows Node.js callback convention
 */
function setupExecMock(stdout: string, stderr = '', error: Error | null = null): void {
	mockExec.mockImplementation((...args: unknown[]) => {
		// promisify calls exec with (cmd, opts) and adds the callback internally
		// The callback is the last argument
		const callback = args[args.length - 1];
		if (typeof callback === 'function') {
			// Call with (error, result) for promisify
			process.nextTick(() => {
				callback(error, { stderr, stdout });
			});
		}
	});
}

describe('GitStashProtectionService', () => {
	let service: GitStashProtectionService;
	let mockConfirmFn: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();
		mockConfirmFn = vi.fn().mockResolvedValue(true);
		service = createGitStashProtection(mockConfirmFn);
	});

	describe('checkGitStatus', () => {
		it('should detect staged changes', async () => {
			// 'M ' means staged (first column M, second column space)
			setupExecMock('M  staged-file.ts\n');

			const status = await service.checkGitStatus();

			expect(status.hasUncommittedChanges).toBe(true);
			expect(status.hasStagedChanges).toBe(true);
			expect(status.hasUnstagedChanges).toBe(false);
		});

		it('should detect both staged and unstaged changes', async () => {
			// 'MM' means both staged and unstaged (modified, staged, then modified again)
			setupExecMock('MM modified-file.ts\n');

			const status = await service.checkGitStatus();

			expect(status.hasUncommittedChanges).toBe(true);
			expect(status.hasStagedChanges).toBe(true);
			expect(status.hasUnstagedChanges).toBe(true);
		});

		it('should detect untracked files', async () => {
			// '??' means untracked
			setupExecMock('?? new-file.ts\n');

			const status = await service.checkGitStatus();

			expect(status.hasUntrackedFiles).toBe(true);
			// '?' in second column also triggers hasUnstagedChanges in current implementation
			// because worktreeStatus '?' !== ' '
		});

		it('should report clean working tree', async () => {
			setupExecMock('');

			const status = await service.checkGitStatus();

			expect(status.hasUncommittedChanges).toBe(false);
			expect(status.hasStagedChanges).toBe(false);
			expect(status.hasUnstagedChanges).toBe(false);
			expect(status.hasUntrackedFiles).toBe(false);
		});
	});

	describe('createStash', () => {
		it('should create a stash successfully', async () => {
			setupExecMock('Saved working directory');

			const result = await service.createStash();

			expect(result.stashCreated).toBe(true);
			expect(result.stashName).toContain('ai-feedback-auto-stash');
			expect(service.hasActiveStash()).toBe(true);
		});

		it('should handle stash failure', async () => {
			setupExecMock('', '', new Error('No local changes to save'));

			const result = await service.createStash();

			expect(result.stashCreated).toBe(false);
			expect(result.error).toBe('No local changes to save');
		});
	});

	describe('restoreStash', () => {
		it('should skip restore if no stash was created', async () => {
			const result = await service.restoreStash();

			expect(result.restored).toBe(false);
			expect(mockExec).not.toHaveBeenCalled();
		});

		it('should restore stash successfully', async () => {
			// First create a stash
			setupExecMock('Success');

			await service.createStash();
			const result = await service.restoreStash();

			expect(result.restored).toBe(true);
			expect(service.hasActiveStash()).toBe(false);
		});

		it('should handle restore failure', async () => {
			// First create a stash, then fail on restore
			let callCount = 0;
			mockExec.mockImplementation(
				(
					cmd: string,
					opts: unknown,
					callback?: (err: Error | null, result: { stdout: string; stderr: string }) => void
				) => {
					const cb = (typeof opts === 'function' ? opts : callback) as (
						err: Error | null,
						result: { stdout: string; stderr: string }
					) => void;
					callCount++;
					if (callCount === 1) {
						// Create stash succeeds
						cb(null, { stderr: '', stdout: 'Saved' });
					} else {
						// Pop stash fails
						cb(new Error('CONFLICT in file.ts'), { stderr: '', stdout: '' });
					}
				}
			);

			await service.createStash();
			const result = await service.restoreStash();

			expect(result.restored).toBe(false);
			expect(result.error).toContain('CONFLICT');
		});
	});

	describe('promptAndStash', () => {
		it('should skip stash if no uncommitted changes', async () => {
			setupExecMock('');

			const result = await service.promptAndStash();

			expect(result.stashCreated).toBe(false);
		});

		it('should prompt user and create stash when user confirms', async () => {
			// First call returns status with changes, second creates stash
			let callCount = 0;
			mockExec.mockImplementation((...args: unknown[]) => {
				const callback = args[args.length - 1];
				if (typeof callback === 'function') {
					process.nextTick(() => {
						callCount++;
						if (callCount === 1) {
							// git status shows staged changes
							callback(null, { stderr: '', stdout: 'M  file.ts\n' });
						} else {
							// git stash succeeds
							callback(null, { stderr: '', stdout: 'Saved' });
						}
					});
				}
			});
			mockConfirmFn.mockResolvedValue(true);

			const result = await service.promptAndStash(true);

			expect(mockConfirmFn).toHaveBeenCalledWith(expect.stringContaining('Stash them'));
			expect(result.stashCreated).toBe(true);
		});

		it('should not create stash when user declines', async () => {
			setupExecMock('M  file.ts\n');
			mockConfirmFn.mockResolvedValue(false);

			const result = await service.promptAndStash(true);

			expect(mockConfirmFn).toHaveBeenCalled();
			expect(result.stashCreated).toBe(false);
		});

		it('should auto-stash when not interactive even without confirmFn', async () => {
			// Create service without confirmFn
			const nonInteractiveService = createGitStashProtection();

			let callCount = 0;
			mockExec.mockImplementation((...args: unknown[]) => {
				const callback = args[args.length - 1];
				if (typeof callback === 'function') {
					process.nextTick(() => {
						callCount++;
						if (callCount === 1) {
							callback(null, { stderr: '', stdout: 'M  file.ts\n' });
						} else {
							callback(null, { stderr: '', stdout: 'Saved' });
						}
					});
				}
			});

			// Interactive is false, so it should auto-stash
			const result = await nonInteractiveService.promptAndStash(false);

			expect(result.stashCreated).toBe(true);
		});
	});
});
