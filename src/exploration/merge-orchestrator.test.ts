/**
 * Tests for MergeOrchestrator
 *
 * Focused on the array-form SafeExecutor.execute conversion: every git (and
 * gh) invocation must pass caller-influenced values (target_branch, commit
 * messages, conflicted file paths) as literal argv elements, never
 * interpolated into a shell string.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Exploration, WorktreeExploration } from 'types/exploration.types';

const mockExecute = vi.fn();
vi.mock('utils/safe-exec', () => ({
	SafeExecutor: {
		execute: (...args: unknown[]) => mockExecute(...args)
	}
}));

const mockLoadExploration = vi.fn();
const mockSaveExploration = vi.fn();
vi.mock('./exploration-state', () => ({
	ExplorationStateManager: vi.fn().mockImplementation(() => ({
		loadExploration: (...args: unknown[]) => mockLoadExploration(...args),
		saveExploration: (...args: unknown[]) => mockSaveExploration(...args)
	}))
}));

const mockWorktreeExists = vi.fn();
const mockRemoveWorktree = vi.fn();
const mockDeleteBranch = vi.fn();
vi.mock('./worktree-manager', () => ({
	WorktreeManager: vi.fn().mockImplementation(() => ({
		deleteBranch: (...args: unknown[]) => mockDeleteBranch(...args),
		removeWorktree: (...args: unknown[]) => mockRemoveWorktree(...args),
		worktreeExists: (...args: unknown[]) => mockWorktreeExists(...args)
	}))
}));

vi.mock('output/logger', () => ({
	getLogger: () => ({
		debug: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warn: vi.fn()
	})
}));

const { MergeOrchestrator } = await import('./merge-orchestrator');

function gitOk(stdout = ''): { exitCode: number; stderr: string; stdout: string } {
	return { exitCode: 0, stderr: '', stdout };
}

function buildWorktree(overrides: Partial<WorktreeExploration> = {}): WorktreeExploration {
	return {
		branch_name: 'exploration/task-1-abc123',
		index: 1,
		progress: { current_stage: 'done', errors: [] },
		status: 'completed',
		worktree_path: '/repo/.valora/worktrees/exp-1',
		...overrides
	};
}

function buildExploration(worktree: WorktreeExploration): Exploration {
	return {
		branches: 1,
		completed_branches: 1,
		config: {} as Exploration['config'],
		created_at: new Date(0).toISOString(),
		id: 'exp-1',
		mode: 'worktree',
		status: 'completed',
		task: 'do the thing',
		worktrees: [worktree]
	};
}

/** Default happy-path responder: every git call the merge flow needs, keyed by its first argv token(s). */
function defaultResponder(_command: string, args: string[]): ReturnType<typeof gitOk> {
	const [first, second] = args;
	if (first === 'branch' && second === '--show-current') return gitOk('main\n');
	if (first === 'rev-parse' && second === 'HEAD') return gitOk('abcdef1234567\n');
	if (first === 'diff') return gitOk('1 file changed, 2 insertions(+)\n');
	if (first === 'rev-list') return gitOk('3\n');
	return gitOk('');
}

describe('MergeOrchestrator', () => {
	let worktree: WorktreeExploration;
	let exploration: Exploration;

	beforeEach(() => {
		vi.clearAllMocks();
		worktree = buildWorktree();
		exploration = buildExploration(worktree);
		mockLoadExploration.mockResolvedValue(exploration);
		mockWorktreeExists.mockResolvedValue(true);
		mockExecute.mockImplementation(async (command: string, args: string[]) => defaultResponder(command, args));
	});

	describe('target_branch validation', () => {
		it('rejects a target_branch containing shell metacharacters before any git command runs', async () => {
			const orchestrator = new MergeOrchestrator('/repo');

			const result = await orchestrator.mergeExploration('exp-1', 1, {
				target_branch: 'main; touch /tmp/poc; echo'
			});

			expect(result.success).toBe(false);
			expect(mockExecute).not.toHaveBeenCalled();
		});
	});

	describe('shell metacharacters are passed as literal array elements', () => {
		it('passes a commit message containing shell metacharacters as one argv element (squash strategy)', async () => {
			const orchestrator = new MergeOrchestrator('/repo');
			const maliciousMessage = 'squash"; touch /tmp/poc; echo "done';

			const result = await orchestrator.mergeExploration('exp-1', 1, {
				commit_message: maliciousMessage,
				strategy: 'squash'
			});

			expect(result.success).toBe(true);
			expect(mockExecute).toHaveBeenCalledWith('git', ['commit', '-m', maliciousMessage], expect.anything());
		});

		it('passes a conflicted file path containing shell metacharacters as one argv element during auto-resolve', async () => {
			const maliciousPath = 'evil"; rm -rf ~ ;.txt';
			let mergeAttempted = false;
			mockExecute.mockImplementation(async (command: string, args: string[]) => {
				const [first, second] = args;
				if (first === 'merge' && second === '--no-ff') {
					mergeAttempted = true;
					throw new Error(`Command failed with exit code 1: CONFLICT (content): Merge conflict in ${maliciousPath}`);
				}
				if (first === 'status' && second === '--porcelain' && mergeAttempted) {
					return gitOk(`UU ${maliciousPath}\n`);
				}
				return defaultResponder(command, args);
			});

			const orchestrator = new MergeOrchestrator('/repo');
			const result = await orchestrator.mergeExploration('exp-1', 1, {
				auto_resolve_conflicts: true,
				strategy: 'direct'
			});

			expect(result.success).toBe(true);
			expect(mockExecute).toHaveBeenCalledWith('git', ['checkout', '--ours', '--', maliciousPath], expect.anything());
			expect(mockExecute).toHaveBeenCalledWith('git', ['add', '--', maliciousPath], expect.anything());
		});
	});

	describe('happy-path strategies still shell out to git via array-form SafeExecutor.execute', () => {
		it('direct merge calls SafeExecutor.execute("git", [...]) with the expected argument arrays', async () => {
			const orchestrator = new MergeOrchestrator('/repo');

			const result = await orchestrator.mergeExploration('exp-1', 1, { strategy: 'direct' });

			expect(result.success).toBe(true);
			expect(mockExecute).toHaveBeenCalledWith('git', ['merge', '--no-ff', worktree.branch_name], expect.anything());
			expect(mockExecute).toHaveBeenCalledWith('git', ['rev-parse', 'HEAD'], expect.anything());
		});

		it('squash merge calls SafeExecutor.execute("git", [...]) with the expected argument arrays', async () => {
			const orchestrator = new MergeOrchestrator('/repo');

			const result = await orchestrator.mergeExploration('exp-1', 1, { strategy: 'squash' });

			expect(result.success).toBe(true);
			expect(mockExecute).toHaveBeenCalledWith('git', ['merge', '--squash', worktree.branch_name], expect.anything());
		});

		it('rebase merge calls SafeExecutor.execute("git", [...]) with the expected argument arrays', async () => {
			const orchestrator = new MergeOrchestrator('/repo');

			const result = await orchestrator.mergeExploration('exp-1', 1, {
				strategy: 'rebase',
				target_branch: 'main'
			});

			expect(result.success).toBe(true);
			expect(mockExecute).toHaveBeenCalledWith('git', ['checkout', worktree.branch_name], expect.anything());
			expect(mockExecute).toHaveBeenCalledWith('git', ['rebase', 'main'], expect.anything());
			expect(mockExecute).toHaveBeenCalledWith('git', ['merge', '--ff-only', worktree.branch_name], expect.anything());
		});
	});

	describe('autoResolveConflicts — option/pathspec injection via an untrusted branch conflict file name', () => {
		// conflict.file_path comes verbatim from parsing `git status
		// --porcelain` of an UNTRUSTED exploration branch's working tree —
		// with no `--` end-of-options marker, git parses an option-shaped
		// path (e.g. `--upload-pack=...`) as a FLAG, not a literal path, even
		// as a single argv element. Array-form SafeExecutor.execute only
		// stops shell metacharacter injection, not this git-level ambiguity.
		it("passes '--' before the conflicted file path in both checkout --ours and add", async () => {
			const maliciousPath = '--upload-pack=touch /tmp/pwned';
			let mergeAttempted = false;
			mockExecute.mockImplementation(async (command: string, args: string[]) => {
				const [first, second] = args;
				if (first === 'merge' && second === '--no-ff') {
					mergeAttempted = true;
					throw new Error(`Command failed with exit code 1: CONFLICT (content): Merge conflict in ${maliciousPath}`);
				}
				if (first === 'status' && second === '--porcelain' && mergeAttempted) {
					return gitOk(`UU ${maliciousPath}\n`);
				}
				return defaultResponder(command, args);
			});

			const orchestrator = new MergeOrchestrator('/repo');

			await orchestrator.mergeExploration('exp-1', 1, { auto_resolve_conflicts: true, strategy: 'direct' });

			expect(mockExecute).toHaveBeenCalledWith('git', ['checkout', '--ours', '--', maliciousPath], expect.anything());
			expect(mockExecute).toHaveBeenCalledWith('git', ['add', '--', maliciousPath], expect.anything());
		});
	});

	describe('validateMerge (via mergeExploration)', () => {
		it('fails when the worktree status is not "completed"', async () => {
			// validateMerge() collects every check's errors rather than short-circuiting
			// on the first — the branch-existence and working-tree-clean checks below
			// still run (and pass, per the default responder) even though this one fails.
			worktree.status = 'running';
			const orchestrator = new MergeOrchestrator('/repo');

			const result = await orchestrator.mergeExploration('exp-1', 1, { strategy: 'direct' });

			expect(result.success).toBe(false);
			expect(result.error).toContain("Worktree status is running, expected 'completed'");
			expect(mockExecute).not.toHaveBeenCalledWith(
				'git',
				['merge', '--no-ff', worktree.branch_name],
				expect.anything()
			);
		});

		it('fails when the worktree no longer exists on disk', async () => {
			mockWorktreeExists.mockResolvedValue(false);
			const orchestrator = new MergeOrchestrator('/repo');

			const result = await orchestrator.mergeExploration('exp-1', 1, { strategy: 'direct' });

			expect(result.success).toBe(false);
			expect(result.error).toContain('Worktree does not exist');
		});

		it('fails when the main repo working tree has uncommitted changes', async () => {
			mockExecute.mockImplementation(async (command: string, args: string[]) => {
				const [first, second] = args;
				if (first === 'status' && second === '--porcelain') return gitOk(' M dirty-file.txt\n');
				return defaultResponder(command, args);
			});
			const orchestrator = new MergeOrchestrator('/repo');

			const result = await orchestrator.mergeExploration('exp-1', 1, { strategy: 'direct' });

			expect(result.success).toBe(false);
			expect(result.error).toContain('uncommitted changes');
		});

		it('fails when an explicit target_branch does not exist', async () => {
			mockExecute.mockImplementation(async (command: string, args: string[]) => {
				const [first, second] = args;
				if (first === 'rev-parse' && second === '--verify' && args[2] === 'nonexistent-branch') {
					throw new Error('Command failed with exit code 128: unknown revision');
				}
				return defaultResponder(command, args);
			});
			const orchestrator = new MergeOrchestrator('/repo');

			const result = await orchestrator.mergeExploration('exp-1', 1, {
				strategy: 'direct',
				target_branch: 'nonexistent-branch'
			});

			expect(result.success).toBe(false);
			expect(result.error).toContain('Target branch does not exist: nonexistent-branch');
		});
	});

	describe('conflict-abort path', () => {
		it('aborts the merge and reports failure when conflicts are detected and auto-resolve is disabled', async () => {
			mockExecute.mockImplementation(async (command: string, args: string[]) => {
				const [first, second] = args;
				if (first === 'merge' && second === '--no-ff') {
					throw new Error('Command failed with exit code 1: CONFLICT (content): Merge conflict in src/index.ts');
				}
				return defaultResponder(command, args);
			});
			const orchestrator = new MergeOrchestrator('/repo');

			const result = await orchestrator.mergeExploration('exp-1', 1, {
				auto_resolve_conflicts: false,
				strategy: 'direct'
			});

			expect(result.success).toBe(false);
			expect(result.conflicts_detected).toBe(true);
			expect(result.error).toBe('Conflicts detected and auto_resolve_conflicts is disabled');
			expect(mockExecute).toHaveBeenCalledWith('git', ['merge', '--abort'], expect.anything());
		});

		it('aborts and reports failure when auto-resolution itself fails', async () => {
			let mergeAttempted = false;
			mockExecute.mockImplementation(async (command: string, args: string[]) => {
				const [first, second] = args;
				if (first === 'merge' && second === '--no-ff') {
					mergeAttempted = true;
					throw new Error('Command failed with exit code 1: CONFLICT (content): Merge conflict in src/index.ts');
				}
				if (first === 'status' && second === '--porcelain' && mergeAttempted) return gitOk('UU src/index.ts\n');
				// The specific checkout --ours attempt for the conflicted file fails —
				// e.g. a filesystem permission error — leaving the conflict unresolved.
				if (first === 'checkout' && second === '--ours') {
					throw new Error('permission denied');
				}
				return defaultResponder(command, args);
			});
			const orchestrator = new MergeOrchestrator('/repo');

			const result = await orchestrator.mergeExploration('exp-1', 1, {
				auto_resolve_conflicts: true,
				strategy: 'direct'
			});

			expect(result.success).toBe(false);
			expect(result.error).toBe('Failed to auto-resolve conflicts');
			expect(mockExecute).toHaveBeenCalledWith('git', ['merge', '--abort'], expect.anything());
		});
	});

	describe('previewMerge', () => {
		it('reports can_merge: true with the commit count when no conflicts arise', async () => {
			const orchestrator = new MergeOrchestrator('/repo');

			const preview = await orchestrator.previewMerge('exp-1', 1);

			expect(preview).toEqual({ can_merge: true, commits_to_merge: 3, conflicts: [], files_changed: 0 });
			expect(mockExecute).toHaveBeenCalledWith(
				'git',
				['merge', '--no-commit', '--no-ff', worktree.branch_name],
				expect.anything()
			);
			expect(mockExecute).toHaveBeenCalledWith('git', ['merge', '--abort'], expect.anything());
		});

		it('reports can_merge: false with the detected conflicts when the preview merge fails', async () => {
			mockExecute.mockImplementation(async (command: string, args: string[]) => {
				const [first, second] = args;
				if (first === 'merge' && second === '--no-commit') {
					throw new Error('Command failed with exit code 1: CONFLICT (content): Merge conflict in src/index.ts');
				}
				if (first === 'status' && second === '--porcelain') return gitOk('UU src/index.ts\n');
				return defaultResponder(command, args);
			});
			const orchestrator = new MergeOrchestrator('/repo');

			const preview = await orchestrator.previewMerge('exp-1', 1);

			expect(preview.can_merge).toBe(false);
			expect(preview.conflicts).toEqual([{ conflict_type: 'content', file_path: 'src/index.ts', resolved: false }]);
			expect(mockExecute).toHaveBeenCalledWith('git', ['merge', '--abort'], expect.anything());
		});

		it('throws when the requested worktree index does not exist', async () => {
			const orchestrator = new MergeOrchestrator('/repo');

			await expect(orchestrator.previewMerge('exp-1', 99)).rejects.toThrow('Worktree 99 not found');
		});
	});
});
