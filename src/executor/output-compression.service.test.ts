import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_TERMINAL_OUTPUT_CHARS } from 'config/constants';

import { getLogger } from 'output/logger';

import {
	compressTerminalOutput,
	type CompressionStrategy,
	getCompressionStats,
	getStrategy,
	registerStrategy,
	resetCompressionStats,
	resetRegistry,
	stripAnsiCodes,
	truncateTerminalOutput
} from './output-compression.service';

vi.mock('output/logger', () => ({
	getLogger: vi.fn(() => ({ warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() }))
}));

const LONG = 'x'.repeat(600);

afterEach(() => {
	resetRegistry();
	resetCompressionStats();
});

describe('compressTerminalOutput — stats baseline equals raw input length (B2)', () => {
	it('counts raw input bytes (including ANSI codes) in inputChars, not post-strip bytes', () => {
		const ESC = '\x1b[31m';
		const RESET = '\x1b[0m';
		const rawOutput = ESC + 'x'.repeat(600) + RESET;
		compressTerminalOutput('git status', rawOutput);
		const { inputChars } = getCompressionStats();
		expect(inputChars).toBe(rawOutput.length);
	});
});

describe('compressTerminalOutput — wrapper-aware dispatch (B1)', () => {
	it('dispatches to the wrapped tool when first token is a package-manager wrapper', () => {
		registerStrategy('tsc', () => 'TSC_RESULT');
		registerStrategy('pnpm', () => 'PNPM_RESULT');
		expect(compressTerminalOutput('pnpm tsc --noEmit', LONG)).toBe('TSC_RESULT');
	});

	it('dispatches to pnpm when the second token is a package-manager subcommand', () => {
		registerStrategy('tsc', () => 'TSC_RESULT');
		registerStrategy('pnpm', () => 'PNPM_RESULT');
		expect(compressTerminalOutput('pnpm install', LONG)).toBe('PNPM_RESULT');
	});

	it('dispatches to the first token when second token is not in the registry', () => {
		registerStrategy('pnpm', () => 'PNPM_RESULT');
		expect(compressTerminalOutput('pnpm unknown-tool --flag', LONG)).toBe('PNPM_RESULT');
	});

	it('dispatches to vitest when invoked via npx', () => {
		registerStrategy('vitest', () => 'VITEST_RESULT');
		registerStrategy('npx', () => 'NPX_RESULT');
		expect(compressTerminalOutput('npx vitest run', LONG)).toBe('VITEST_RESULT');
	});

	it('dispatches to eslint when invoked via yarn', () => {
		registerStrategy('eslint', () => 'ESLINT_RESULT');
		registerStrategy('yarn', () => 'YARN_RESULT');
		expect(compressTerminalOutput('yarn eslint .', LONG)).toBe('ESLINT_RESULT');
	});

	it('dispatches to tsc when invoked via bun', () => {
		registerStrategy('tsc', () => 'TSC_RESULT');
		registerStrategy('bun', () => 'BUN_RESULT');
		expect(compressTerminalOutput('bun tsc', LONG)).toBe('TSC_RESULT');
	});

	it('does not treat run as a wrapped tool — pnpm run test dispatches to pnpm', () => {
		registerStrategy('pnpm', () => 'PNPM_RESULT');
		expect(compressTerminalOutput('pnpm run test', LONG)).toBe('PNPM_RESULT');
	});

	it('does not treat exec as a wrapped tool — npm exec tsc dispatches to npm', () => {
		registerStrategy('npm', () => 'NPM_RESULT');
		registerStrategy('tsc', () => 'TSC_RESULT');
		expect(compressTerminalOutput('npm exec tsc', LONG)).toBe('NPM_RESULT');
	});

	it('non-wrapper commands dispatch directly to their own strategy', () => {
		registerStrategy('git', () => 'GIT_RESULT');
		expect(compressTerminalOutput('git log --oneline', LONG)).toBe('GIT_RESULT');
	});
});

describe('truncateTerminalOutput — error-aware truncation (B11)', () => {
	it('returns output unchanged when below the cap', () => {
		const short = 'x'.repeat(100);
		expect(truncateTerminalOutput(short)).toBe(short);
	});

	it('uses standard head+tail format when no priority lines exist in the omitted middle', () => {
		const output = 'x'.repeat(MAX_TERMINAL_OUTPUT_CHARS + 5000);
		const result = truncateTerminalOutput(output);
		expect(result).toContain('characters omitted');
		expect(result).not.toContain('priority');
	});

	it('surfaces error lines from the omitted middle section', () => {
		const HEAD = Math.floor(MAX_TERMINAL_OUTPUT_CHARS * 0.8);
		const TAIL = MAX_TERMINAL_OUTPUT_CHARS - HEAD;
		const head = 'a'.repeat(HEAD);
		const middle = 'b'.repeat(2000) + '\nError: something went wrong\n' + 'b'.repeat(2000);
		const tail = 'z'.repeat(TAIL);
		const output = head + middle + tail;
		const result = truncateTerminalOutput(output);
		expect(result).toContain('Error: something went wrong');
		expect(result).toContain('characters omitted');
	});

	it('surfaces FAIL/TS-error/npm-ERR priority patterns', () => {
		const HEAD = Math.floor(MAX_TERMINAL_OUTPUT_CHARS * 0.8);
		const TAIL = MAX_TERMINAL_OUTPUT_CHARS - HEAD;
		const output =
			'a'.repeat(HEAD) +
			'\nFAIL src/foo.test.ts\n' +
			'src/bar.ts(1,1): error TS2345: msg\n' +
			'npm ERR! code ENOENT\n' +
			'b'.repeat(1000) +
			'z'.repeat(TAIL);
		const result = truncateTerminalOutput(output);
		expect(result).toContain('FAIL src/foo.test.ts');
		expect(result).toContain('error TS2345');
		expect(result).toContain('npm ERR! code ENOENT');
	});

	it('caps extracted priority content at 2000 chars', () => {
		const HEAD = Math.floor(MAX_TERMINAL_OUTPUT_CHARS * 0.8);
		const TAIL = MAX_TERMINAL_OUTPUT_CHARS - HEAD;
		const errorLines = Array.from({ length: 200 }, (_, i) => `Error: issue ${i}`).join('\n');
		const output = 'a'.repeat(HEAD) + '\n' + errorLines + '\n' + 'z'.repeat(TAIL);
		const result = truncateTerminalOutput(output);
		const matchCount = (result.match(/Error: issue \d+/g) ?? []).length;
		expect(matchCount).toBeGreaterThan(0);
		expect(matchCount).toBeLessThan(200);
	});
});

describe('compressTerminalOutput — silent failure guard (B12)', () => {
	it('falls back to the clean output and warns when a strategy throws', () => {
		const mockWarn = vi.fn();
		vi.mocked(getLogger).mockReturnValue({ warn: mockWarn, info: vi.fn(), debug: vi.fn(), error: vi.fn() } as never);
		registerStrategy('tsc', () => {
			throw new Error('boom');
		});
		const result = compressTerminalOutput('tsc --noEmit', LONG);
		expect(result).toBe(LONG);
		expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('tsc'));
	});
});

function pad(str: string, targetLength: number): string {
	return str.repeat(Math.ceil(targetLength / str.length)).slice(0, targetLength);
}

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

describe('truncateTerminalOutput — head+tail format', () => {
	it('applies head+tail truncation and inserts an omission marker', () => {
		const long = pad('x', 20_000);
		const result = truncateTerminalOutput(long);
		expect(result).toContain('[... ');
		expect(result).toContain(' characters omitted ...]\n\n');
		expect(result.length).toBeLessThanOrEqual(15_000 + 60);
	});
});

describe('compressTerminalOutput — threshold behaviour', () => {
	it('returns short output unchanged (below threshold)', () => {
		const short = 'hello world';
		expect(compressTerminalOutput('git status', short)).toBe(short);
	});

	it('still strips ANSI codes even below the threshold', () => {
		const coloured = '\x1b[32mok\x1b[0m';
		expect(compressTerminalOutput('echo', coloured)).toBe('ok');
	});

	it('passes output through unchanged (modulo ANSI strip) for unknown tools', () => {
		const output = pad('line\n', 1_000);
		expect(compressTerminalOutput('unknowntool --flag', output)).toBe(output);
	});
});

describe('compression stats', () => {
	beforeEach(() => {
		resetCompressionStats();
	});

	it('starts at zero after reset', () => {
		const stats = getCompressionStats();
		expect(stats.calls).toBe(0);
		expect(stats.inputChars).toBe(0);
		expect(stats.outputChars).toBe(0);
	});

	it('increments on a compressible input', () => {
		const output = pad('x', 600);
		compressTerminalOutput('sometool --run', output);
		const stats = getCompressionStats();
		expect(stats.calls).toBe(1);
		expect(stats.inputChars).toBeGreaterThan(0);
		expect(stats.outputChars).toBeGreaterThan(0);
		expect(stats.inputChars).toBeGreaterThanOrEqual(stats.outputChars);
	});

	it('does NOT increment for short-circuit path (output below threshold)', () => {
		compressTerminalOutput('sometool --run', 'short output');
		const stats = getCompressionStats();
		expect(stats.calls).toBe(0);
	});

	it('accumulates across multiple calls', () => {
		const output = pad('x', 600);
		compressTerminalOutput('sometool --run', output);
		compressTerminalOutput('sometool --check', output);
		expect(getCompressionStats().calls).toBe(2);
	});

	it('returns a snapshot — mutating the returned object does not affect stats', () => {
		const output = pad('x', 600);
		compressTerminalOutput('sometool --run', output);
		const snapshot = getCompressionStats() as { calls: number };
		snapshot.calls = 999;
		expect(getCompressionStats().calls).toBe(1);
	});

	it('resetCompressionStats zeroes all fields', () => {
		const output = pad('x', 600);
		compressTerminalOutput('sometool --run', output);
		resetCompressionStats();
		const stats = getCompressionStats();
		expect(stats.calls).toBe(0);
		expect(stats.inputChars).toBe(0);
		expect(stats.outputChars).toBe(0);
	});
});

describe('compression registry', () => {
	it('getStrategy returns undefined for an unregistered tool', () => {
		expect(getStrategy('bazel')).toBeUndefined();
	});

	it('registerStrategy + getStrategy round-trip', () => {
		const fn: CompressionStrategy = (output) => output.toUpperCase();
		registerStrategy('mytool', fn);
		expect(getStrategy('mytool')).toBe(fn);
	});

	it('first-wins: second registerStrategy call for the same key is a no-op', () => {
		const first: CompressionStrategy = () => 'first';
		const second: CompressionStrategy = () => 'second';
		registerStrategy('mytool', first);
		registerStrategy('mytool', second);
		expect(getStrategy('mytool')).toBe(first);
	});

	it('resetRegistry clears all registered strategies', () => {
		registerStrategy('mytool', (o) => o);
		resetRegistry();
		expect(getStrategy('mytool')).toBeUndefined();
	});

	it('compressTerminalOutput uses registered strategy when available', () => {
		registerStrategy('mytool', () => 'compressed-result');
		const longInput = pad('x', 5_000);
		expect(compressTerminalOutput('mytool --flag', longInput)).toBe('compressed-result');
	});

	it('compressTerminalOutput falls back to clean output when strategy throws', () => {
		registerStrategy('mytool', () => {
			throw new Error('strategy failed');
		});
		const longInput = pad('x', 5_000);
		expect(compressTerminalOutput('mytool --flag', longInput)).toBe(longInput);
	});
});
