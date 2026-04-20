/**
 * Output Compression Service
 *
 * RTK-style content-aware compression for terminal command output.
 * Applies per-command intelligent filters to reduce token consumption
 * while preserving the most useful information for the LLM.
 *
 * Design:
 * - ANSI codes are always stripped (zero semantic value, 5-15% overhead)
 * - Short outputs (< OUTPUT_COMPRESSION_THRESHOLD) pass through unchanged
 * - Per-command filters reduce structure-specific noise (git metadata, pass
 *   suites, progress spinners, duplicate type errors, etc.)
 * - truncateTerminalOutput() acts as a safety net after compression; it is
 *   never skipped so the MAX_TERMINAL_OUTPUT_CHARS cap always holds
 */

import { MAX_TERMINAL_OUTPUT_CHARS, OUTPUT_COMPRESSION_THRESHOLD } from 'config/constants';
import { getLogger } from 'output/logger';

/** Maximum examples per diagnostic code when compressing `tsc` output. */
const TSC_MAX_EXAMPLES_PER_CODE = 3;

/** Maximum examples per lint rule when compressing `eslint` output. */
const ESLINT_MAX_EXAMPLES_PER_RULE = 2;

/** ANSI CSI escape sequence — matches colour codes, cursor movement, etc. */
const ANSI_ESCAPE_RE = new RegExp(String.fromCharCode(0x1b) + '\\[[0-9;]*[a-zA-Z]', 'g');

// ── Compression strategy registry ─────────────────────────────────────────────

export type CompressionStrategy = (output: string, command: string) => string;

const registry = new Map<string, CompressionStrategy>();

export function getStrategy(tool: string): CompressionStrategy | undefined {
	return registry.get(tool);
}

export function registerStrategy(tool: string, fn: CompressionStrategy): void {
	if (registry.has(tool)) {
		getLogger().warn(`Compression strategy for tool "${tool}" already registered; ignoring duplicate`);
		return;
	}
	registry.set(tool, fn);
}

export function resetRegistry(): void {
	registry.clear();
}

// ── Compression stats accumulator ─────────────────────────────────────────────

interface CompressionStats {
	calls: number;
	inputChars: number;
	outputChars: number;
}

let stats: CompressionStats = { calls: 0, inputChars: 0, outputChars: 0 };

function recordCompression(inputLen: number, outputLen: number): void {
	stats.calls++;
	stats.inputChars += inputLen;
	stats.outputChars += outputLen;
}

/**
 * Returns a snapshot of terminal output compression statistics for the current
 * process lifetime. Counts only calls that triggered actual compression
 * (outputs above OUTPUT_COMPRESSION_THRESHOLD).
 */
export function getCompressionStats(): Readonly<CompressionStats> {
	return { ...stats };
}

/**
 * Reset compression statistics. Called by session cleanup and tests.
 */
export function resetCompressionStats(): void {
	stats = { calls: 0, inputChars: 0, outputChars: 0 };
}

/**
 * Strip ANSI escape sequences from text.
 * Safe to call on any string — no-op when no escape codes are present.
 */
export function stripAnsiCodes(text: string): string {
	return text.replace(ANSI_ESCAPE_RE, '');
}

/**
 * Truncate output to MAX_TERMINAL_OUTPUT_CHARS using head+tail strategy,
 * preserving the beginning (command context) and the end (summary/errors).
 *
 * Exported so callers that need the raw safety net can use it directly.
 */
export function truncateTerminalOutput(output: string): string {
	if (output.length <= MAX_TERMINAL_OUTPUT_CHARS) return output;
	const HEAD = Math.floor(MAX_TERMINAL_OUTPUT_CHARS * 0.8);
	const TAIL = MAX_TERMINAL_OUTPUT_CHARS - HEAD;
	const omitted = output.length - HEAD - TAIL;
	return (
		output.substring(0, HEAD) +
		`\n\n[... ${omitted} characters omitted ...]\n\n` +
		output.substring(output.length - TAIL)
	);
}

/**
 * Compress terminal command output using content-aware per-command filters.
 *
 * Steps:
 * 1. Strip ANSI codes unconditionally.
 * 2. Return unchanged if output is below OUTPUT_COMPRESSION_THRESHOLD.
 * 3. Apply a per-command filter keyed on the first token of `command`.
 *    Unknown commands pass through without transformation.
 * 4. Apply head+tail truncation as a final safety net.
 */
export function compressTerminalOutput(command: string, output: string): string {
	const clean = stripAnsiCodes(output);

	if (clean.length <= OUTPUT_COMPRESSION_THRESHOLD) {
		return clean;
	}

	const tool = firstToken(command);
	const strategy = registry.get(tool);
	let compressed: string;
	if (strategy) {
		try {
			compressed = strategy(clean, command);
		} catch {
			compressed = clean;
		}
	} else {
		compressed = applyFilter(tool, clean, command);
	}

	const result = truncateTerminalOutput(compressed);
	recordCompression(clean.length, result.length);
	return result;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

const TOOL_FILTERS: Record<string, (output: string, command: string) => string> = {
	cargo: filterCargo,
	eslint: filterEslint,
	jest: filterTestRunner,
	npm: filterPackageManager,
	npx: filterPackageManager,
	pnpm: filterPackageManager,
	pytest: filterPython,
	python: filterPython,
	tsc: filterTsc,
	vitest: filterTestRunner,
	yarn: filterPackageManager
};

function applyFilter(tool: string, output: string, command: string): string {
	return (TOOL_FILTERS[tool] ?? ((o: string) => o))(output, command);
}

function firstToken(command: string): string {
	return command.trimStart().split(/\s+/)[0] ?? '';
}

// ── Test runner filter ────────────────────────────────────────────────────────

function flushPassCount(kept: string[], passCount: number): void {
	if (passCount > 0) kept.push(formatPassSummary(passCount));
}

function formatPassSummary(passCount: number): string {
	return `[${passCount} test suite${passCount === 1 ? '' : 's'} passed]`;
}

/**
 * Compress vitest/jest output by collapsing passing suites to a count summary
 * and preserving all failing suites with their error traces.
 */
function filterTestRunner(output: string): string {
	const lines = output.split('\n');
	const kept: string[] = [];
	let passCount = 0;

	for (const line of lines) {
		const isPassLine = /^\s*(✓|PASS\b|passed\b)/.test(line);
		const isFailLine = /^\s*(✗|✕|FAIL\b|×)/.test(line);
		const isSummaryLine = /^(Tests?|Test Files?|Suites?|Duration|Time|Ran all)/.test(line);

		if (isFailLine) {
			flushPassCount(kept, passCount);
			passCount = 0;
			kept.push(line);
		} else if (isPassLine) {
			passCount++;
		} else if (isSummaryLine) {
			flushPassCount(kept, passCount);
			passCount = 0;
			kept.push(line);
		} else {
			kept.push(line);
		}
	}

	flushPassCount(kept, passCount);
	return kept.join('\n');
}

// ── Package manager filter ────────────────────────────────────────────────────

/**
 * Compress npm/npx/pnpm/yarn output by removing progress spinners, deprecation
 * warnings, and advisory noise while keeping errors and the final install summary.
 */
function filterPackageManager(output: string): string {
	return output
		.split('\n')
		.filter((line) => !isPackageManagerNoise(line))
		.join('\n');
}

function isPackageManagerNoise(line: string): boolean {
	// pnpm braille spinner
	if (/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(line)) return true;
	// pnpm Progress line
	if (/^Progress:/.test(line)) return true;
	// npm/yarn warn lines
	if (/^npm warn/i.test(line)) return true;
	if (/^warning /i.test(line)) return true;
	// Peer-dep deprecation lines
	if (/^npm warn deprecated/i.test(line)) return true;
	if (/^warning ".+ >/.test(line)) return true;
	// Audit advisory prose
	if (/^found \d+ vulnerabilit/i.test(line)) return true;
	return false;
}

// ── TypeScript filter ─────────────────────────────────────────────────────────

/**
 * Compress `tsc` output by grouping diagnostics by error code, showing up to
 * TSC_MAX_EXAMPLES_PER_CODE occurrences of each code with a trailing ellipsis.
 */
function filterTsc(output: string): string {
	const lines = output.split('\n');
	const errorsByCode = new Map<string, string[]>();
	const other: string[] = [];

	for (const line of lines) {
		// TypeScript diagnostic format: "path(line,col): error TS1234: message"
		const match = line.match(/: (error|warning) (TS\d+):/);
		if (match) {
			const code = match[2] ?? '';
			const bucket = errorsByCode.get(code);
			if (!bucket) {
				errorsByCode.set(code, [line]);
			} else if (bucket.length < TSC_MAX_EXAMPLES_PER_CODE) {
				bucket.push(line);
			} else if (bucket.length === TSC_MAX_EXAMPLES_PER_CODE) {
				bucket.push(`  ... (more ${code} errors)`);
			}
		} else {
			other.push(line);
		}
	}

	return [...other, ...[...errorsByCode.values()].flat()].join('\n');
}

// ── ESLint filter ─────────────────────────────────────────────────────────────

/**
 * Compress ESLint output by grouping violations by rule, showing up to
 * ESLINT_MAX_EXAMPLES_PER_RULE occurrences with a trailing ellipsis.
 */
function filterEslint(output: string): string {
	const lines = output.split('\n');
	const byRule = new Map<string, string[]>();
	const other: string[] = [];

	for (const line of lines) {
		// ESLint line format: "  10:5  error  no-unused-vars  message text"
		const match = line.match(/^\s+\d+:\d+\s+(error|warning)\s+(\S+)/);
		if (match) {
			const rule = match[2] ?? '';
			const bucket = byRule.get(rule);
			if (!bucket) {
				byRule.set(rule, [line]);
			} else if (bucket.length < ESLINT_MAX_EXAMPLES_PER_RULE) {
				bucket.push(line);
			} else if (bucket.length === ESLINT_MAX_EXAMPLES_PER_RULE) {
				bucket.push(`  ... (more ${rule} violations)`);
			}
		} else {
			other.push(line);
		}
	}

	return [...other, ...[...byRule.values()].flat()].join('\n');
}

// ── Cargo filter ──────────────────────────────────────────────────────────────

/**
 * Compress cargo output by collapsing consecutive Compiling lines to a count
 * summary, keeping warnings and errors intact.
 */
function filterCargo(output: string): string {
	const lines = output.split('\n');
	const kept: string[] = [];
	let compilingCount = 0;

	const flushCompiling = (): void => {
		if (compilingCount > 0) {
			kept.push(`[${compilingCount} package${compilingCount === 1 ? '' : 's'} compiled]`);
			compilingCount = 0;
		}
	};

	for (const line of lines) {
		if (/^\s*Compiling\s+\S+\s+v\d/.test(line)) {
			compilingCount++;
		} else {
			flushCompiling();
			kept.push(line);
		}
	}
	flushCompiling();
	return kept.join('\n');
}

// ── Python / pytest filter ────────────────────────────────────────────────────

/**
 * Compress python/pytest output by collapsing passing tests to a count summary,
 * keeping failures and tracebacks. Mirrors filterTestRunner for consistency.
 */
function filterPython(output: string): string {
	const lines = output.split('\n');
	const kept: string[] = [];
	let passCount = 0;

	const flushPassCount = (count: number): void => {
		if (count > 0) kept.push(`[${count} test${count === 1 ? '' : 's'} passed]`);
	};

	for (const line of lines) {
		const isPassLine = /^\s*(PASSED|\.)\s*$/.test(line) || /\s+PASSED$/.test(line);
		const isFailLine = /^\s*(FAILED|F\s|ERROR)/.test(line);
		const isSummaryLine = /^(=+|FAILED|ERROR|passed|failed|error|warnings summary|short test)/.test(line);

		if (isFailLine) {
			flushPassCount(passCount);
			passCount = 0;
			kept.push(line);
		} else if (isPassLine) {
			passCount++;
		} else if (isSummaryLine) {
			flushPassCount(passCount);
			passCount = 0;
			kept.push(line);
		} else {
			kept.push(line);
		}
	}
	flushPassCount(passCount);
	return kept.join('\n');
}
