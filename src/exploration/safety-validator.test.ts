/**
 * Tests for SafetyValidator
 *
 * Focused on the array-form SafeExecutor.execute conversion — repoRoot is a
 * caller-influenced constructor argument that reached a shell string via
 * `df -BG "${repoRoot}"`. Not currently reachable (both real call sites
 * construct with zero args, defaulting to process.cwd()), converted for
 * consistency with the rest of this session's array-form work.
 *
 * child_process itself is mocked defensively (not just utils/safe-exec) so a
 * mismatch between this test's mocks and the source's actual exec mechanism
 * fails loudly instead of silently running real git/docker/df commands
 * against the host.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('child_process', () => ({
	exec: () => {
		throw new Error('Real child_process.exec must never be called in tests — mock utils/safe-exec instead.');
	}
}));

const mockExecute = vi.fn();
vi.mock('utils/safe-exec', () => ({
	SafeExecutor: {
		execute: (...args: unknown[]) => mockExecute(...args)
	}
}));

const { SafetyValidator } = await import('./safety-validator');

function execResult(stdout: string): { exitCode: number; stderr: string; stdout: string } {
	return { exitCode: 0, stderr: '', stdout };
}

/** Default happy-path responder for every call the full validate() sequence needs. */
function defaultResponder(command: string, args: string[]): ReturnType<typeof execResult> {
	if (command === 'df')
		return execResult('Filesystem 1G-blocks Used Available Use% Mounted\n/dev/sda1 10G 5G 5G 50% /\n');
	if (command === 'docker' && args[0] === 'info') return execResult('Server Version: 24.0.0\n');
	if (command === 'docker' && args[0] === 'version') return execResult('24.0.0\n');
	if (command === 'git' && args[0] === 'branch') return execResult('main\n');
	return execResult('');
}

describe('SafetyValidator', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockExecute.mockImplementation(async (command: string, args: string[]) => defaultResponder(command, args));
	});

	describe('checkDiskSpace / getResourceAvailability', () => {
		it('passes repoRoot as a literal array element to df, with no shell involved', async () => {
			const maliciousRepoRoot = '/tmp/repo"; touch /tmp/poc; echo "';
			const validator = new SafetyValidator(maliciousRepoRoot, { check_docker: false });

			await validator.validate(1);

			expect(mockExecute).toHaveBeenCalledWith('df', ['-BG', maliciousRepoRoot]);
		});
	});

	describe('getGitState', () => {
		it('calls SafeExecutor.execute("git", [...]) for status/branch/worktree/fetch, with no shell involved', async () => {
			const validator = new SafetyValidator('/repo');

			const state = await validator.getGitState();

			expect(mockExecute).toHaveBeenCalledWith('git', ['status', '--porcelain'], expect.anything());
			expect(mockExecute).toHaveBeenCalledWith('git', ['branch', '--show-current'], expect.anything());
			expect(mockExecute).toHaveBeenCalledWith('git', ['worktree', 'list', '--porcelain'], expect.anything());
			expect(mockExecute).toHaveBeenCalledWith('git', ['fetch', 'origin', 'main:main'], expect.anything());
			expect(state.current_branch).toBe('main');
			expect(state.is_clean).toBe(true);
		});
	});

	describe('checkDockerAvailability', () => {
		it('calls SafeExecutor.execute("docker", [...]) with no shell involved', async () => {
			const validator = new SafetyValidator('/repo');

			const validation = await validator.validate(1);

			expect(mockExecute).toHaveBeenCalledWith('docker', ['info']);
			const dockerCheck = validation.checks.find((c) => c.name === 'Docker Availability');
			expect(dockerCheck?.passed).toBe(true);
		});
	});
});
