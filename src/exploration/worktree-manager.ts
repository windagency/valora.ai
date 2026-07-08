/**
 * Worktree Manager — git worktree CRUD operations.
 *
 * Uses spawn (no shell) and validates branch names, refs, and paths via
 * InputValidator so untrusted input cannot reach the git command line.
 * Path arguments are constrained to repoRoot; branch names reject shell
 * metacharacters. createMultipleWorktrees rolls back partial failures.
 */

import { promises as fs } from 'fs';
import * as path from 'path';

import { DEFAULT_TIMEOUT_MS } from 'config/constants';
import { InputValidator } from 'utils/input-validator';
import { RetryExecutor, SafeExecutor } from 'utils/safe-exec';

export interface CreateWorktreeOptions {
	baseRef?: string;
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

export class WorktreeManager {
	private repoRoot: string;

	constructor(repoRoot?: string) {
		this.repoRoot = repoRoot ?? process.cwd();
	}

	async createWorktree(options: CreateWorktreeOptions): Promise<WorktreeInfo> {
		const { baseRef = 'HEAD', branch, force = false, path: worktreePath } = options;

		InputValidator.validateBranchName(branch);
		InputValidator.validateGitRef(baseRef);
		const validatedPath = InputValidator.validatePath(worktreePath, this.repoRoot);

		const args = ['worktree', 'add'];
		if (force) {
			args.push('--force');
		}
		args.push('-b', branch, validatedPath, baseRef);

		try {
			await RetryExecutor.withRetry(async () => {
				const result = await SafeExecutor.executeGit(args, {
					cwd: this.repoRoot,
					timeout: DEFAULT_TIMEOUT_MS
				});

				// `git worktree add` writes its progress narrative to stderr even on success.
				if (result.stderr && !result.stderr.includes('Preparing worktree')) {
					console.warn('Git worktree warning:', result.stderr);
				}

				return result;
			}, 3);

			return await this.getWorktreeInfo(validatedPath);
		} catch (error) {
			const typedError = error as Error;
			throw new Error(`Failed to create worktree: ${typedError.message}`);
		}
	}

	async deleteBranch(branchName: string, force: boolean = false): Promise<void> {
		// `git branch` expects a short name; refs/heads/ prefix is stripped if present.
		const shortName = branchName.replace(/^refs\/heads\//, '');

		InputValidator.validateBranchName(shortName);

		const args = ['branch', force ? '-D' : '-d', shortName];

		try {
			await SafeExecutor.executeGit(args, {
				cwd: this.repoRoot
			});
		} catch (error) {
			const typedError = error as Error;
			if (typedError.message.includes('not found')) {
				console.warn(`Branch ${shortName} does not exist, skipping deletion`);
				return;
			}
			throw new Error(`Failed to delete branch: ${typedError.message}`);
		}
	}

	async getExplorationWorktrees(): Promise<WorktreeInfo[]> {
		const allWorktrees = await this.listWorktrees();
		return allWorktrees.filter((wt) => wt.branch.includes('exploration/'));
	}

	async getWorktreeInfo(worktreePath: string): Promise<WorktreeInfo> {
		const validatedPath = InputValidator.validatePath(worktreePath, this.repoRoot);

		const worktrees = await this.listWorktrees();
		// `git worktree list` reports paths with symlinks resolved (e.g. macOS
		// /var -> /private/var), so the comparison side must resolve them too.
		const absolutePath = await this.resolveRealPath(validatedPath);

		const worktree = worktrees.find((wt) => path.resolve(wt.path) === absolutePath);

		if (!worktree) {
			throw new Error(`Worktree not found: ${worktreePath}`);
		}

		return worktree;
	}

	async isBranchNameAvailable(branchName: string): Promise<boolean> {
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

	async lockWorktree(worktreePath: string, reason?: string): Promise<void> {
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

	async removeWorktree(worktreePath: string, force: boolean = false): Promise<void> {
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
			if (typedError.message.includes('not a working tree')) {
				console.warn(`Worktree ${worktreePath} does not exist, skipping removal`);
				return;
			}
			throw new Error(`Failed to remove worktree: ${typedError.message}`);
		}
	}

	async unlockWorktree(worktreePath: string): Promise<void> {
		const validatedPath = InputValidator.validatePath(worktreePath, this.repoRoot);

		const args = ['worktree', 'unlock', validatedPath];

		try {
			await SafeExecutor.executeGit(args, {
				cwd: this.repoRoot
			});
		} catch (error) {
			const typedError = error as Error;
			if (!typedError.message.includes('not locked')) {
				throw new Error(`Failed to unlock worktree: ${typedError.message}`);
			}
		}
	}

	async worktreeExists(worktreePath: string): Promise<boolean> {
		try {
			const validatedPath = InputValidator.validatePath(worktreePath, this.repoRoot);
			await this.getWorktreeInfo(validatedPath);
			return true;
		} catch {
			return false;
		}
	}

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

			if (worktree.path && worktree.commit) {
				worktrees.push(worktree as WorktreeInfo);
			}
		}

		return worktrees;
	}

	private async resolveRealPath(candidatePath: string): Promise<string> {
		try {
			return await fs.realpath(candidatePath);
		} catch {
			return path.resolve(candidatePath);
		}
	}

	/**
	 * Sequential creation with rollback on partial failure: a single failed
	 * worktree leaves the previously created ones removed and their branches
	 * deleted, so callers see all-or-nothing semantics.
	 */
	async createMultipleWorktrees(optionsArray: CreateWorktreeOptions[]): Promise<WorktreeInfo[]> {
		const created: WorktreeInfo[] = [];
		const createdPaths: string[] = [];

		try {
			for (const options of optionsArray) {
				const info = await this.createWorktree(options);
				created.push(info);
				createdPaths.push(info.path);
			}

			return created;
		} catch (error) {
			console.error(`Worktree creation failed, rolling back ${createdPaths.length} worktrees...`);

			for (const worktreePath of createdPaths) {
				try {
					await this.removeWorktree(worktreePath, true);
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

	async getWorktreeStatus(worktreePath: string): Promise<{ clean: boolean; uncommitted_changes: number }> {
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

	async removeMultipleWorktrees(paths: string[], force: boolean = false): Promise<void> {
		const promises = paths.map((p) => this.removeWorktree(p, force));
		await Promise.all(promises);
	}

	/**
	 * Refuses creation past the configured cap so a leak in caller code cannot
	 * exhaust the filesystem's worktree budget. Callers must `git worktree
	 * prune` to recover.
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
