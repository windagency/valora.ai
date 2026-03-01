/**
 * Git Stash Protection Service
 *
 * Provides automatic stash/unstash functionality to protect uncommitted changes
 * during command execution that may inadvertently modify git state.
 */

import { exec } from 'child_process';
import { getLogger } from 'output/logger';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface GitStatus {
	hasStagedChanges: boolean;
	hasUncommittedChanges: boolean;
	hasUnstagedChanges: boolean;
	hasUntrackedFiles: boolean;
}

export interface StashProtectionResult {
	error?: string;
	stashCreated: boolean;
	stashName?: string;
}

export interface UnstashResult {
	error?: string;
	restored: boolean;
}

/**
 * Function type for confirming stash creation with the user
 * Returns true if user confirms, false otherwise
 */
export type ConfirmStashFn = (message: string) => Promise<boolean>;

const STASH_MESSAGE_PREFIX = 'ai-feedback-auto-stash';

/**
 * Service to protect git working tree changes during command execution
 */
export class GitStashProtectionService {
	private readonly confirmFn?: ConfirmStashFn;
	private readonly logger = getLogger();
	private stashCreated = false;
	private stashName: string | undefined;

	/**
	 * Create a new GitStashProtectionService
	 *
	 * @param confirmFn - Optional function to prompt user for confirmation.
	 *                    If not provided, interactive prompts will auto-confirm.
	 */
	constructor(confirmFn?: ConfirmStashFn) {
		this.confirmFn = confirmFn;
	}

	/**
	 * Check if there are uncommitted changes in the working tree
	 */
	async checkGitStatus(): Promise<GitStatus> {
		try {
			const { stdout } = await execAsync('git status --porcelain', {
				cwd: process.cwd()
			});

			const lines = stdout.trim().split('\n').filter(Boolean);

			// Parse git status porcelain output
			let hasStagedChanges = false;
			let hasUnstagedChanges = false;
			let hasUntrackedFiles = false;

			for (const line of lines) {
				const indexStatus = line[0];
				const worktreeStatus = line[1];

				// Staged changes (first column is not space or ?)
				if (indexStatus && indexStatus !== ' ' && indexStatus !== '?') {
					hasStagedChanges = true;
				}

				// Unstaged changes (second column is not space)
				if (worktreeStatus && worktreeStatus !== ' ') {
					hasUnstagedChanges = true;
				}

				// Untracked files
				if (indexStatus === '?') {
					hasUntrackedFiles = true;
				}
			}

			return {
				hasStagedChanges,
				hasUncommittedChanges: hasStagedChanges || hasUnstagedChanges,
				hasUnstagedChanges,
				hasUntrackedFiles
			};
		} catch (error) {
			this.logger.warn('Failed to check git status', { error: (error as Error).message });
			return {
				hasStagedChanges: false,
				hasUncommittedChanges: false,
				hasUnstagedChanges: false,
				hasUntrackedFiles: false
			};
		}
	}

	/**
	 * Prompt user to stash changes before command execution
	 *
	 * @param interactive - Whether to prompt the user or auto-stash
	 * @returns Result indicating if stash was created
	 */
	async promptAndStash(interactive: boolean = true): Promise<StashProtectionResult> {
		const status = await this.checkGitStatus();

		if (!status.hasUncommittedChanges) {
			this.logger.debug('No uncommitted changes, skipping stash');
			return { stashCreated: false };
		}

		// Build status message
		const changeTypes: string[] = [];
		if (status.hasStagedChanges) changeTypes.push('staged');
		if (status.hasUnstagedChanges) changeTypes.push('unstaged');
		const changeDescription = changeTypes.join(' and ') + ' changes';

		if (interactive && this.confirmFn) {
			const message = `Uncommitted ${changeDescription} detected. Stash them to prevent accidental modification?`;
			const shouldStash = await this.confirmFn(message);

			if (!shouldStash) {
				this.logger.info('User declined stash protection');
				return { stashCreated: false };
			}
		}

		return this.createStash();
	}

	/**
	 * Create a stash with a recognisable message
	 */
	async createStash(): Promise<StashProtectionResult> {
		try {
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
			this.stashName = `${STASH_MESSAGE_PREFIX}-${timestamp}`;

			// Stash all changes including untracked files
			await execAsync(`git stash push -u -m "${this.stashName}"`, {
				cwd: process.cwd()
			});

			this.stashCreated = true;
			this.logger.info(`Changes stashed: ${this.stashName}`);

			return {
				stashCreated: true,
				stashName: this.stashName
			};
		} catch (error) {
			const err = error as Error;
			this.logger.error('Failed to create stash', err);
			return {
				error: err.message,
				stashCreated: false
			};
		}
	}

	/**
	 * Restore stashed changes after command execution
	 */
	async restoreStash(): Promise<UnstashResult> {
		if (!this.stashCreated) {
			this.logger.debug('No stash was created, skipping restore');
			return { restored: false };
		}

		try {
			// Pop the stash to restore changes
			await execAsync('git stash pop', {
				cwd: process.cwd()
			});

			this.stashCreated = false;
			this.logger.info(`Changes restored from stash: ${this.stashName}`);

			return { restored: true };
		} catch (error) {
			const err = error as Error;
			this.logger.error('Failed to restore stash', err);

			// Try to provide helpful guidance
			if (err.message.includes('CONFLICT') || err.message.includes('conflict')) {
				this.logger.warn(
					'Stash restore had conflicts. Your changes are still in the stash. ' +
						'Run "git stash show" to see what was stashed and "git stash pop" to try again.'
				);
			}

			return {
				error:
					`Failed to restore stash: ${err.message}. ` +
					`Your changes are saved in stash "${this.stashName}". ` +
					'Run "git stash list" to see stashes and "git stash pop" to restore manually.',
				restored: false
			};
		}
	}

	/**
	 * Check if a stash was created during this session
	 */
	hasActiveStash(): boolean {
		return this.stashCreated;
	}

	/**
	 * Get the name of the created stash
	 */
	getStashName(): string | undefined {
		return this.stashName;
	}
}

// Singleton instance for use across the application
let stashProtectionInstance: GitStashProtectionService | undefined;

export function getGitStashProtection(): GitStashProtectionService {
	stashProtectionInstance ??= new GitStashProtectionService();
	return stashProtectionInstance;
}

/**
 * Create a new instance with optional confirm function
 * @param confirmFn - Function to prompt user for stash confirmation
 */
export function createGitStashProtection(confirmFn?: ConfirmStashFn): GitStashProtectionService {
	return new GitStashProtectionService(confirmFn);
}
