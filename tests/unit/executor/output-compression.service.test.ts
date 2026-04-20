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
	type CompressionStrategy,
	getCompressionStats,
	getStrategy,
	registerStrategy,
	resetCompressionStats,
	resetRegistry,
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
	beforeEach(() => {
		resetRegistry();
	});

	afterEach(() => {
		resetRegistry();
	});

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
