import { describe, expect, it } from 'vitest';

import { filterEslint, filterPackageManager, filterTestRunner, filterTsc } from './strategies';

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
});
