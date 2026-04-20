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
	pytest: filterPython,
	python: filterPython
};

function applyFilter(tool: string, output: string, command: string): string {
	return (TOOL_FILTERS[tool] ?? ((o: string) => o))(output, command);
}

function firstToken(command: string): string {
	return command.trimStart().split(/\s+/)[0] ?? '';
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
