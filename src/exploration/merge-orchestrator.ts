/**
 * Merge Orchestrator - Smart merge strategies for exploration results
 *
 * Handles merging winning exploration branches back to main codebase
 */

import type { Exploration, WorktreeExploration } from 'types/exploration.types';

import { exec } from 'child_process';
import { getLogger } from 'output/logger';
import { promisify } from 'util';
import { formatErrorMessage } from 'utils/error-handler';

import { ExplorationStateManager } from './exploration-state';
import { WorktreeManager } from './worktree-manager';

const execAsync = promisify(exec);
const logger = getLogger();

export interface ConflictInfo {
	conflict_type: 'content' | 'delete' | 'rename';
	file_path: string;
	our_version?: string;
	resolution_strategy?: 'manual' | 'ours' | 'theirs';
	resolved: boolean;
	their_version?: string;
}

export interface MergeOptions {
	auto_resolve_conflicts: boolean;
	commit_message?: string;
	create_backup: boolean;
	create_pr?: boolean;
	delete_worktree: boolean;
	pr_body?: string;
	pr_title?: string;
	strategy: MergeStrategy;
	target_branch?: string; // Default: current branch
}

export interface MergeResult {
	backup_branch?: string;
	commits_merged?: number;
	conflicts?: ConflictInfo[];
	conflicts_detected: boolean;
	error?: string;
	files_changed?: number;
	merge_commit?: string;
	pr_url?: string;
	source_branch: string;
	strategy: MergeStrategy;
	success: boolean;
	target_branch: string;
}

export type MergeStrategy = 'direct' | 'rebase' | 'squash';

export interface MergeValidation {
	errors: string[];
	valid: boolean;
	warnings: string[];
}

/**
 * Parameters for building a success result
 * Consolidates parameters to avoid long parameter lists
 */
interface BuildSuccessResultParams {
	backupBranch: string | undefined;
	mergeOptions: MergeOptions;
	mergeResult: Partial<MergeResult>;
	prUrl: string | undefined;
	targetBranch: string;
	worktree: WorktreeExploration;
}

// Use centralized formatErrorMessage from utils/error-handler
const getErrorMessage = formatErrorMessage;

/**
 * Main merge orchestrator
 */
export class MergeOrchestrator {
	private repoRoot: string;
	private stateManager: ExplorationStateManager;
	private worktreeManager: WorktreeManager;

	constructor(repoRoot?: string) {
		this.repoRoot = repoRoot ?? process.cwd();
		this.stateManager = new ExplorationStateManager();
		this.worktreeManager = new WorktreeManager(this.repoRoot);
	}

	/**
	 * Merge an exploration worktree back to target branch
	 */
	async mergeExploration(
		explorationId: string,
		worktreeIndex: number,
		options: Partial<MergeOptions> = {}
	): Promise<MergeResult> {
		const startTime = Date.now();
		const mergeOptions = this.setMergeDefaults(options);

		logger.info(`Starting merge: ${explorationId} worktree ${worktreeIndex}`);
		logger.info(`Strategy: ${mergeOptions.strategy}`);

		try {
			const { exploration, worktree } = await this.loadAndValidateExploration(
				explorationId,
				worktreeIndex,
				mergeOptions
			);

			const targetBranch = await this.prepareTargetBranch(mergeOptions);
			logger.info(`Merging ${worktree.branch_name} → ${targetBranch}`);

			const backupBranch = await this.createBackupIfRequested(targetBranch, mergeOptions);
			await this.checkoutBranch(targetBranch);

			const mergeResult = await this.executeMerge(worktree.branch_name, targetBranch, mergeOptions);

			const conflictResult = await this.handleConflicts(
				mergeResult,
				worktree,
				targetBranch,
				backupBranch,
				mergeOptions
			);
			if (conflictResult) {
				return conflictResult;
			}

			const prUrl = await this.createPRIfRequested(worktree.branch_name, targetBranch, mergeOptions);
			await this.cleanupIfRequested(worktree, mergeOptions);
			await this.updateExplorationState(exploration, worktreeIndex, targetBranch);

			const duration = Date.now() - startTime;
			logger.info(`Merge completed successfully in ${(duration / 1000).toFixed(2)}s`);

			return this.buildSuccessResult({
				backupBranch,
				mergeOptions,
				mergeResult,
				prUrl,
				targetBranch,
				worktree
			});
		} catch (error: unknown) {
			return this.buildErrorResult(error, mergeOptions);
		}
	}

	/**
	 * Set merge option defaults
	 */
	private setMergeDefaults(options: Partial<MergeOptions>): MergeOptions {
		return {
			auto_resolve_conflicts: options.auto_resolve_conflicts ?? false,
			commit_message: options.commit_message,
			create_backup: options.create_backup !== false,
			create_pr: options.create_pr ?? false,
			delete_worktree: options.delete_worktree !== false,
			pr_body: options.pr_body,
			pr_title: options.pr_title,
			strategy: options.strategy ?? 'direct',
			target_branch: options.target_branch
		};
	}

	/**
	 * Load and validate exploration
	 */
	private async loadAndValidateExploration(
		explorationId: string,
		worktreeIndex: number,
		mergeOptions: MergeOptions
	): Promise<{ exploration: Exploration; worktree: WorktreeExploration }> {
		const exploration = await this.stateManager.loadExploration(explorationId);
		const worktree = exploration.worktrees[worktreeIndex - 1];

		if (!worktree) {
			throw new Error(`Worktree ${worktreeIndex} not found in exploration ${explorationId}`);
		}

		const validation = await this.validateMerge(exploration, worktree, mergeOptions);
		if (!validation.valid) {
			throw new Error(`Merge validation failed:\n${validation.errors.join('\n')}`);
		}

		this.logValidationWarnings(validation.warnings);

		return { exploration, worktree };
	}

	/**
	 * Log validation warnings
	 */
	private logValidationWarnings(warnings: string[]): void {
		if (warnings.length > 0) {
			logger.warn('Merge warnings:');
			warnings.forEach((w) => logger.warn(`  - ${w}`));
		}
	}

	/**
	 * Prepare target branch
	 */
	private async prepareTargetBranch(mergeOptions: MergeOptions): Promise<string> {
		return mergeOptions.target_branch ?? (await this.getCurrentBranch());
	}

	/**
	 * Create backup if requested
	 */
	private async createBackupIfRequested(targetBranch: string, mergeOptions: MergeOptions): Promise<string | undefined> {
		if (mergeOptions.create_backup) {
			const backupBranch = await this.createBackupBranch(targetBranch);
			logger.info(`Backup created: ${backupBranch}`);
			return backupBranch;
		}
		return undefined;
	}

	/**
	 * Handle merge conflicts
	 */
	private async handleConflicts(
		mergeResult: Partial<MergeResult>,
		worktree: WorktreeExploration,
		targetBranch: string,
		backupBranch: string | undefined,
		mergeOptions: MergeOptions
	): Promise<MergeResult | null> {
		if (!mergeResult.conflicts_detected) {
			return null;
		}

		if (!mergeOptions.auto_resolve_conflicts) {
			logger.warn('Conflicts detected. Aborting merge.');
			await this.abortMerge();
			return {
				backup_branch: backupBranch,
				conflicts: mergeResult.conflicts,
				conflicts_detected: true,
				error: 'Conflicts detected and auto_resolve_conflicts is disabled',
				source_branch: worktree.branch_name,
				strategy: mergeOptions.strategy,
				success: false,
				target_branch: targetBranch
			};
		}

		logger.info('Attempting to auto-resolve conflicts...');
		const resolved = await this.autoResolveConflicts(mergeResult.conflicts!);

		if (!resolved) {
			logger.error('Auto-resolution failed');
			await this.abortMerge();
			return {
				backup_branch: backupBranch,
				conflicts: mergeResult.conflicts,
				conflicts_detected: true,
				error: 'Failed to auto-resolve conflicts',
				source_branch: worktree.branch_name,
				strategy: mergeOptions.strategy,
				success: false,
				target_branch: targetBranch
			};
		}

		await this.completeMerge(worktree, mergeOptions);
		return null;
	}

	/**
	 * Create PR if requested
	 */
	private async createPRIfRequested(
		sourceBranch: string,
		targetBranch: string,
		mergeOptions: MergeOptions
	): Promise<string | undefined> {
		if (mergeOptions.create_pr) {
			const prUrl = await this.createPullRequest(sourceBranch, targetBranch, mergeOptions);
			logger.info(`Pull request created: ${prUrl}`);
			return prUrl;
		}
		return undefined;
	}

	/**
	 * Cleanup if requested
	 */
	private async cleanupIfRequested(worktree: WorktreeExploration, mergeOptions: MergeOptions): Promise<void> {
		if (mergeOptions.delete_worktree) {
			await this.cleanupWorktree(worktree);
			logger.info(`Worktree cleaned up: ${worktree.worktree_path}`);
		}
	}

	/**
	 * Update exploration state
	 */
	private async updateExplorationState(
		exploration: Exploration,
		worktreeIndex: number,
		targetBranch: string
	): Promise<void> {
		exploration.merged_at = new Date().toISOString();
		exploration.merged_worktree = worktreeIndex;
		exploration.merge_target_branch = targetBranch;
		await this.stateManager.saveExploration(exploration);
	}

	/**
	 * Build success result
	 */
	private buildSuccessResult(params: BuildSuccessResultParams): MergeResult {
		const { backupBranch, mergeOptions, mergeResult, prUrl, targetBranch, worktree } = params;
		return {
			backup_branch: backupBranch,
			commits_merged: mergeResult.commits_merged,
			conflicts: mergeResult.conflicts,
			conflicts_detected: false,
			files_changed: mergeResult.files_changed,
			merge_commit: mergeResult.merge_commit,
			pr_url: prUrl,
			source_branch: mergeResult.source_branch ?? worktree.branch_name,
			strategy: mergeOptions.strategy,
			success: true,
			target_branch: targetBranch
		};
	}

	/**
	 * Build error result
	 */
	private buildErrorResult(error: unknown, mergeOptions: MergeOptions): MergeResult {
		const errorMessage = formatErrorMessage(error);
		logger.error(`Merge failed: ${errorMessage}`);
		return {
			conflicts_detected: false,
			error: errorMessage,
			source_branch: '',
			strategy: mergeOptions.strategy,
			success: false,
			target_branch: mergeOptions.target_branch ?? ''
		};
	}

	/**
	 * Validate merge is possible
	 */
	private async validateMerge(
		exploration: Exploration,
		worktree: WorktreeExploration,
		options: MergeOptions
	): Promise<MergeValidation> {
		const errors: string[] = [];
		const warnings: string[] = [];

		// Check worktree status
		if (worktree.status !== 'completed') {
			errors.push(`Worktree status is ${worktree.status}, expected 'completed'`);
		}

		// Check if worktree exists
		const worktreeExists = await this.worktreeManager.worktreeExists(worktree.worktree_path);
		if (!worktreeExists) {
			errors.push(`Worktree does not exist: ${worktree.worktree_path}`);
		}

		// Check if branch exists
		try {
			await execAsync(`git rev-parse --verify ${worktree.branch_name}`, { cwd: this.repoRoot });
		} catch {
			errors.push(`Branch does not exist: ${worktree.branch_name}`);
		}

		// Check working tree is clean (in main repo)
		try {
			const { stdout } = await execAsync('git status --porcelain', { cwd: this.repoRoot });
			if (stdout.trim()) {
				errors.push('Working tree has uncommitted changes. Commit or stash before merging.');
			}
		} catch (error) {
			errors.push(`Failed to check working tree status: ${getErrorMessage(error)}`);
		}

		// Check target branch exists
		if (options.target_branch) {
			try {
				await execAsync(`git rev-parse --verify ${options.target_branch}`, { cwd: this.repoRoot });
			} catch {
				errors.push(`Target branch does not exist: ${options.target_branch}`);
			}
		}

		// Warnings
		if (worktree.progress.errors.length > 0) {
			warnings.push(`Worktree has ${worktree.progress.errors.length} errors recorded`);
		}

		if (exploration.completed_branches < exploration.branches) {
			warnings.push(`Not all branches completed (${exploration.completed_branches}/${exploration.branches})`);
		}

		return {
			errors,
			valid: errors.length === 0,
			warnings
		};
	}

	/**
	 * Execute merge based on strategy
	 */
	private async executeMerge(
		sourceBranch: string,
		targetBranch: string,
		options: MergeOptions
	): Promise<Partial<MergeResult>> {
		const result: Partial<MergeResult> = {
			conflicts: [],
			conflicts_detected: false,
			source_branch: sourceBranch,
			strategy: options.strategy,
			target_branch: targetBranch
		};

		const strategyExecutors: Record<MergeStrategy, () => Promise<Partial<MergeResult>>> = {
			direct: () => this.executeDirectMerge(sourceBranch, targetBranch, result),
			rebase: () => this.executeRebaseMerge(sourceBranch, targetBranch, result),
			squash: () => this.executeSquashMerge(sourceBranch, targetBranch, options, result)
		};

		try {
			const executor = strategyExecutors[options.strategy];
			if (!executor) {
				throw new Error(`Unknown merge strategy: ${options.strategy}`);
			}

			return await executor();
		} catch (error) {
			logger.error(`Merge execution failed: ${getErrorMessage(error)}`);
			throw error;
		}
	}

	/**
	 * Direct merge strategy (preserves commit history)
	 */
	private async executeDirectMerge(
		sourceBranch: string,
		_targetBranch: string,
		result: Partial<MergeResult>
	): Promise<Partial<MergeResult>> {
		try {
			// Try merge
			const { stderr, stdout } = await execAsync(`git merge --no-ff ${sourceBranch}`, { cwd: this.repoRoot });

			// Check for conflicts
			if (stderr.includes('CONFLICT') || stdout.includes('CONFLICT')) {
				const conflicts = await this.detectConflicts();
				return {
					...result,
					conflicts,
					conflicts_detected: true
				};
			}

			// Get merge commit info
			const { stdout: commitHash } = await execAsync('git rev-parse HEAD', { cwd: this.repoRoot });
			const { stdout: statsOutput } = await execAsync(`git diff --stat ${sourceBranch}~1 ${sourceBranch}`, {
				cwd: this.repoRoot
			});

			const filesChanged = this.parseGitStats(statsOutput);

			return {
				...result,
				commits_merged: await this.countCommits(sourceBranch),
				files_changed: filesChanged.files,
				merge_commit: commitHash.trim()
			};
		} catch (error: unknown) {
			// Check if error is due to conflicts
			const errorMessage = formatErrorMessage(error);
			if (errorMessage.includes('CONFLICT')) {
				const conflicts = await this.detectConflicts();
				return {
					...result,
					conflicts,
					conflicts_detected: true
				};
			}
			throw error;
		}
	}

	/**
	 * Squash merge strategy (single commit)
	 */
	private async executeSquashMerge(
		sourceBranch: string,
		_targetBranch: string,
		options: MergeOptions,
		result: Partial<MergeResult>
	): Promise<Partial<MergeResult>> {
		try {
			// Squash merge
			await execAsync(`git merge --squash ${sourceBranch}`, { cwd: this.repoRoot });

			// Check for conflicts
			const { stdout: statusOutput } = await execAsync('git status --porcelain', {
				cwd: this.repoRoot
			});

			if (statusOutput.includes('U ')) {
				// Unmerged files (conflicts)
				const conflicts = await this.detectConflicts();
				return {
					...result,
					conflicts,
					conflicts_detected: true
				};
			}

			// Create commit message
			const commitMessage =
				options.commit_message ?? `Merge exploration: ${sourceBranch}\n\n🤖 Squash merged exploration branch`;

			// Commit
			await execAsync(`git commit -m "${commitMessage}"`, { cwd: this.repoRoot });

			const { stdout: commitHash } = await execAsync('git rev-parse HEAD', { cwd: this.repoRoot });

			return {
				...result,
				commits_merged: 1, // Squash always creates single commit
				merge_commit: commitHash.trim()
			};
		} catch (error: unknown) {
			const errorMessage = formatErrorMessage(error);
			if (errorMessage.includes('CONFLICT')) {
				const conflicts = await this.detectConflicts();
				return {
					...result,
					conflicts,
					conflicts_detected: true
				};
			}
			throw error;
		}
	}

	/**
	 * Rebase merge strategy (linear history)
	 */
	private async executeRebaseMerge(
		sourceBranch: string,
		targetBranch: string,
		result: Partial<MergeResult>
	): Promise<Partial<MergeResult>> {
		try {
			// Checkout source branch temporarily
			await execAsync(`git checkout ${sourceBranch}`, { cwd: this.repoRoot });

			// Rebase onto target
			await execAsync(`git rebase ${targetBranch}`, { cwd: this.repoRoot });

			// Checkout target and fast-forward
			await execAsync(`git checkout ${targetBranch}`, { cwd: this.repoRoot });
			await execAsync(`git merge --ff-only ${sourceBranch}`, { cwd: this.repoRoot });

			const { stdout: commitHash } = await execAsync('git rev-parse HEAD', { cwd: this.repoRoot });

			return {
				...result,
				commits_merged: await this.countCommits(sourceBranch),
				merge_commit: commitHash.trim()
			};
		} catch (error: unknown) {
			// Abort rebase if failed
			try {
				await execAsync('git rebase --abort', { cwd: this.repoRoot });
			} catch {
				// Ignore
			}

			const errorMessage = formatErrorMessage(error);
			if (errorMessage.includes('CONFLICT')) {
				const conflicts = await this.detectConflicts();
				return {
					...result,
					conflicts,
					conflicts_detected: true
				};
			}
			throw error;
		}
	}

	/**
	 * Detect merge conflicts
	 */
	private async detectConflicts(): Promise<ConflictInfo[]> {
		const conflicts: ConflictInfo[] = [];

		try {
			const { stdout } = await execAsync('git status --porcelain', { cwd: this.repoRoot });
			const lines = stdout.split('\n').filter((line) => line.trim());

			for (const line of lines) {
				const status = line.substring(0, 2);
				const filePath = line.substring(3);

				if (status.includes('U') || status === 'AA' || status === 'DD') {
					// Unmerged file (conflict)
					conflicts.push({
						conflict_type: status === 'DD' ? 'delete' : 'content',
						file_path: filePath,
						resolved: false
					});
				}
			}
		} catch (error) {
			logger.error(`Failed to detect conflicts: ${getErrorMessage(error)}`);
		}

		return conflicts;
	}

	/**
	 * Attempt to auto-resolve conflicts
	 */
	private async autoResolveConflicts(conflicts: ConflictInfo[]): Promise<boolean> {
		let allResolved = true;

		for (const conflict of conflicts) {
			try {
				// Simple strategy: take 'ours' (target branch) for now
				// In a real implementation, this could be much smarter
				await execAsync(`git checkout --ours "${conflict.file_path}"`, { cwd: this.repoRoot });
				await execAsync(`git add "${conflict.file_path}"`, { cwd: this.repoRoot });

				conflict.resolved = true;
				conflict.resolution_strategy = 'ours';
				logger.info(`Auto-resolved conflict: ${conflict.file_path} (using ours)`);
			} catch (error) {
				logger.error(`Failed to auto-resolve ${conflict.file_path}: ${getErrorMessage(error)}`);
				conflict.resolved = false;
				allResolved = false;
			}
		}

		return allResolved;
	}

	/**
	 * Complete merge after conflict resolution
	 */
	private async completeMerge(worktree: WorktreeExploration, options: MergeOptions): Promise<void> {
		const commitMessage =
			options.commit_message ?? `Merge exploration: ${worktree.branch_name}\n\n🤖 Auto-resolved conflicts`;

		await execAsync(`git commit -m "${commitMessage}"`, { cwd: this.repoRoot });
		logger.info('Merge completed');
	}

	/**
	 * Abort merge
	 */
	private async abortMerge(): Promise<void> {
		try {
			await execAsync('git merge --abort', { cwd: this.repoRoot });
			logger.info('Merge aborted');
		} catch (error) {
			logger.warn(`Failed to abort merge: ${getErrorMessage(error)}`);
		}
	}

	/**
	 * Create backup branch
	 */
	private async createBackupBranch(targetBranch: string): Promise<string> {
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
		const backupName = `backup/${targetBranch}-${timestamp}`;

		await execAsync(`git branch ${backupName} ${targetBranch}`, { cwd: this.repoRoot });
		return backupName;
	}

	/**
	 * Get current branch
	 */
	private async getCurrentBranch(): Promise<string> {
		const { stdout } = await execAsync('git branch --show-current', { cwd: this.repoRoot });
		return stdout.trim();
	}

	/**
	 * Checkout branch
	 */
	private async checkoutBranch(branch: string): Promise<void> {
		await execAsync(`git checkout ${branch}`, { cwd: this.repoRoot });
		logger.debug(`Checked out branch: ${branch}`);
	}

	/**
	 * Create pull request
	 */
	private async createPullRequest(sourceBranch: string, targetBranch: string, options: MergeOptions): Promise<string> {
		const title = options.pr_title ?? `Merge exploration: ${sourceBranch}`;
		const body =
			options.pr_body ?? `🤖 Auto-generated PR from exploration\n\nMerging ${sourceBranch} → ${targetBranch}`;

		try {
			const { stdout } = await execAsync(
				`gh pr create --base ${targetBranch} --head ${sourceBranch} --title "${title}" --body "${body}"`,
				{ cwd: this.repoRoot }
			);

			// Extract PR URL from output
			const urlMatch = stdout.match(/https:\/\/github\.com\/.+\/pull\/\d+/);
			return urlMatch ? urlMatch[0] : stdout.trim();
		} catch (error) {
			logger.error(`Failed to create PR: ${getErrorMessage(error)}`);
			throw new Error(`Failed to create pull request: ${getErrorMessage(error)}`);
		}
	}

	/**
	 * Cleanup worktree after merge
	 */
	private async cleanupWorktree(worktree: WorktreeExploration): Promise<void> {
		// Remove worktree
		await this.worktreeManager.removeWorktree(worktree.worktree_path, true);

		// Delete branch
		await this.worktreeManager.deleteBranch(worktree.branch_name, true);
	}

	/**
	 * Count commits in a branch (since divergence from target)
	 */
	private async countCommits(branch: string): Promise<number> {
		try {
			const { stdout } = await execAsync(`git rev-list --count HEAD..${branch}`, { cwd: this.repoRoot });
			return parseInt(stdout.trim());
		} catch {
			return 0;
		}
	}

	/**
	 * Parse git stats output
	 */
	private parseGitStats(statsOutput: string): { deletions: number; files: number; insertions: number } {
		const filesMatch = statsOutput.match(/(\d+) file[s]? changed/);
		const insertionsMatch = statsOutput.match(/(\d+) insertion[s]?\(\+\)/);
		const deletionsMatch = statsOutput.match(/(\d+) deletion[s]?\(-\)/);

		return {
			deletions: deletionsMatch?.[1] ? parseInt(deletionsMatch[1], 10) : 0,
			files: filesMatch?.[1] ? parseInt(filesMatch[1], 10) : 0,
			insertions: insertionsMatch?.[1] ? parseInt(insertionsMatch[1], 10) : 0
		};
	}

	/**
	 * Preview merge (dry run)
	 */
	async previewMerge(
		explorationId: string,
		worktreeIndex: number,
		_targetBranch?: string
	): Promise<{
		can_merge: boolean;
		commits_to_merge: number;
		conflicts: ConflictInfo[];
		files_changed: number;
	}> {
		const exploration = await this.stateManager.loadExploration(explorationId);
		const worktree = exploration.worktrees[worktreeIndex - 1];

		if (!worktree) {
			throw new Error(`Worktree ${worktreeIndex} not found`);
		}

		// Try merge with --no-commit to preview
		try {
			await execAsync(`git merge --no-commit --no-ff ${worktree.branch_name}`, {
				cwd: this.repoRoot
			});

			const conflicts = await this.detectConflicts();
			const commits = await this.countCommits(worktree.branch_name);

			// Abort the preview merge
			await this.abortMerge();

			return {
				can_merge: conflicts.length === 0,
				commits_to_merge: commits,
				conflicts,
				files_changed: 0 // Would need to parse from git output
			};
		} catch (error: Error | unknown) {
			// Abort and check for conflicts
			const conflicts = await this.detectConflicts();
			await this.abortMerge();

			return {
				can_merge: false,
				commits_to_merge: await this.countCommits(worktree.branch_name),
				conflicts,
				files_changed: 0
			};
		}
	}
}
