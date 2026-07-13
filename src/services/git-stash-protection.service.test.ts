/**
 * Tests for GitStashProtectionService
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createGitStashProtection, GitStashProtectionService } from './git-stash-protection.service';

const mockExecute = vi.fn();
vi.mock('utils/safe-exec', () => ({
	SafeExecutor: {
		execute: (...args: unknown[]) => mockExecute(...args)
	}
}));

vi.mock('output/logger', () => ({
	getLogger: () => ({
		debug: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warn: vi.fn()
	})
}));

function queueResult(stdout: string, stderr = ''): void {
	mockExecute.mockResolvedValueOnce({ exitCode: 0, stderr, stdout });
}

function queueError(message: string): void {
	mockExecute.mockRejectedValueOnce(new Error(message));
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
		it('calls SafeExecutor.execute("git", [...]) with no shell involved', async () => {
			queueResult('M  staged-file.ts\n');

			await service.checkGitStatus();

			expect(mockExecute).toHaveBeenCalledWith('git', ['status', '--porcelain'], expect.anything());
		});

		it('should detect staged changes', async () => {
			// 'M ' means staged (first column M, second column space)
			queueResult('M  staged-file.ts\n');

			const status = await service.checkGitStatus();

			expect(status.hasUncommittedChanges).toBe(true);
			expect(status.hasStagedChanges).toBe(true);
			expect(status.hasUnstagedChanges).toBe(false);
		});

		it('should detect both staged and unstaged changes', async () => {
			// 'MM' means both staged and unstaged (modified, staged, then modified again)
			queueResult('MM modified-file.ts\n');

			const status = await service.checkGitStatus();

			expect(status.hasUncommittedChanges).toBe(true);
			expect(status.hasStagedChanges).toBe(true);
			expect(status.hasUnstagedChanges).toBe(true);
		});

		it('should detect untracked files', async () => {
			// '??' means untracked
			queueResult('?? new-file.ts\n');

			const status = await service.checkGitStatus();

			expect(status.hasUntrackedFiles).toBe(true);
			// '?' in second column also triggers hasUnstagedChanges in current implementation
			// because worktreeStatus '?' !== ' '
		});

		it('should report clean working tree', async () => {
			queueResult('');

			const status = await service.checkGitStatus();

			expect(status.hasUncommittedChanges).toBe(false);
			expect(status.hasStagedChanges).toBe(false);
			expect(status.hasUnstagedChanges).toBe(false);
			expect(status.hasUntrackedFiles).toBe(false);
		});
	});

	describe('createStash', () => {
		it('passes the stash message as a literal array element to git, with no shell involved', async () => {
			queueResult('Saved working directory');

			await service.createStash();

			expect(mockExecute).toHaveBeenCalledWith(
				'git',
				['stash', 'push', '-u', '-m', expect.stringContaining('ai-feedback-auto-stash')],
				expect.anything()
			);
		});

		it('should create a stash successfully', async () => {
			queueResult('Saved working directory');

			const result = await service.createStash();

			expect(result.stashCreated).toBe(true);
			expect(result.stashName).toContain('ai-feedback-auto-stash');
			expect(service.hasActiveStash()).toBe(true);
		});

		it('should handle stash failure', async () => {
			queueError('No local changes to save');

			const result = await service.createStash();

			expect(result.stashCreated).toBe(false);
			expect(result.error).toContain('No local changes to save');
		});
	});

	describe('restoreStash', () => {
		it('should skip restore if no stash was created', async () => {
			const result = await service.restoreStash();

			expect(result.restored).toBe(false);
			expect(mockExecute).not.toHaveBeenCalled();
		});

		it('should restore stash successfully', async () => {
			// First create a stash
			queueResult('Success');
			queueResult('Success');

			await service.createStash();
			const result = await service.restoreStash();

			expect(result.restored).toBe(true);
			expect(service.hasActiveStash()).toBe(false);
		});

		it('should handle restore failure', async () => {
			// First create a stash, then fail on restore
			queueResult('Saved');
			queueError('CONFLICT in file.ts');

			await service.createStash();
			const result = await service.restoreStash();

			expect(result.restored).toBe(false);
			expect(result.error).toContain('CONFLICT');
		});
	});

	describe('promptAndStash', () => {
		it('should skip stash if no uncommitted changes', async () => {
			queueResult('');

			const result = await service.promptAndStash();

			expect(result.stashCreated).toBe(false);
		});

		it('should prompt user and create stash when user confirms', async () => {
			// git status shows staged changes, then git stash succeeds
			queueResult('M  file.ts\n');
			queueResult('Saved');
			mockConfirmFn.mockResolvedValue(true);

			const result = await service.promptAndStash(true);

			expect(mockConfirmFn).toHaveBeenCalledWith(expect.stringContaining('Stash them'));
			expect(result.stashCreated).toBe(true);
		});

		it('should not create stash when user declines', async () => {
			queueResult('M  file.ts\n');
			mockConfirmFn.mockResolvedValue(false);

			const result = await service.promptAndStash(true);

			expect(mockConfirmFn).toHaveBeenCalledWith(expect.stringContaining('Stash them'));
			expect(result.stashCreated).toBe(false);
		});

		it('should auto-stash when not interactive even without confirmFn', async () => {
			// Create service without confirmFn
			const nonInteractiveService = createGitStashProtection();

			queueResult('M  file.ts\n');
			queueResult('Saved');

			// Interactive is false, so it should auto-stash
			const result = await nonInteractiveService.promptAndStash(false);

			expect(result.stashCreated).toBe(true);
		});
	});
});
