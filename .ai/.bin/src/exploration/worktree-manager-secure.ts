/**
 * Worktree Manager (Security Hardened) - Git worktree CRUD operations
 *
 * SECURITY IMPROVEMENTS:
 * - Command injection prevention (spawn instead of shell)
 * - Input validation for all user-controlled parameters
 * - Path traversal prevention
 * - Race condition fixes (TOCTOU)
 * - Retry logic for transient failures
 * - Cleanup rollback on partial failures
 */

import { DEFAULT_TIMEOUT_MS } from 'config/constants';
import * as path from 'path';
import { InputValidator } from 'utils/input-validator';
import { RetryExecutor, SafeExecutor } from 'utils/safe-exec';

export interface CreateWorktreeOptions {
	baseRef?: string; // Default: HEAD
	branch: string;
	force?: boolean;
	path: string;
}

export interface WorktreeInfo {
	branch: string;
	commit: string;
	path: string;
	prunable: boolean;
}

/**
 * Security-hardened WorktreeManager
 *
 * All security fixes from assessment applied
 */
export class WorktreeManager {
	private repoRoot: string;

	constructor(repoRoot?: string) {
		this.repoRoot = repoRoot ?? process.cwd();
	}

	/**
	 * Create a new git worktree (SECURITY HARDENED)
	 *
	 * FIXES:
	 * - Command injection: Uses spawn with args array
	 * - Input validation: Validates branch name and path
	 * - Path traversal: Ensures path is within repo
	 * - TOCTOU: Removed pre-check, let git handle atomically
	 */
	async createWorktree(options: CreateWorktreeOptions): Promise<WorktreeInfo> {
		const { baseRef = 'HEAD', branch, force = false, path: worktreePath } = options;

		// SECURITY: Validate inputs
		InputValidator.validateBranchName(branch);
		InputValidator.validateGitRef(baseRef);
		const validatedPath = InputValidator.validatePath(worktreePath, this.repoRoot);

		// Build git command args (NO shell interpolation)
		const args = ['worktree', 'add'];
		if (force) {
			args.push('--force');
		}
		args.push('-b', branch, validatedPath, baseRef);

		try {
			// SECURITY: Use spawn instead of execAsync
			// RELIABILITY: Add retry logic for transient failures
			await RetryExecutor.withRetry(async () => {
				const result = await SafeExecutor.executeGit(args, {
					cwd: this.repoRoot,
					timeout: DEFAULT_TIMEOUT_MS
				});

				// Git worktree add can output to stderr even on success
				if (result.stderr && !result.stderr.includes('Preparing worktree')) {
					console.warn('Git worktree warning:', result.stderr);
				}

				return result;
			}, 3);

			// Get worktree info
			return await this.getWorktreeInfo(validatedPath);
		} catch (error) {
			const typedError = error as Error;
			throw new Error(`Failed to create worktree: ${typedError.message}`);
		}
	}

	/**
	 * List all git worktrees (SECURITY HARDENED)
	 */
	async listWorktrees(): Promise<WorktreeInfo[]> {
		try {
			const result = await SafeExecutor.executeGit(['worktree', 'list', '--porcelain'], {
				cwd: this.repoRoot
			});

			return this.parseWorktreeList(result.stdout);
		} catch (error) {
			const typedError = error as Error;
			throw new Error(`Failed to list worktrees: ${typedError.message}`);
		}
	}

	/**
	 * Get information about a specific worktree
	 */
	async getWorktreeInfo(worktreePath: string): Promise<WorktreeInfo> {
		// SECURITY: Validate path
		const validatedPath = InputValidator.validatePath(worktreePath, this.repoRoot);

		const worktrees = await this.listWorktrees();
		const absolutePath = path.resolve(validatedPath);

		const worktree = worktrees.find((wt) => path.resolve(wt.path) === absolutePath);

		if (!worktree) {
			throw new Error(`Worktree not found: ${worktreePath}`);
		}

		return worktree;
	}

	/**
	 * Remove a git worktree (SECURITY HARDENED)
	 */
	async removeWorktree(worktreePath: string, force: boolean = false): Promise<void> {
		// SECURITY: Validate path
		const validatedPath = InputValidator.validatePath(worktreePath, this.repoRoot);

		const args = ['worktree', 'remove'];
		if (force) {
			args.push('--force');
		}
		args.push(validatedPath);

		try {
			await SafeExecutor.executeGit(args, {
				cwd: this.repoRoot
			});
		} catch (error) {
			const typedError = error as Error;
			// If worktree doesn't exist, that's okay
			if (typedError.message.includes('not a working tree')) {
				console.warn(`Worktree ${worktreePath} does not exist, skipping removal`);
				return;
			}
			throw new Error(`Failed to remove worktree: ${typedError.message}`);
		}
	}

	/**
	 * Prune stale worktree administrative files
	 */
	async pruneWorktrees(): Promise<void> {
		try {
			await SafeExecutor.executeGit(['worktree', 'prune'], {
				cwd: this.repoRoot
			});
		} catch (error) {
			const typedError = error as Error;
			throw new Error(`Failed to prune worktrees: ${typedError.message}`);
		}
	}

	/**
	 * Check if a worktree exists
	 */
	async worktreeExists(worktreePath: string): Promise<boolean> {
		try {
			// SECURITY: Validate path before checking
			const validatedPath = InputValidator.validatePath(worktreePath, this.repoRoot);
			await this.getWorktreeInfo(validatedPath);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Check if a branch name is available (SECURITY HARDENED)
	 */
	async isBranchNameAvailable(branchName: string): Promise<boolean> {
		// SECURITY: Validate branch name
		InputValidator.validateBranchName(branchName);

		try {
			const result = await SafeExecutor.executeGit(['branch', '--list', branchName], {
				cwd: this.repoRoot
			});
			return result.stdout.trim() === '';
		} catch {
			return false;
		}
	}

	/**
	 * Get all exploration worktrees (prefixed with exploration/)
	 */
	async getExplorationWorktrees(): Promise<WorktreeInfo[]> {
		const allWorktrees = await this.listWorktrees();
		return allWorktrees.filter((wt) => wt.branch.includes('exploration/'));
	}

	/**
	 * Delete branch after worktree removal (SECURITY HARDENED)
	 */
	async deleteBranch(branchName: string, force: boolean = false): Promise<void> {
		// SECURITY: Validate branch name
		InputValidator.validateBranchName(branchName);

		const args = ['branch', force ? '-D' : '-d', branchName];

		try {
			await SafeExecutor.executeGit(args, {
				cwd: this.repoRoot
			});
		} catch (error) {
			const typedError = error as Error;
			// If branch doesn't exist, that's okay
			if (typedError.message.includes('not found')) {
				console.warn(`Branch ${branchName} does not exist, skipping deletion`);
				return;
			}
			throw new Error(`Failed to delete branch: ${typedError.message}`);
		}
	}

	/**
	 * Lock a worktree to prevent automatic pruning (SECURITY HARDENED)
	 */
	async lockWorktree(worktreePath: string, reason?: string): Promise<void> {
		// SECURITY: Validate path and sanitize reason
		const validatedPath = InputValidator.validatePath(worktreePath, this.repoRoot);
		const sanitizedReason = InputValidator.validateReasonText(reason ?? 'Locked by exploration system');

		const args = ['worktree', 'lock', validatedPath, '--reason', sanitizedReason];

		try {
			await SafeExecutor.executeGit(args, {
				cwd: this.repoRoot
			});
		} catch (error) {
			const typedError = error as Error;
			throw new Error(`Failed to lock worktree: ${typedError.message}`);
		}
	}

	/**
	 * Unlock a worktree (SECURITY HARDENED)
	 */
	async unlockWorktree(worktreePath: string): Promise<void> {
		// SECURITY: Validate path
		const validatedPath = InputValidator.validatePath(worktreePath, this.repoRoot);

		const args = ['worktree', 'unlock', validatedPath];

		try {
			await SafeExecutor.executeGit(args, {
				cwd: this.repoRoot
			});
		} catch (error) {
			const typedError = error as Error;
			// Ignore if worktree is not locked
			if (!typedError.message.includes('not locked')) {
				throw new Error(`Failed to unlock worktree: ${typedError.message}`);
			}
		}
	}

	/**
	 * Parse git worktree list --porcelain output
	 */
	private parseWorktreeList(output: string): WorktreeInfo[] {
		const worktrees: WorktreeInfo[] = [];
		const entries = output.split('\n\n').filter((entry) => entry.trim());

		for (const entry of entries) {
			const lines = entry.split('\n');
			const worktree: Partial<WorktreeInfo> = {
				prunable: false
			};

			for (const line of lines) {
				if (line.startsWith('worktree ')) {
					worktree.path = line.substring(9);
				} else if (line.startsWith('HEAD ')) {
					worktree.commit = line.substring(5);
				} else if (line.startsWith('branch ')) {
					worktree.branch = line.substring(7);
				} else if (line === 'prunable') {
					worktree.prunable = true;
				}
			}

			// Only add if we have the required fields
			if (worktree.path && worktree.commit) {
				worktrees.push(worktree as WorktreeInfo);
			}
		}

		return worktrees;
	}

	/**
	 * Create multiple worktrees with rollback on failure (IMPROVED)
	 *
	 * RELIABILITY FIX: Rollback on partial failure
	 */
	async createMultipleWorktrees(optionsArray: CreateWorktreeOptions[]): Promise<WorktreeInfo[]> {
		const created: WorktreeInfo[] = [];
		const createdPaths: string[] = [];

		try {
			// Create worktrees one by one to track progress
			for (const options of optionsArray) {
				const info = await this.createWorktree(options);
				created.push(info);
				createdPaths.push(info.path);
			}

			return created;
		} catch (error) {
			// RELIABILITY: Rollback on failure
			console.error(`Worktree creation failed, rolling back ${createdPaths.length} worktrees...`);

			for (const worktreePath of createdPaths) {
				try {
					await this.removeWorktree(worktreePath, true);
					// Also try to delete the branch
					const worktree = created.find((w) => w.path === worktreePath);
					if (worktree) {
						await this.deleteBranch(worktree.branch, true);
					}
				} catch (cleanupError) {
					console.error(`Failed to cleanup worktree ${worktreePath}: ${(cleanupError as Error).message}`);
				}
			}

			throw error;
		}
	}

	/**
	 * Remove multiple worktrees in parallel
	 */
	async removeMultipleWorktrees(paths: string[], force: boolean = false): Promise<void> {
		const promises = paths.map((p) => this.removeWorktree(p, force));
		await Promise.all(promises);
	}

	/**
	 * Get worktree status (clean, dirty, etc.) (SECURITY HARDENED)
	 */
	async getWorktreeStatus(worktreePath: string): Promise<{ clean: boolean; uncommitted_changes: number }> {
		// SECURITY: Validate path
		const validatedPath = InputValidator.validatePath(worktreePath, this.repoRoot);

		try {
			const result = await SafeExecutor.executeGit(['status', '--porcelain'], {
				cwd: validatedPath
			});

			const lines = result.stdout
				.trim()
				.split('\n')
				.filter((line) => line);

			return {
				clean: lines.length === 0,
				uncommitted_changes: lines.length
			};
		} catch (error) {
			const typedError = error as Error;
			throw new Error(`Failed to get worktree status: ${typedError.message}`);
		}
	}

	/**
	 * Verify worktree limit hasn't been exceeded
	 *
	 * NEW: Prevents exhausting filesystem limits
	 */
	async checkWorktreeLimit(maxWorktrees: number = 50): Promise<void> {
		const worktrees = await this.listWorktrees();

		if (worktrees.length >= maxWorktrees) {
			throw new Error(
				`Too many worktrees (${worktrees.length}/${maxWorktrees}). ` +
					`Run 'git worktree prune' to clean up old worktrees.`
			);
		}
	}
}
