import { describe, expect, it } from 'vitest';

import {
	filterCat,
	filterCurl,
	filterDiff,
	filterDocker,
	filterGh,
	filterGit,
	filterJson,
	filterLog,
	filterLs,
	filterMake,
	filterRg
} from './strategies';

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

describe('filterLs', () => {
	it('strips permissions, link count, owner, group, and timestamp from ls -la lines', () => {
		const input = [
			'total 48',
			'-rw-r--r--  1 user group  1234 Apr 23 12:00 foo.ts',
			'drwxr-xr-x  4 user group  4096 Apr 23 12:00 src'
		].join('\n');
		const result = filterLs(input, 'ls -la');
		expect(result).not.toContain('drwxr-xr-x');
		expect(result).not.toContain('user group');
		expect(result).toContain('foo.ts');
		expect(result).toContain('src');
	});

	it('skips . and .. entries', () => {
		const input = [
			'drwxr-xr-x  2 user group  4096 Apr 23 12:00 .',
			'drwxr-xr-x  5 user group  4096 Apr 23 12:00 ..',
			'-rw-r--r--  1 user group   512 Apr 23 12:00 file.ts'
		].join('\n');
		const result = filterLs(input, 'ls -la');
		const lines = result.split('\n').filter(Boolean);
		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain('file.ts');
	});

	it('caps entries at 50 and appends a summary when exceeded', () => {
		const lines = Array.from({ length: 60 }, (_, i) => `-rw-r--r--  1 u g  100 Apr 23 12:00 file${i}.ts`);
		const result = filterLs(lines.join('\n'), 'ls -la');
		const fileLines = result.split('\n').filter((l) => l.includes('file'));
		expect(fileLines).toHaveLength(50);
		expect(result).toContain('[... 10 more entries]');
	});

	it('caps plain path output (find, tree) at 50 lines', () => {
		const input = Array.from({ length: 80 }, (_, i) => `./src/file${i}.ts`).join('\n');
		const result = filterLs(input, 'find . -name "*.ts"');
		const kept = result.split('\n').filter((l) => l.startsWith('./src/'));
		expect(kept.length).toBeLessThanOrEqual(50);
		expect(result).toContain('[... ');
	});
});

describe('filterCat', () => {
	it('passes through files at or below 100 lines unchanged', () => {
		const input = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n');
		expect(filterCat(input, 'cat README.md')).toBe(input);
	});

	it('truncates long files and appends a line-count summary', () => {
		const input = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n');
		const result = filterCat(input, 'cat big-file.ts');
		const lines = result.split('\n');
		expect(lines).toHaveLength(101); // 100 content + 1 summary
		expect(result).toContain('[... 100 more lines]');
	});
});

describe('filterDiff', () => {
	it('caps added lines per hunk and appends a summary', () => {
		const input = [
			'--- a/file.txt',
			'+++ b/file.txt',
			'@@ -0,0 +1,20 @@',
			...Array.from({ length: 20 }, (_, i) => `+line ${i + 1}`)
		].join('\n');
		const result = filterDiff(input, 'diff -u a.txt b.txt');
		const plusLines = result.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));
		expect(plusLines.length).toBeLessThanOrEqual(15);
		expect(result).toContain('[... 5 more +lines]');
	});

	it('caps removed lines per hunk and appends a summary', () => {
		const input = [
			'--- a/file.txt',
			'+++ b/file.txt',
			'@@ -1,20 +0,0 @@',
			...Array.from({ length: 20 }, (_, i) => `-line ${i + 1}`)
		].join('\n');
		const result = filterDiff(input, 'diff -u a.txt b.txt');
		const minusLines = result.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---'));
		expect(minusLines.length).toBeLessThanOrEqual(15);
		expect(result).toContain('[... 5 more -lines]');
	});

	it('preserves hunk headers', () => {
		const input = ['--- a/f.txt', '+++ b/f.txt', '@@ -1,2 +1,2 @@', '-old', '+new'].join('\n');
		const result = filterDiff(input, 'diff -u a.txt b.txt');
		expect(result).toContain('@@ -1,2 +1,2 @@');
	});
});

describe('filterCurl', () => {
	it('strips curl progress table header and download percentage lines', () => {
		const input = [
			'  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current',
			'                                 Dload  Upload   Total   Spent    Left  Speed',
			'100  1234  100  1234    0     0   5678      0 --:--:-- --:--:-- --:--:--  5678',
			'{"ok": true}'
		].join('\n');
		const result = filterCurl(input, 'curl https://api.example.com');
		expect(result).not.toContain('% Total');
		expect(result).not.toContain('Dload');
		expect(result).not.toMatch(/^\s*\d+\s+\d+\s+\d+/m);
		expect(result).toContain('{"ok": true}');
	});

	it('strips wget progress bar lines', () => {
		const input = [
			'--2025-04-23 12:00:00--  https://example.com/file.zip',
			'Resolving example.com... 1.2.3.4',
			'file.zip            100%[=========================>]  12.06K  --.-KB/s    in 0.05s',
			"2025-04-23 12:00:01 (215 KB/s) - 'file.zip' saved [12345/12345]"
		].join('\n');
		const result = filterCurl(input, 'wget https://example.com/file.zip');
		expect(result).not.toMatch(/\[={5,}/);
		expect(result).toContain('Resolving example.com');
		expect(result).toContain("'file.zip' saved");
	});

	it('truncates long response bodies and appends a summary', () => {
		const body = Array.from({ length: 200 }, (_, i) => `{"item": ${i}}`).join('\n');
		const result = filterCurl(body, 'curl https://api.example.com/large');
		expect(result.split('\n').length).toBeLessThanOrEqual(51);
		expect(result).toContain('[... ');
	});
});

describe('filterJson', () => {
	it('passes through short JSON unchanged', () => {
		const input = '{"name": "Alice", "age": 30}';
		expect(filterJson(input, 'jq .')).toBe(input);
	});

	it('truncates long string values in-line', () => {
		const longStr = 'a'.repeat(100);
		const input = `{"key": "${longStr}"}`;
		const result = filterJson(input, 'jq .');
		expect(result).not.toContain(longStr);
		expect(result).toContain('...');
	});

	it('caps output at 50 lines and appends a summary', () => {
		const input = Array.from({ length: 200 }, (_, i) => `  "key${i}": "value"`).join('\n');
		const result = filterJson(input, 'jq .');
		expect(result.split('\n').length).toBeLessThanOrEqual(51);
		expect(result).toContain('[... ');
	});
});

describe('filterLog', () => {
	it('collapses consecutive repeated log lines into a count', () => {
		const input = [
			'2025-04-23 12:00:00 INFO Request received',
			'2025-04-23 12:00:01 INFO Request received',
			'2025-04-23 12:00:02 INFO Request received',
			'2025-04-23 12:00:03 INFO Response sent'
		].join('\n');
		const result = filterLog(input, 'tail -f app.log');
		expect(result).toContain('[repeated 3 times]');
		expect(result).toContain('Response sent');
	});

	it('does not collapse lines that differ', () => {
		const input = ['2025-04-23 INFO Start', '2025-04-23 INFO Middle', '2025-04-23 INFO End'].join('\n');
		const result = filterLog(input, 'tail app.log');
		expect(result).not.toContain('[repeated');
		expect(result.split('\n')).toHaveLength(3);
	});

	it('works with lines that have no timestamp prefix', () => {
		const input = ['same line', 'same line', 'same line', 'different'].join('\n');
		const result = filterLog(input, 'journalctl');
		expect(result).toContain('[repeated 3 times]');
		expect(result).toContain('different');
	});
});

describe('filterGh', () => {
	it('collapses successful run list entries into a count and preserves failures', () => {
		const input = [
			'completed\tsuccess\tCI\tci.yml\tmain\tpush\t1111\t10m',
			'completed\tsuccess\tCI\tci.yml\tmain\tpush\t1110\t1h',
			'completed\tsuccess\tCI\tci.yml\tmain\tpush\t1109\t2h',
			'completed\tfailure\tCI\tci.yml\tfix\tpush\t1108\t3h'
		].join('\n');
		const result = filterGh(input, 'gh run list');
		expect(result).toContain('[3 successful runs]');
		expect(result).toContain('failure');
		expect(result).not.toContain('\t1111\t');
	});

	it('passes through gh pr list unchanged', () => {
		const input = '#123\tFix bug\tmain\tOPEN\t2h ago';
		expect(filterGh(input, 'gh pr list')).toBe(input);
	});

	it('passes through gh issue list unchanged', () => {
		const input = '#456\tUpdate deps\tOPEN\t1d ago';
		expect(filterGh(input, 'gh issue list')).toBe(input);
	});
});

describe('filterDocker (extended)', () => {
	it('removes the COMMAND column from docker ps output', () => {
		const input = [
			'CONTAINER ID   IMAGE   COMMAND           CREATED    STATUS    PORTS     NAMES',
			'a1b2c3d4e5f6   nginx   "/entrypoint.sh"  2h ago     Up 2h     80/tcp    web'
		].join('\n');
		const result = filterDocker(input, 'docker ps');
		expect(result).not.toContain('"/entrypoint.sh"');
		expect(result).toContain('nginx');
		expect(result).toContain('web');
	});

	it('removes the IMAGE ID column from docker images output', () => {
		const input = [
			'REPOSITORY   TAG       IMAGE ID       CREATED      SIZE',
			'nginx        latest    a1b2c3d4e5f6   2 days ago   187MB'
		].join('\n');
		const result = filterDocker(input, 'docker images');
		expect(result).not.toMatch(/[0-9a-f]{12}/);
		expect(result).toContain('nginx');
		expect(result).toContain('187MB');
	});

	it('deduplicates repeated lines in docker logs', () => {
		const input = [
			'2025-04-23T12:00:00Z INFO health check ok',
			'2025-04-23T12:00:05Z INFO health check ok',
			'2025-04-23T12:00:10Z INFO health check ok',
			'2025-04-23T12:00:15Z ERROR connection refused'
		].join('\n');
		const result = filterDocker(input, 'docker logs web');
		expect(result).toContain('[repeated 3 times]');
		expect(result).toContain('connection refused');
	});
});
