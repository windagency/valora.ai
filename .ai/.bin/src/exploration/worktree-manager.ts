/**
 * Worktree Manager - Git worktree CRUD operations
 *
 * Manages git worktrees for parallel explorations with safety checks
 */

import { exec } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

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

export class WorktreeManager {
	private repoRoot: string;

	constructor(repoRoot?: string) {
		this.repoRoot = repoRoot ?? process.cwd();
	}

	/**
	 * Create a new git worktree
	 */
	async createWorktree(options: CreateWorktreeOptions): Promise<WorktreeInfo> {
		const { baseRef = 'HEAD', branch, force = false, path: worktreePath } = options;

		// Validate inputs
		this.validateWorktreeOptions(worktreePath, branch);

		// Check if path already exists
		await this.checkPathAvailability(worktreePath, force);

		// Build git worktree add command
		const command = this.buildWorktreeCommand(worktreePath, branch, baseRef, force);

		try {
			const { stderr } = await execAsync(command, {
				cwd: this.repoRoot
			});

			// Git worktree add can output to stderr even on success
			if (stderr && !stderr.includes('Preparing worktree')) {
				console.warn('Git worktree warning:', stderr);
			}

			// Get worktree info
			return await this.getWorktreeInfo(worktreePath);
		} catch (error) {
			const typedError = error as Error;
			throw new Error(`Failed to create worktree: ${typedError.message}`);
		}
	}

	/**
	 * Validate worktree creation options
	 */
	private validateWorktreeOptions(path: string, branch: string): void {
		if (!path) {
			throw new Error('Worktree path is required');
		}
		if (!branch) {
			throw new Error('Branch name is required');
		}
	}

	/**
	 * Check if path is available for worktree creation
	 */
	private async checkPathAvailability(worktreePath: string, force: boolean): Promise<void> {
		try {
			await fs.access(worktreePath);
			if (!force) {
				throw new Error(`Path ${worktreePath} already exists`);
			}
		} catch (error) {
			const nodeError = error as NodeJS.ErrnoException;
			if (nodeError.code !== 'ENOENT') {
				throw error;
			}
			// Path doesn't exist, which is good
		}
	}

	/**
	 * Build git worktree add command
	 */
	private buildWorktreeCommand(worktreePath: string, branch: string, baseRef: string, force: boolean): string {
		const forceFlag = force ? '--force' : '';
		return `git worktree add ${forceFlag} -b ${branch} ${worktreePath} ${baseRef}`.trim();
	}

	/**
	 * List all git worktrees
	 */
	async listWorktrees(): Promise<WorktreeInfo[]> {
		try {
			const { stdout } = await execAsync('git worktree list --porcelain', {
				cwd: this.repoRoot
			});

			return this.parseWorktreeList(stdout);
		} catch (error) {
			const typedError = error as Error;
			throw new Error(`Failed to list worktrees: ${typedError.message}`);
		}
	}

	/**
	 * Get information about a specific worktree
	 */
	async getWorktreeInfo(worktreePath: string): Promise<WorktreeInfo> {
		const worktrees = await this.listWorktrees();
		const absolutePath = path.resolve(worktreePath);

		const worktree = worktrees.find((wt) => path.resolve(wt.path) === absolutePath);

		if (!worktree) {
			throw new Error(`Worktree not found: ${worktreePath}`);
		}

		return worktree;
	}

	/**
	 * Remove a git worktree
	 */
	async removeWorktree(worktreePath: string, force: boolean = false): Promise<void> {
		const forceFlag = force ? '--force' : '';
		const command = `git worktree remove ${forceFlag} ${worktreePath}`.trim();

		try {
			await execAsync(command, {
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
			await execAsync('git worktree prune', {
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
			await this.getWorktreeInfo(worktreePath);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Check if a branch name is available
	 */
	async isBranchNameAvailable(branchName: string): Promise<boolean> {
		try {
			const { stdout } = await execAsync(`git branch --list ${branchName}`, {
				cwd: this.repoRoot
			});
			return stdout.trim() === '';
		} catch {
			return false;
		}
	}

	/**
	 * Get all exploration worktrees (prefixed with exploration/)
	 */
	async getExplorationWorktrees(): Promise<WorktreeInfo[]> {
		const allWorktrees = await this.listWorktrees();
		return allWorktrees.filter((wt) => wt.branch.startsWith('exploration/'));
	}

	/**
	 * Delete branch after worktree removal
	 */
	async deleteBranch(branchName: string, force: boolean = false): Promise<void> {
		const forceFlag = force ? '-D' : '-d';
		const command = `git branch ${forceFlag} ${branchName}`;

		try {
			await execAsync(command, {
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
	 * Lock a worktree to prevent automatic pruning
	 */
	async lockWorktree(worktreePath: string, reason?: string): Promise<void> {
		const lockReason = reason ?? 'Locked by exploration system';
		const command = `git worktree lock "${worktreePath}" --reason "${lockReason}"`;

		try {
			await execAsync(command, {
				cwd: this.repoRoot
			});
		} catch (error) {
			const typedError = error as Error;
			throw new Error(`Failed to lock worktree: ${typedError.message}`);
		}
	}

	/**
	 * Unlock a worktree
	 */
	async unlockWorktree(worktreePath: string): Promise<void> {
		const command = `git worktree unlock "${worktreePath}"`;

		try {
			await execAsync(command, {
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
	 * Create multiple worktrees in parallel
	 */
	async createMultipleWorktrees(optionsArray: CreateWorktreeOptions[]): Promise<WorktreeInfo[]> {
		const promises = optionsArray.map((options) => this.createWorktree(options));
		return Promise.all(promises);
	}

	/**
	 * Remove multiple worktrees in parallel
	 */
	async removeMultipleWorktrees(paths: string[], force: boolean = false): Promise<void> {
		const promises = paths.map((path) => this.removeWorktree(path, force));
		await Promise.all(promises);
	}

	/**
	 * Get worktree status (clean, dirty, etc.)
	 */
	async getWorktreeStatus(worktreePath: string): Promise<{ clean: boolean; uncommitted_changes: number }> {
		try {
			const { stdout } = await execAsync('git status --porcelain', {
				cwd: worktreePath
			});

			const lines = stdout
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
}
