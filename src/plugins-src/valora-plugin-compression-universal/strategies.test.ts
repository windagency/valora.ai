import { describe, expect, it } from 'vitest';

import { filterDocker, filterGit, filterMake, filterRg } from './strategies';

function pad(str: string, targetLength: number): string {
	return str.repeat(Math.ceil(targetLength / str.length)).slice(0, targetLength);
}

describe('filterGit', () => {
	describe('git diff', () => {
		const gitDiffOutput = [
			'diff --git a/src/foo.ts b/src/foo.ts',
			'index a3f8c2e..9d4b1f7 100644',
			'--- a/src/foo.ts',
			'+++ b/src/foo.ts',
			'@@ -10,6 +10,7 @@ function foo() {',
			' context line',
			'-removed line',
			'+added line',
			' another context line'
		].join('\n');

		it('removes "index HASH..HASH" lines', () => {
			const result = filterGit(gitDiffOutput + '\n' + pad(' context\n', 500), 'git diff HEAD');
			expect(result).not.toMatch(/^index [0-9a-f]+\.\.[0-9a-f]+/m);
		});

		it('preserves diff --git header lines', () => {
			const result = filterGit(gitDiffOutput + '\n' + pad(' context\n', 500), 'git diff HEAD');
			expect(result).toContain('diff --git a/src/foo.ts');
		});

		it('preserves changed lines (+/-)', () => {
			const result = filterGit(gitDiffOutput + '\n' + pad(' context\n', 500), 'git diff HEAD');
			expect(result).toContain('-removed line');
			expect(result).toContain('+added line');
		});

		it('removes "old mode / new mode" lines', () => {
			const modeChange = ['diff --git a/script.sh b/script.sh', 'old mode 100644', 'new mode 100755'].join('\n');
			const result = filterGit(modeChange + '\n' + pad(' context\n', 500), 'git diff');
			expect(result).not.toMatch(/^old mode/m);
			expect(result).not.toMatch(/^new mode/m);
		});
	});

	describe('git log', () => {
		function makeCommit(hash: string, subject: string): string {
			return [
				`commit ${hash}`,
				'Author: Dev <dev@example.com>',
				'Date:   Mon Jan 1 12:00:00 2025 +0000',
				'',
				`    ${subject}`,
				''
			].join('\n');
		}

		it('condenses multi-line commit entries to one line per commit', () => {
			const log =
				makeCommit('a3f8c2e1b2c3d4e5f678', 'feat(auth): add OAuth2') +
				makeCommit('9d4b1f78', 'fix(cache): resolve race');
			const result = filterGit(log, 'git log --oneline');
			const lines = result.split('\n').filter(Boolean);
			expect(lines[0]).toMatch(/^a3f8c2e feat\(auth\): add OAuth2/);
			expect(lines[1]).toMatch(/^9d4b1f7 fix\(cache\): resolve race/);
		});

		it('caps output at 20 entries', () => {
			const log = Array.from({ length: 25 }, (_, i) =>
				makeCommit(`${String(i).padStart(2, '0')}abcdef1234567890`, `chore: commit ${i}`)
			).join('');
			const result = filterGit(log, 'git log');
			expect(result.split('\n').filter(Boolean).length).toBeLessThanOrEqual(20);
		});
	});

	describe('git status', () => {
		it('keeps branch line and file status lines', () => {
			const status = [
				'On branch feature/token-optimisation',
				'Changes not staged for commit:',
				'  (use "git add <file>..." to update)',
				'',
				'\tmodified:   src/foo.ts',
				''
			].join('\n');
			const result = filterGit(status, 'git status');
			expect(result).toContain('On branch feature/token-optimisation');
			expect(result).toContain('modified:   src/foo.ts');
			expect(result).not.toContain('(use "git add');
		});
	});

	it('passes through non-diff/log/status subcommands unchanged', () => {
		const output = 'everything\nfine';
		expect(filterGit(output, 'git fetch')).toBe(output);
	});
});

describe('filterRg', () => {
	it('deduplicates identical lines', () => {
		const input = 'match\nmatch\nother';
		expect(filterRg(input, 'rg foo')).toBe('match\nother');
	});

	it('caps output at 200 lines', () => {
		const input = Array.from({ length: 300 }, (_, i) => `line ${i}`).join('\n');
		const result = filterRg(input, 'grep foo');
		expect(result.split('\n').length).toBeLessThanOrEqual(200);
	});
});

describe('filterDocker', () => {
	it('removes progress/pull lines', () => {
		const input = [
			'Pulling from library/node',
			'Pulling fs layer',
			'Downloading',
			'Extracting',
			'Pull complete',
			'Digest: sha256:abc'
		].join('\n');
		const result = filterDocker(input, 'docker pull node');
		expect(result).not.toContain('Pulling fs layer');
		expect(result).toContain('Digest: sha256:abc');
	});
});

describe('filterMake', () => {
	it('removes Entering/Leaving directory lines', () => {
		const input = ['make[1]: Entering directory /src', 'gcc -o foo foo.c', 'make[1]: Leaving directory /src'].join(
			'\n'
		);
		const result = filterMake(input, 'make all');
		expect(result).not.toContain('Entering directory');
		expect(result).toContain('gcc -o foo foo.c');
	});
});
