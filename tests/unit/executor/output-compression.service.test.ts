/**
 * Unit tests for executor/output-compression.service.ts
 *
 * Tests the RTK-style content-aware output compression pipeline:
 * - stripAnsiCodes: removes ANSI escape sequences
 * - truncateTerminalOutput: head+tail safety net
 * - compressTerminalOutput: per-command filters + safety net
 *
 * Each filter is tested with representative input to verify:
 *   - Correct content is removed/condensed
 *   - Essential content (changed lines, errors, summary) is preserved
 *   - Unknown commands fall back gracefully
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	compressTerminalOutput,
	getCompressionStats,
	resetCompressionStats,
	stripAnsiCodes,
	truncateTerminalOutput
} from 'executor/output-compression.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Repeat `str` until total length >= targetLength. */
function pad(str: string, targetLength: number): string {
	return str.repeat(Math.ceil(targetLength / str.length)).slice(0, targetLength);
}

// ── stripAnsiCodes ────────────────────────────────────────────────────────────

describe('stripAnsiCodes', () => {
	it('removes colour sequences', () => {
		expect(stripAnsiCodes('\x1b[31mred text\x1b[0m')).toBe('red text');
	});

	it('removes multi-param sequences', () => {
		expect(stripAnsiCodes('\x1b[1;32mbold green\x1b[0m')).toBe('bold green');
	});

	it('returns plain text unchanged', () => {
		const plain = 'no escape codes here';
		expect(stripAnsiCodes(plain)).toBe(plain);
	});

	it('handles text with mixed plain and ANSI sections', () => {
		expect(stripAnsiCodes('before\x1b[33mcolour\x1b[0mafter')).toBe('beforecolourafter');
	});
});

// ── truncateTerminalOutput ────────────────────────────────────────────────────

describe('truncateTerminalOutput', () => {
	it('returns output unchanged when within the limit', () => {
		const short = pad('a', 100);
		expect(truncateTerminalOutput(short)).toBe(short);
	});

	it('applies head+tail truncation and inserts an omission marker', () => {
		const long = pad('x', 20_000);
		const result = truncateTerminalOutput(long);
		expect(result).toContain('[... ');
		expect(result).toContain(' characters omitted ...]\n\n');
		expect(result.length).toBeLessThanOrEqual(15_000 + 60); // ~60 chars for marker
	});
});

// ── compressTerminalOutput ────────────────────────────────────────────────────

describe('compressTerminalOutput', () => {
	describe('threshold', () => {
		it('returns short output unchanged (below threshold)', () => {
			const short = 'hello world';
			expect(compressTerminalOutput('git status', short)).toBe(short);
		});

		it('still strips ANSI codes even below the threshold', () => {
			const coloured = '\x1b[32mok\x1b[0m';
			expect(compressTerminalOutput('echo', coloured)).toBe('ok');
		});
	});

	describe('unknown commands', () => {
		it('passes output through unchanged (modulo ANSI strip) for unknown tools', () => {
			const output = pad('line\n', 1_000);
			const result = compressTerminalOutput('unknowntool --flag', output);
			// Content must be identical to the stripped version
			expect(result).toBe(output); // no ANSI in this input
		});
	});

	// ── git diff ───────────────────────────────────────────────────────────────

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
			// Pad to exceed threshold
			const padded = gitDiffOutput + '\n' + pad(' context\n', 1_000);
			const result = compressTerminalOutput('git diff HEAD', padded);
			expect(result).not.toMatch(/^index [0-9a-f]+\.\.[0-9a-f]+/m);
		});

		it('preserves diff --git header lines', () => {
			const padded = gitDiffOutput + '\n' + pad(' context\n', 1_000);
			const result = compressTerminalOutput('git diff HEAD', padded);
			expect(result).toContain('diff --git a/src/foo.ts');
		});

		it('preserves changed lines (+/-)', () => {
			const padded = gitDiffOutput + '\n' + pad(' context\n', 1_000);
			const result = compressTerminalOutput('git diff HEAD', padded);
			expect(result).toContain('-removed line');
			expect(result).toContain('+added line');
		});

		it('removes "old mode / new mode" lines', () => {
			const modeChange = ['diff --git a/script.sh b/script.sh', 'old mode 100644', 'new mode 100755'].join('\n');
			const padded = modeChange + '\n' + pad(' context\n', 1_000);
			const result = compressTerminalOutput('git diff', padded);
			expect(result).not.toMatch(/^old mode/m);
			expect(result).not.toMatch(/^new mode/m);
		});
	});

	// ── git log ────────────────────────────────────────────────────────────────

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
			const result = compressTerminalOutput('git log --oneline', log + pad('x', 500));
			const lines = result.split('\n').filter(Boolean);
			expect(lines[0]).toMatch(/^a3f8c2e feat\(auth\): add OAuth2/);
			expect(lines[1]).toMatch(/^9d4b1f7 fix\(cache\): resolve race/);
		});

		it('caps output at 20 entries', () => {
			const log = Array.from({ length: 25 }, (_, i) =>
				makeCommit(`${String(i).padStart(2, '0')}abcdef1234567890`, `chore: commit ${i}`)
			).join('');
			const result = compressTerminalOutput('git log', log);
			const lines = result.split('\n').filter(Boolean);
			expect(lines.length).toBeLessThanOrEqual(20);
		});
	});

	// ── git status ─────────────────────────────────────────────────────────────

	describe('git status', () => {
		const statusOutput = [
			'On branch feature/token-optimisation',
			'Changes not staged for commit:',
			'  (use "git add <file>..." to update what will be committed)',
			'',
			'\tmodified:   src/executor/output-compression.service.ts',
			'\tmodified:   src/config/constants.ts',
			'',
			'Untracked files:',
			'  (use "git add <file>..." to include in what will be committed)',
			'',
			'\tdata/prompts/_shared/conventional-commits.md',
			'',
			'no changes added to commit'
		].join('\n');

		it('preserves the branch line', () => {
			const padded = statusOutput + pad('x', 600);
			const result = compressTerminalOutput('git status', padded);
			expect(result).toContain('On branch feature/token-optimisation');
		});

		it('preserves modified file entries', () => {
			const padded = statusOutput + pad('x', 600);
			const result = compressTerminalOutput('git status', padded);
			expect(result).toContain('modified:   src/executor/output-compression.service.ts');
		});

		it('removes verbose usage hints from section headers', () => {
			const padded = statusOutput + pad('x', 600);
			const result = compressTerminalOutput('git status', padded);
			expect(result).not.toContain('use "git add');
		});
	});

	// ── vitest / jest ──────────────────────────────────────────────────────────

	describe('vitest / jest', () => {
		const testOutput = [
			' ✓ tests/unit/auth/auth.test.ts (5 tests) 45ms',
			' ✓ tests/unit/api/users.test.ts (3 tests) 20ms',
			' ✗ tests/unit/api/orders.test.ts (1 test | 1 failed)',
			'   × should validate order total',
			'     AssertionError: expected 0 to equal 100',
			' ✓ tests/unit/services/payment.test.ts (2 tests) 15ms',
			'Test Files  3 passed | 1 failed',
			'Tests       10 passed | 1 failed',
			'Duration    1.23s'
		].join('\n');

		it('collapses PASS suites to a count', () => {
			const padded = testOutput + pad('x', 600);
			const result = compressTerminalOutput('vitest run', padded);
			expect(result).toMatch(/\[2 test suites passed\]/);
		});

		it('preserves FAIL suite lines', () => {
			const padded = testOutput + pad('x', 600);
			const result = compressTerminalOutput('vitest run', padded);
			expect(result).toContain('✗ tests/unit/api/orders.test.ts');
		});

		it('preserves error traces inside FAIL blocks', () => {
			const padded = testOutput + pad('x', 600);
			const result = compressTerminalOutput('vitest run', padded);
			expect(result).toContain('AssertionError: expected 0 to equal 100');
		});

		it('preserves summary lines', () => {
			const padded = testOutput + pad('x', 600);
			const result = compressTerminalOutput('vitest run', padded);
			expect(result).toContain('Test Files  3 passed | 1 failed');
		});

		it('also applies to jest commands', () => {
			const padded = testOutput + pad('x', 600);
			const result = compressTerminalOutput('jest --coverage', padded);
			expect(result).toMatch(/\[\d+ test suite/);
		});
	});

	// ── package manager (npm / npx / pnpm / yarn) ─────────────────────────────

	describe('package manager', () => {
		const pkgOutput = [
			'⠋ Resolving packages...',
			'⠙ Resolving packages...',
			'Progress: resolved 120, reused 118, downloaded 2, added 2, done',
			'npm warn deprecated some-pkg@1.0.0: use new-pkg instead',
			'warning " > old-pkg@2.0.0" has unmet peer dependency "react@^17"',
			'found 3 vulnerabilities (1 moderate, 2 high)',
			'',
			'dependencies:',
			'+ some-package 1.0.0',
			'',
			'Done in 4.2s'
		].join('\n');

		it('removes pnpm Progress: lines', () => {
			const result = compressTerminalOutput('pnpm install', pkgOutput + pad('x', 600));
			expect(result).not.toContain('Progress: resolved');
		});

		it('removes braille spinner lines', () => {
			const result = compressTerminalOutput('pnpm install', pkgOutput + pad('x', 600));
			expect(result).not.toContain('⠋');
			expect(result).not.toContain('⠙');
		});

		it('removes npm warn lines', () => {
			const result = compressTerminalOutput('npm install', pkgOutput + pad('x', 600));
			expect(result).not.toContain('npm warn deprecated');
		});

		it('removes yarn warning peer-dep lines', () => {
			const result = compressTerminalOutput('yarn install', pkgOutput + pad('x', 600));
			expect(result).not.toContain('warning " > old-pkg');
		});

		it('removes audit advisory prose', () => {
			const result = compressTerminalOutput('npm install', pkgOutput + pad('x', 600));
			expect(result).not.toContain('found 3 vulnerabilities');
		});

		it('preserves the completion summary for pnpm', () => {
			const result = compressTerminalOutput('pnpm install', pkgOutput + pad('x', 600));
			expect(result).toContain('Done in 4.2s');
		});

		it('preserves the completion summary for npm', () => {
			const output = ['npm warn deprecated pkg@1: deprecated', 'added 42 packages in 3s'].join('\n') + pad('x', 600);
			const result = compressTerminalOutput('npm install', output);
			expect(result).toContain('added 42 packages in 3s');
		});

		it('also applies to npx commands', () => {
			const output = ['⠋ loading...', 'npx: installed 1 in 2s'].join('\n') + pad('x', 600);
			const result = compressTerminalOutput('npx some-tool', output);
			expect(result).not.toContain('⠋');
		});

		it('also applies to yarn commands', () => {
			const output = ['warning " > a@1" has unmet peer', 'Done in 2s'].join('\n') + pad('x', 600);
			const result = compressTerminalOutput('yarn add lodash', output);
			expect(result).not.toContain('warning " > a@1"');
			expect(result).toContain('Done in 2s');
		});
	});

	// ── rg / grep ──────────────────────────────────────────────────────────────

	describe('rg / grep', () => {
		it('deduplicates identical output lines', () => {
			const line = 'src/foo.ts:10:  some match\n';
			const output = line.repeat(5) + pad('other line\n', 500);
			const result = compressTerminalOutput('rg pattern', output);
			const occurrences = result.split('src/foo.ts:10:  some match').length - 1;
			expect(occurrences).toBe(1);
		});

		it('preserves unique lines', () => {
			const output = ['src/a.ts:1: match', 'src/b.ts:2: other match'].join('\n') + pad('x', 600);
			const result = compressTerminalOutput('rg pattern src/', output);
			expect(result).toContain('src/a.ts:1: match');
			expect(result).toContain('src/b.ts:2: other match');
		});

		it('also applies to grep commands', () => {
			const line = 'foo.ts:5: duplicate\n';
			const output = line.repeat(4) + pad('y', 500);
			const result = compressTerminalOutput('grep -r pattern .', output);
			const count = result.split('foo.ts:5: duplicate').length - 1;
			expect(count).toBe(1);
		});
	});

	// ── docker ─────────────────────────────────────────────────────────────────

	describe('docker', () => {
		const dockerPull = [
			'Pulling from library/node',
			'Pulling fs layer',
			'Waiting',
			'Downloading',
			'Extracting',
			'Pull complete',
			'Already exists',
			'Digest: sha256:abc123',
			'Status: Downloaded newer image for node:20'
		].join('\n');

		it('removes layer-pull progress lines', () => {
			const result = compressTerminalOutput('docker pull node:20', dockerPull + pad('x', 600));
			expect(result).not.toContain('Pulling from');
			expect(result).not.toContain('Pulling fs layer');
			expect(result).not.toContain('Pull complete');
			expect(result).not.toContain('Already exists');
		});

		it('preserves the digest and status lines', () => {
			const result = compressTerminalOutput('docker pull node:20', dockerPull + pad('x', 600));
			expect(result).toContain('Digest: sha256:abc123');
			expect(result).toContain('Status: Downloaded newer image for node:20');
		});
	});

	// ── make ───────────────────────────────────────────────────────────────────

	describe('make', () => {
		it('removes Entering/Leaving directory lines', () => {
			const output =
				['make[1]: Entering directory `/app/src`', 'gcc -o foo foo.c', 'make[1]: Leaving directory `/app/src`'].join(
					'\n'
				) + pad('x', 600);
			const result = compressTerminalOutput('make build', output);
			expect(result).not.toContain('Entering directory');
			expect(result).not.toContain('Leaving directory');
		});

		it('preserves recipe and error lines', () => {
			const output =
				[
					'make[1]: Entering directory `/app`',
					'gcc -o foo foo.c',
					'foo.c:10: error: undeclared variable',
					'make[1]: Leaving directory `/app`'
				].join('\n') + pad('x', 600);
			const result = compressTerminalOutput('make all', output);
			expect(result).toContain('gcc -o foo foo.c');
			expect(result).toContain('foo.c:10: error: undeclared variable');
		});
	});

	// ── cargo ──────────────────────────────────────────────────────────────────

	describe('cargo', () => {
		it('collapses consecutive Compiling lines to a count summary', () => {
			const output =
				[
					'   Compiling serde v1.0.0',
					'   Compiling serde_derive v1.0.0',
					'   Compiling tokio v1.28.0',
					'warning: unused variable `x`',
					'   Finished dev [unoptimized] target(s) in 12.34s'
				].join('\n') + pad('x', 600);
			const result = compressTerminalOutput('cargo build', output);
			expect(result).not.toContain('Compiling serde v1.0.0');
			expect(result).toContain('[3 packages compiled]');
		});

		it('preserves warnings and errors', () => {
			const output =
				[
					'   Compiling foo v0.1.0',
					'warning: unused variable `x`',
					'error[E0308]: mismatched types',
					'   Finished dev target(s) in 1.23s'
				].join('\n') + pad('x', 600);
			const result = compressTerminalOutput('cargo build', output);
			expect(result).toContain('warning: unused variable');
			expect(result).toContain('error[E0308]: mismatched types');
		});
	});

	// ── python / pytest ────────────────────────────────────────────────────────

	describe('python / pytest', () => {
		it('collapses passing tests to a count summary', () => {
			const output =
				[
					'test_foo.py::test_a PASSED',
					'test_foo.py::test_b PASSED',
					'test_foo.py::test_c PASSED',
					'=== 3 passed in 0.12s ==='
				].join('\n') + pad('x', 600);
			const result = compressTerminalOutput('pytest', output);
			expect(result).not.toContain('test_a PASSED');
			expect(result).toContain('[3 tests passed]');
		});

		it('preserves FAILED lines and tracebacks', () => {
			const output =
				[
					'test_foo.py::test_ok PASSED',
					'FAILED test_foo.py::test_bad - AssertionError: 1 != 2',
					'E  AssertionError: assert 1 == 2',
					'=== 1 failed, 1 passed in 0.34s ==='
				].join('\n') + pad('x', 600);
			const result = compressTerminalOutput('pytest tests/', output);
			expect(result).toContain('FAILED test_foo.py::test_bad');
			expect(result).toContain('E  AssertionError');
		});

		it('also applies to python commands', () => {
			const output = ['test_a PASSED', '=== 1 passed ==='].join('\n') + pad('x', 600);
			const result = compressTerminalOutput('python -m pytest', output);
			expect(result).toContain('[1 test passed]');
		});
	});

	// ── tsc ────────────────────────────────────────────────────────────────────

	describe('tsc', () => {
		function tscLine(file: string, line: number, code: string): string {
			return `${file}(${line},5): error ${code}: Some error message`;
		}

		it('groups errors by diagnostic code', () => {
			const tscOutput = [
				tscLine('src/foo.ts', 10, 'TS2345'),
				tscLine('src/bar.ts', 20, 'TS2345'),
				tscLine('src/baz.ts', 30, 'TS2304')
			].join('\n');
			const padded = tscOutput + '\n' + pad('// comment\n', 500);
			const result = compressTerminalOutput('tsc --noEmit', padded);
			expect(result).toContain('TS2345');
			expect(result).toContain('TS2304');
		});

		it('shows at most 3 examples per error code + ellipsis for the rest', () => {
			const lines = Array.from({ length: 6 }, (_, i) => tscLine(`src/file${i}.ts`, i * 10, 'TS2345'));
			const tscOutput = lines.join('\n') + '\n' + pad('// comment\n', 500);
			const result = compressTerminalOutput('tsc', tscOutput);
			// Should have exactly 4 TS2345 entries: 3 real + 1 ellipsis
			const ts2345Lines = result.split('\n').filter((l) => l.includes('TS2345'));
			expect(ts2345Lines.length).toBe(4);
			expect(ts2345Lines[3]).toContain('... (more TS2345 errors)');
		});
	});

	// ── eslint ─────────────────────────────────────────────────────────────────

	describe('eslint', () => {
		it('groups violations by rule', () => {
			const eslintOutput = [
				'/path/to/src/foo.ts',
				'  10:5  error  no-unused-vars  Variable declared but never used',
				'  15:3  error  no-unused-vars  Variable declared but never used',
				'  20:8  warning  no-console  Unexpected console statement',
				'/path/to/src/bar.ts',
				'  30:2  error  no-unused-vars  Variable declared but never used'
			].join('\n');
			const padded = eslintOutput + '\n' + pad('// code\n', 500);
			const result = compressTerminalOutput('eslint src/', padded);
			expect(result).toContain('no-unused-vars');
			expect(result).toContain('no-console');
		});

		it('shows at most 2 examples per rule + ellipsis for the rest', () => {
			const lines = Array.from(
				{ length: 5 },
				(_, i) => `  ${(i + 1) * 10}:5  error  @typescript-eslint/no-explicit-any  Found any`
			);
			const eslintOutput = '/path/src.ts\n' + lines.join('\n') + '\n' + pad('// code\n', 500);
			const result = compressTerminalOutput('eslint --ext .ts src/', eslintOutput);
			const ruleLines = result.split('\n').filter((l) => l.includes('@typescript-eslint/no-explicit-any'));
			expect(ruleLines.length).toBe(3); // 2 real + 1 ellipsis
			expect(ruleLines[2]).toContain('... (more @typescript-eslint/no-explicit-any violations)');
		});
	});
});

// ── Compression stats accumulator ─────────────────────────────────────────────

describe('compression stats', () => {
	beforeEach(() => {
		resetCompressionStats();
	});
	afterEach(() => {
		resetCompressionStats();
	});

	it('starts at zero after reset', () => {
		const stats = getCompressionStats();
		expect(stats.calls).toBe(0);
		expect(stats.inputChars).toBe(0);
		expect(stats.outputChars).toBe(0);
	});

	it('increments on a compressible input', () => {
		const output = ['⠋ spinning...', 'Done in 1s'].join('\n') + pad('x', 600);
		compressTerminalOutput('pnpm install', output);
		const stats = getCompressionStats();
		expect(stats.calls).toBe(1);
		expect(stats.inputChars).toBeGreaterThan(0);
		expect(stats.outputChars).toBeGreaterThan(0);
		expect(stats.inputChars).toBeGreaterThanOrEqual(stats.outputChars);
	});

	it('does NOT increment for short-circuit path (output below threshold)', () => {
		compressTerminalOutput('pnpm install', 'short output');
		const stats = getCompressionStats();
		expect(stats.calls).toBe(0);
	});

	it('accumulates across multiple calls', () => {
		const output = ['⠋ loading', 'Done in 1s'].join('\n') + pad('x', 600);
		compressTerminalOutput('pnpm install', output);
		compressTerminalOutput('pnpm add foo', output);
		expect(getCompressionStats().calls).toBe(2);
	});

	it('returns a snapshot — mutating the returned object does not affect stats', () => {
		const output = ['⠋ loading', 'Done in 1s'].join('\n') + pad('x', 600);
		compressTerminalOutput('pnpm install', output);
		const snapshot = getCompressionStats() as { calls: number };
		snapshot.calls = 999;
		expect(getCompressionStats().calls).toBe(1);
	});

	it('resetCompressionStats zeroes all fields', () => {
		const output = ['⠋ loading', 'Done in 1s'].join('\n') + pad('x', 600);
		compressTerminalOutput('pnpm install', output);
		resetCompressionStats();
		const stats = getCompressionStats();
		expect(stats.calls).toBe(0);
		expect(stats.inputChars).toBe(0);
		expect(stats.outputChars).toBe(0);
	});
});
