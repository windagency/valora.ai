import { describe, expect, it } from 'vitest';

import { filterDocker, filterGit, filterMake, filterRg } from '../src/strategies';

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

		it('caps added lines per hunk and appends a summary when exceeded', () => {
			const hunk = [
				'diff --git a/big.ts b/big.ts',
				'@@ -0,0 +1,20 @@',
				...Array.from({ length: 20 }, (_, i) => `+line ${i + 1}`),
				' context after'
			].join('\n');
			const result = filterGit(hunk, 'git diff HEAD');
			const plusLines = result.split('\n').filter((l) => l.startsWith('+'));
			expect(plusLines.length).toBeLessThanOrEqual(15);
			expect(result).toContain('[... 5 more +lines]');
			expect(result).toContain(' context after');
		});

		it('caps removed lines per hunk and appends a summary when exceeded', () => {
			const hunk = [
				'diff --git a/big.ts b/big.ts',
				'@@ -1,20 +0,0 @@',
				...Array.from({ length: 20 }, (_, i) => `-line ${i + 1}`),
				' context after'
			].join('\n');
			const result = filterGit(hunk, 'git diff HEAD');
			const minusLines = result.split('\n').filter((l) => l.startsWith('-'));
			expect(minusLines.length).toBeLessThanOrEqual(15);
			expect(result).toContain('[... 5 more -lines]');
			expect(result).toContain(' context after');
		});

		it('resets the removed-line counter at each hunk header', () => {
			const hunk = [
				'diff --git a/big.ts b/big.ts',
				'@@ -1,5 +0,0 @@',
				...Array.from({ length: 5 }, (_, i) => `-first hunk ${i + 1}`),
				'@@ -20,20 +15,0 @@',
				...Array.from({ length: 20 }, (_, i) => `-second hunk ${i + 1}`),
				' context after'
			].join('\n');
			const result = filterGit(hunk, 'git diff HEAD');
			expect(result).toContain('[... 5 more -lines]');
			expect(result).not.toContain('[... 10 more -lines]');
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

	describe('git show', () => {
		const showOutput = [
			'commit a3f8c2e1b2c3d4e5f6789abc',
			'Author: Dev <dev@example.com>',
			'Date:   Mon Jan 1 12:00:00 2025 +0000',
			'',
			'    feat(auth): add OAuth2 support',
			'',
			'diff --git a/src/auth.ts b/src/auth.ts',
			'index 000000..aabbcc 100644',
			'--- a/src/auth.ts',
			'+++ b/src/auth.ts',
			'@@ -1,3 +1,5 @@',
			'+import { oauth } from "lib";',
			' existing line'
		].join('\n');

		it('condenses the commit header to a single hash+subject line', () => {
			const result = filterGit(showOutput, 'git show HEAD');
			expect(result).toMatch(/^a3f8c2e feat\(auth\): add OAuth2 support/m);
			expect(result).not.toContain('Author:');
			expect(result).not.toContain('Date:');
		});

		it('preserves the diff content after the header', () => {
			const result = filterGit(showOutput, 'git show HEAD');
			expect(result).toContain('+import { oauth }');
			expect(result).toContain('existing line');
		});

		it('removes index HASH..HASH lines from the embedded diff', () => {
			const result = filterGit(showOutput, 'git show HEAD');
			expect(result).not.toMatch(/^index [0-9a-f]+\.\./m);
		});
	});

	it('passes through non-diff/log/status/show subcommands unchanged', () => {
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

	it('caps matches per file and appends a summary line when exceeded', () => {
		const lines = Array.from({ length: 8 }, (_, i) => `src/foo.ts:export function fn${i}() {}`);
		const result = filterRg(lines.join('\n'), 'rg function src/');
		const kept = result.split('\n').filter((l) => l.includes('src/foo.ts'));
		expect(kept.length).toBeLessThanOrEqual(6); // 5 examples + 1 summary line
		expect(result).toContain('[... 3 more in foo.ts]');
	});

	it('preserves all matches when within per-file limit', () => {
		const lines = ['src/a.ts:match one', 'src/a.ts:match two', 'src/b.ts:match three'];
		const result = filterRg(lines.join('\n'), 'rg pattern src/');
		expect(result).toContain('src/a.ts:match one');
		expect(result).toContain('src/a.ts:match two');
		expect(result).toContain('src/b.ts:match three');
		expect(result).not.toContain('[... ');
	});

	it('preserves context-separator lines (--)', () => {
		const lines = ['src/a.ts-context', 'src/a.ts:match', 'src/a.ts-context', '--', 'src/b.ts:match'];
		const result = filterRg(lines.join('\n'), 'rg -C 1 pattern src/');
		expect(result).toContain('--');
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

	it('drops BuildKit sha256 layer transfer and extraction lines', () => {
		const input = [
			'#4 [1/3] FROM docker.io/library/node:20@sha256:abcdef',
			'#4 sha256:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890 0B / 30.14MB 0.1s',
			'#4 sha256:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890 30.14MB / 30.14MB done',
			'#4 extracting sha256:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890 done',
			'#4 resolve docker.io/library/node:20 done',
			'#4 DONE 3.0s'
		].join('\n');
		const result = filterDocker(input, 'docker build .');
		expect(result).not.toMatch(/^#\d+ sha256:[0-9a-f]{64}/m);
		expect(result).not.toContain('extracting sha256:');
		expect(result).not.toContain('resolve docker.io');
		expect(result).toContain('#4 [1/3] FROM');
		expect(result).toContain('#4 DONE 3.0s');
	});

	it('drops BuildKit internal and boilerplate lines', () => {
		const input = [
			'#0 building with "default" instance using docker driver',
			'#1 [internal] load build definition from Dockerfile',
			'#1 transferring dockerfile: 143B done',
			'#1 DONE 0.0s',
			'#4 [1/3] FROM docker.io/library/alpine:3.19',
			'#4 CACHED'
		].join('\n');
		const result = filterDocker(input, 'docker build .');
		expect(result).not.toContain('#0 building with');
		expect(result).not.toContain('[internal]');
		expect(result).not.toContain('transferring dockerfile');
		expect(result).toContain('#4 [1/3] FROM');
		expect(result).toContain('#4 CACHED');
		expect(result).toContain('#1 DONE 0.0s');
	});

	it('keeps writing image sha256 line and command output', () => {
		const input = [
			'#7 writing image sha256:abcdef1234 done',
			'#5 1.234 Successfully installed sinatra-4.2.1',
			'#5 ERROR: process did not complete: exit code 1'
		].join('\n');
		const result = filterDocker(input, 'docker build .');
		expect(result).toContain('writing image sha256:abcdef1234 done');
		expect(result).toContain('Successfully installed');
		expect(result).toContain('ERROR: process did not complete');
	});

	it('drops pip Collecting/Downloading metadata lines within RUN steps', () => {
		const input = [
			'#5 [2/3] RUN pip install flask',
			'#5 1.222 Collecting flask',
			'#5 1.327   Downloading flask-3.1.3-py3-none-any.whl.metadata (3.2 kB)',
			'#5 2.409 Downloading flask-3.1.3-py3-none-any.whl (103 kB)',
			'#5 2.835 Installing collected packages: flask',
			'#5 3.748 Successfully installed flask-3.1.3',
			'#5 DONE 4.0s'
		].join('\n');
		const result = filterDocker(input, 'docker build .');
		expect(result).not.toContain('Collecting flask');
		expect(result).not.toContain('Downloading flask');
		expect(result).toContain('Installing collected packages');
		expect(result).toContain('Successfully installed flask-3.1.3');
		expect(result).toContain('#5 [2/3] RUN pip install flask');
		expect(result).toContain('#5 DONE 4.0s');
	});

	it('drops pip progress bars and pip update notices within RUN steps', () => {
		const input = [
			'#5 2.522    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 3.3/3.3 MB 49.7 MB/s eta 0:00:00',
			'#5 3.856 [notice] A new release of pip is available: 25.0.1 -> 26.0.1',
			'#5 3.856 [notice] To update, run: pip install --upgrade pip',
			'#5 3.748 Successfully installed flask-3.1.3'
		].join('\n');
		const result = filterDocker(input, 'docker build .');
		expect(result).not.toContain('━');
		expect(result).not.toContain('[notice]');
		expect(result).toContain('Successfully installed flask-3.1.3');
	});

	it('drops tab-indented build configuration options and stack frames in RUN steps', () => {
		const input = [
			'#5 1.234 Provided configuration options:',
			'#5 1.234 \t--with-opt-dir',
			'#5 1.234 \t--without-opt-dir',
			'#5 1.234 \t--with-opt-lib=${opt-dir}/lib',
			"#5 1.234 /usr/local/lib/ruby/mkmf.rb:480:in `try_do': compiler failed",
			"#5 1.234 \tfrom /usr/local/lib/ruby/mkmf.rb:606:in `block in try_compile'",
			"#5 1.234 \tfrom /usr/local/lib/ruby/mkmf.rb:553:in `with_werror'",
			'#5 1.234 ERROR: compiler failed to build'
		].join('\n');
		const result = filterDocker(input, 'docker build .');
		expect(result).not.toContain('--with-opt-dir');
		expect(result).not.toContain('--without-opt-dir');
		expect(result).not.toContain('mkmf.rb:606');
		expect(result).toContain('Provided configuration options:');
		expect(result).toContain('mkmf.rb:480');
		expect(result).toContain('ERROR: compiler failed');
	});

	it('drops BuildKit error-recap duplicate block but preserves the final error line', () => {
		const input = [
			'#5 ERROR: process "/bin/sh -c gem install" did not complete: exit code: 1',
			'------',
			' > [2/3] RUN gem install sinatra:',
			'1.234 Some duplicate output',
			'1.235 More duplicate output',
			'------',
			'Dockerfile:2',
			'--------------------',
			'   1 |     FROM ruby:3.3-slim',
			'   2 | >>> RUN gem install sinatra',
			'--------------------',
			'ERROR: failed to build: failed to solve: exit code: 1'
		].join('\n');
		const result = filterDocker(input, 'docker build .');
		expect(result).not.toContain('------');
		expect(result).not.toContain(' > [2/3]');
		expect(result).not.toContain('1.234 Some duplicate');
		expect(result).not.toContain('Dockerfile:2');
		expect(result).not.toContain('--------------------');
		expect(result).not.toContain('   1 |');
		expect(result).toContain('#5 ERROR: process');
		expect(result).toContain('ERROR: failed to build');
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
