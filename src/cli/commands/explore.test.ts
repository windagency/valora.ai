import { describe, expect, it, vi } from 'vitest';

import type { Spinner } from 'ui/spinner-adapter.interface';

import { cleanupLeftoverBranches } from './explore';

vi.mock('output/color-adapter.interface', () => ({
	getColorAdapter: () => ({
		yellow: (s: string) => s
	})
}));

function makeSpinner(): Spinner {
	return {
		fail: vi.fn(),
		info: vi.fn(),
		prefixText: '',
		start: vi.fn(),
		stop: vi.fn(),
		succeed: vi.fn(),
		text: '',
		warn: vi.fn()
	} as unknown as Spinner;
}

function makeWorktreeManager(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		deleteBranch: vi.fn().mockResolvedValue(undefined),
		getExplorationWorktrees: vi.fn().mockResolvedValue([]),
		listBranchesByPrefix: vi.fn().mockResolvedValue([]),
		removeWorktree: vi.fn().mockResolvedValue(undefined),
		...overrides
	};
}

describe('cleanupLeftoverBranches', () => {
	it('lists branches via the safe array-form WorktreeManager method, not a raw shell command', async () => {
		const worktreeManager = makeWorktreeManager();

		await cleanupLeftoverBranches('exp-abc123', worktreeManager as never, makeSpinner());

		expect(worktreeManager.listBranchesByPrefix).toHaveBeenCalledWith('exploration/exp-abc123');
	});

	it('deletes every branch returned by listBranchesByPrefix', async () => {
		const worktreeManager = makeWorktreeManager({
			listBranchesByPrefix: vi.fn().mockResolvedValue(['exploration/exp-abc123-1', 'exploration/exp-abc123-2'])
		});

		await cleanupLeftoverBranches('exp-abc123', worktreeManager as never, makeSpinner());

		expect(worktreeManager.deleteBranch).toHaveBeenCalledWith('exploration/exp-abc123-1', true);
		expect(worktreeManager.deleteBranch).toHaveBeenCalledWith('exploration/exp-abc123-2', true);
	});

	it('does not call listBranchesByPrefix (and so cannot reach git at all) when explorationId fails validation', async () => {
		// A crafted exploration ID containing shell metacharacters must be
		// rejected before it ever reaches any branch-listing call — this is
		// the fix for a real command-injection PoC that previously worked
		// against a raw `execSync(\`git branch --list "exploration/${id}*"\`)`.
		const worktreeManager = makeWorktreeManager();
		const maliciousId = 'foo" ; echo INJECTED > /tmp/valora-poc.txt ; echo "';

		await cleanupLeftoverBranches(maliciousId, worktreeManager as never, makeSpinner());

		expect(worktreeManager.listBranchesByPrefix).not.toHaveBeenCalled();
		expect(worktreeManager.deleteBranch).not.toHaveBeenCalled();
	});

	it('still removes matching worktrees even when the exploration ID fails validation for branch cleanup', async () => {
		const maliciousId = 'foo"; touch /tmp/x; echo "';
		const worktreeManager = makeWorktreeManager({
			getExplorationWorktrees: vi
				.fn()
				.mockResolvedValue([{ branch: `exploration/${maliciousId}`, commit: 'abc', path: '/tmp/wt', prunable: false }])
		});

		await cleanupLeftoverBranches(maliciousId, worktreeManager as never, makeSpinner());

		expect(worktreeManager.removeWorktree).toHaveBeenCalledWith('/tmp/wt', true);
	});
});
