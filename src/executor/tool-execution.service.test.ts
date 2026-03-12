import { describe, expect, it } from 'vitest';
import { isExploratoryExitCode } from './tool-execution.service';

describe('isExploratoryExitCode', () => {
	it('matches "which" command', () => {
		expect(isExploratoryExitCode('which tsc')).toBe(true);
		expect(isExploratoryExitCode('which astro && which tsc')).toBe(true);
	});

	it('matches "command -v"', () => {
		expect(isExploratoryExitCode('command -v node')).toBe(true);
	});

	it('matches "type" command', () => {
		expect(isExploratoryExitCode('type bash')).toBe(true);
	});

	it('matches "test" command', () => {
		expect(isExploratoryExitCode('test -d /some/path')).toBe(true);
		expect(isExploratoryExitCode('test -f package.json')).toBe(true);
	});

	it('matches "fd" command', () => {
		expect(isExploratoryExitCode('fd README.md')).toBe(true);
	});

	it('matches shell bracket syntax', () => {
		expect(isExploratoryExitCode('[ -d /some/path ]')).toBe(true);
		expect(isExploratoryExitCode('[[ -f package.json ]]')).toBe(true);
	});

	it('matches "cd" prefixed commands (directory probing)', () => {
		expect(isExploratoryExitCode('cd workspace && pwd')).toBe(true);
		expect(isExploratoryExitCode('cd /nonexistent && ls')).toBe(true);
	});

	it('handles leading whitespace', () => {
		expect(isExploratoryExitCode('  which node')).toBe(true);
		expect(isExploratoryExitCode('\ttest -d /foo')).toBe(true);
	});

	it('does not match non-exploratory commands', () => {
		expect(isExploratoryExitCode('npm install')).toBe(false);
		expect(isExploratoryExitCode('tsc --noEmit')).toBe(false);
		expect(isExploratoryExitCode('node script.js')).toBe(false);
		expect(isExploratoryExitCode('rm -rf dist')).toBe(false);
	});

	it('does not match rg/grep (handled separately by isNoMatchesExitCode)', () => {
		expect(isExploratoryExitCode('rg pattern')).toBe(false);
		expect(isExploratoryExitCode('grep -r foo .')).toBe(false);
	});

	it('does not match partial command names', () => {
		expect(isExploratoryExitCode('whichever thing')).toBe(false);
		expect(isExploratoryExitCode('testing something')).toBe(false);
		expect(isExploratoryExitCode('cdup something')).toBe(false);
	});
});
