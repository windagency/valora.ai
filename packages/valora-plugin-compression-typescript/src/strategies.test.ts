import { describe, expect, it } from 'vitest';

import {
	filterBiome,
	filterEslint,
	filterPackageManager,
	filterPrettier,
	filterTestRunner,
	filterTsc
} from './strategies';

function pad(str: string, targetLength: number): string {
	return str.repeat(Math.ceil(targetLength / str.length)).slice(0, targetLength);
}

describe('filterTsc', () => {
	it('groups errors by code and caps at 3 examples per code', () => {
		const lines = Array.from({ length: 5 }, (_, i) => `src/file${i}.ts(1,1): error TS2345: message`);
		const input = lines.join('\n');
		const result = filterTsc(input, 'tsc');
		const ts2345Lines = result.split('\n').filter((l) => l.includes('TS2345'));
		expect(ts2345Lines.length).toBeLessThanOrEqual(4); // 3 examples + 1 ellipsis line
	});

	it('preserves non-diagnostic lines', () => {
		const input = 'Found 3 errors in 2 files.\nsrc/a.ts(1,1): error TS2345: msg';
		const result = filterTsc(input, 'tsc');
		expect(result).toContain('Found 3 errors');
	});

	it('keeps only the final watch cycle when output contains timestamp markers', () => {
		const cycle = ['src/foo.ts:1:1 - error TS2345: some error', '', 'Found 1 error. Watching for file changes.'].join(
			'\n'
		);
		const input = [
			'[10:00:00 AM] Starting compilation in watch mode...',
			'',
			cycle,
			'',
			'[10:00:05 AM] File change detected. Starting incremental compilation...',
			'',
			cycle,
			'',
			'[10:00:10 AM] File change detected. Starting incremental compilation...',
			'',
			cycle
		].join('\n');
		const result = filterTsc(input, 'tsc --watch --noEmit');
		expect(result).toContain('Found 1 error. Watching for file changes.');
		expect(result).toContain('[10:00:10 AM]');
		expect(result).not.toContain('[10:00:00 AM]');
		expect(result).not.toContain('[10:00:05 AM]');
	});

	it('leaves non-watch tsc output unchanged by the watch filter', () => {
		const input = 'src/foo.ts(1,1): error TS2345: msg\nFound 1 error.';
		const result = filterTsc(input, 'tsc --noEmit');
		expect(result).toContain('TS2345');
		expect(result).toContain('Found 1 error');
	});

	it('folds traceResolution blocks to their closing summary line', () => {
		const input = [
			"======== Resolving module 'foo' from '/src/bar.ts'. ========",
			"Explicitly specified module resolution kind: 'Bundler'.",
			"File '/src/node_modules/foo.ts' does not exist.",
			"File '/src/node_modules/foo.d.ts' does not exist.",
			"======== Module name 'foo' was not resolved. ========",
			"======== Resolving module 'zod' from '/src/bar.ts'. ========",
			"Loading module 'zod' from 'node_modules' folder.",
			"File '/node_modules/zod/index.d.ts' exists - use it as a name resolution result.",
			"======== Module name 'zod' was successfully resolved to '/node_modules/zod/index.d.ts'. ========",
			"src/bar.ts:1:1 - error TS2307: Cannot find module 'foo'.",
			'Found 1 error.'
		].join('\n');
		const result = filterTsc(input, 'tsc --noEmit --traceResolution');
		expect(result).toContain("Module name 'foo' was not resolved.");
		expect(result).toContain("Module name 'zod' was successfully resolved");
		expect(result).not.toContain('Explicitly specified module resolution kind');
		expect(result).not.toContain('does not exist.');
		expect(result).toContain('error TS2307');
		expect(result).toContain('Found 1 error.');
	});

	it('strips code-frame blocks from --pretty output (blank + code-context + pointer lines)', () => {
		const input = [
			'src/foo.ts:10:5 - error TS2339: Property bar does not exist.',
			'',
			'10   foo.bar()',
			'         ~~~',
			'',
			'src/foo.ts:20:3 - error TS2339: Property baz does not exist.',
			'',
			'20   foo.baz()',
			'         ~~~',
			'',
			'Found 2 errors.'
		].join('\n');
		const result = filterTsc(input, 'tsc');
		expect(result).toContain('src/foo.ts:10:5 - error TS2339');
		expect(result).toContain('src/foo.ts:20:3 - error TS2339');
		expect(result).toContain('Found 2 errors.');
		expect(result).not.toMatch(/^\s*\d+\s+foo\./m);
		expect(result).not.toMatch(/^\s*~~~+/m);
	});
});

describe('filterEslint', () => {
	it('groups violations by rule and caps at 2 examples per rule', () => {
		const lines = Array.from({ length: 4 }, (_, i) => `  ${i + 1}:5  error  no-unused-vars  'x' is defined`);
		const result = filterEslint(lines.join('\n'), 'eslint');
		const ruleLines = result.split('\n').filter((l) => l.includes('no-unused-vars'));
		expect(ruleLines.length).toBeLessThanOrEqual(3); // 2 examples + 1 ellipsis
	});
});

describe('filterTestRunner', () => {
	it('collapses passing suites to a count summary', () => {
		const input = ['✓ suite one', '✓ suite two', '✗ FAIL suite/three.test.ts'].join('\n');
		const result = filterTestRunner(input, 'vitest');
		expect(result).toContain('[2 test suites passed]');
		expect(result).toContain('FAIL suite/three.test.ts');
	});

	it('collapses coverage table to a single summary line', () => {
		const input = [
			'Test Files  3 passed (3)',
			' % Coverage report from v8',
			' File                   | % Stmts | % Branch | % Funcs |',
			'-----------------------|---------|----------|---------|',
			'All files              |   84.31 |    79.18 |   87.50 |',
			' src/foo.ts            |  100.00 |   100.00 |  100.00 |',
			' src/bar.ts            |   72.45 |    68.32 |   75.00 |',
			' src/baz.ts            |   91.23 |    88.46 |   93.75 |',
			'-----------------------|---------|----------|---------|'
		].join('\n');
		const result = filterTestRunner(input, 'vitest');
		expect(result).toContain('Test Files  3 passed');
		expect(result).toContain('[coverage: 3 files, overall 84.31%]');
		expect(result).not.toContain('src/foo.ts');
		expect(result).not.toContain('% Branch');
	});

	it('preserves FAIL suite lines', () => {
		const input = pad('✓ passing\n', 200) + '✗ FAIL broken.test.ts\n  Error: expected 1 to be 2';
		const result = filterTestRunner(input, 'jest');
		expect(result).toContain('FAIL broken.test.ts');
		expect(result).toContain('Error: expected 1 to be 2');
	});
});

describe('filterPackageManager', () => {
	it('removes pnpm braille spinner lines', () => {
		const input = '⠋ Resolving dependencies\nDone in 1.2s';
		const result = filterPackageManager(input, 'pnpm install');
		expect(result).not.toContain('⠋');
		expect(result).toContain('Done in 1.2s');
	});

	it('removes npm warn lines', () => {
		const input = 'npm warn deprecated foo@1.0.0\nadded 42 packages';
		const result = filterPackageManager(input, 'npm install');
		expect(result).not.toContain('npm warn');
		expect(result).toContain('added 42 packages');
	});

	it('folds + pkg@version lines into a single count summary', () => {
		const input = ['added 3 packages in 2s', '+ react@18.2.0', '+ react-dom@18.2.0', '+ typescript@5.3.3'].join('\n');
		const result = filterPackageManager(input, 'npm install');
		expect(result).toContain('[3 packages added]');
		expect(result).toContain('added 3 packages in 2s');
		expect(result).not.toContain('+ react@');
	});

	it('removes npm notice update announcements', () => {
		const input = 'npm notice New minor version available!\nnpm notice run: npm install -g npm\nadded 1 package';
		const result = filterPackageManager(input, 'npm install');
		expect(result).not.toContain('npm notice');
		expect(result).toContain('added 1 package');
	});

	it('removes funding announcement lines', () => {
		const input = 'added 10 packages\n3 packages are looking for funding\n  run `npm fund` for details';
		const result = filterPackageManager(input, 'npm install');
		expect(result).not.toContain('looking for funding');
		expect(result).not.toContain('npm fund');
		expect(result).toContain('added 10 packages');
	});
});

describe('filterBiome', () => {
	const makeHeader = (file: string, rule: string) => `${file} ${rule} ━━━━━━━━━━━━━━━━━━━━━━━━`;
	const makeBlock = (file: string, rule: string) =>
		[makeHeader(file, rule), '', '  ✖ Message.', '', '  > 1 │ code', '     │ ^^^', ''].join('\n');

	it('groups violations by rule and caps at 2 examples per rule', () => {
		const input = [
			makeBlock('src/a.ts:1:1', 'lint/suspicious/noDoubleEquals'),
			makeBlock('src/b.ts:2:2', 'lint/suspicious/noDoubleEquals'),
			makeBlock('src/c.ts:3:3', 'lint/suspicious/noDoubleEquals'),
			makeBlock('src/d.ts:4:4', 'lint/suspicious/noExplicitAny'),
			'Found 4 diagnostics.'
		].join('\n');
		const result = filterBiome(input, 'biome check');
		const noDoubleLines = result.split('\n').filter((l) => l.includes('noDoubleEquals'));
		expect(noDoubleLines).toHaveLength(3); // 2 examples + ellipsis
		expect(result).toContain('... (more noDoubleEquals violations)');
		expect(result).toContain('src/d.ts:4:4 lint/suspicious/noExplicitAny');
	});

	it('strips code frame lines from diagnostic bodies', () => {
		const input = makeBlock('src/a.ts:1:1', 'lint/suspicious/noDoubleEquals') + 'Found 1 diagnostic.';
		const result = filterBiome(input, 'biome check');
		expect(result).not.toContain('│');
		expect(result).not.toContain('✖');
	});

	it('keeps summary lines outside diagnostic blocks', () => {
		const input = makeBlock('src/a.ts:5:3', 'lint/suspicious/noDoubleEquals') + 'Found 1 diagnostic.';
		const result = filterBiome(input, 'biome check');
		expect(result).toContain('Found 1 diagnostic.');
	});

	it('passes through output with no diagnostics unchanged', () => {
		const input = 'Checked 12 files in 45ms. No diagnostics found.';
		const result = filterBiome(input, 'biome check');
		expect(result).toBe(input);
	});
});

describe('filterPrettier', () => {
	it('removes the "Checking formatting..." header line', () => {
		const input = ['Checking formatting...', '[warn] src/foo.ts', '[warn] Found 1 file.'].join('\n');
		const result = filterPrettier(input, 'prettier --check .');
		expect(result).not.toContain('Checking formatting');
		expect(result).toContain('[warn] src/foo.ts');
	});

	it('preserves [warn] lines listing files that need formatting', () => {
		const input = ['Checking formatting...', '[warn] src/a.ts', '[warn] src/b.ts'].join('\n');
		const result = filterPrettier(input, 'prettier --check src/');
		expect(result).toContain('[warn] src/a.ts');
		expect(result).toContain('[warn] src/b.ts');
	});

	it('preserves the success message when all files are formatted', () => {
		const input = ['Checking formatting...', 'All matched files use Prettier code style!'].join('\n');
		const result = filterPrettier(input, 'prettier --check .');
		expect(result).toContain('All matched files use Prettier code style!');
	});

	it('preserves error lines', () => {
		const input = ['Checking formatting...', '[error] src/bad.ts: SyntaxError at line 5'].join('\n');
		const result = filterPrettier(input, 'prettier --check .');
		expect(result).toContain('[error] src/bad.ts');
	});
});
