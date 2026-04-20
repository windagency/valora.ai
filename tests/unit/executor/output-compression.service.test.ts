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
