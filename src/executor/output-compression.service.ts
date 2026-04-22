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

const PRIORITY_LINE_RE = /error|Error|FAIL|FAILED|\bTS\d{4}\b|✗|✕|×|npm ERR!/;
const MAX_PRIORITY_CHARS = 2000;

/**
 * Truncate output to MAX_TERMINAL_OUTPUT_CHARS using head+tail strategy.
 * When the omitted middle contains priority lines (errors, failures), up to
 * 2 000 chars of those lines are surfaced before the omission notice.
 */
export function truncateTerminalOutput(output: string): string {
	if (output.length <= MAX_TERMINAL_OUTPUT_CHARS) return output;
	const HEAD = Math.floor(MAX_TERMINAL_OUTPUT_CHARS * 0.8);
	const TAIL = MAX_TERMINAL_OUTPUT_CHARS - HEAD;
	const omitted = output.length - HEAD - TAIL;
	const middle = output.substring(HEAD, output.length - TAIL);
	const priority = extractPriorityLines(middle);
	const omitNotice = priority
		? `\n\n[... ${omitted} characters omitted, priority lines below ...]\n${priority}\n\n`
		: `\n\n[... ${omitted} characters omitted ...]\n\n`;
	return output.substring(0, HEAD) + omitNotice + output.substring(output.length - TAIL);
}

function extractPriorityLines(text: string): string {
	let result = '';
	for (const line of text.split('\n')) {
		if (!PRIORITY_LINE_RE.test(line)) continue;
		if (result.length + line.length + 1 > MAX_PRIORITY_CHARS) break;
		result += line + '\n';
	}
	return result.trimEnd();
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

	const tool = resolveStrategyKey(command);
	const strategy = registry.get(tool);
	let compressed: string;
	if (strategy) {
		try {
			compressed = strategy(clean, command);
		} catch (err) {
			getLogger().warn(`Compression strategy for "${tool}" threw an error: ${String(err)}`);
			compressed = clean;
		}
	} else {
		compressed = clean;
	}

	const result = truncateTerminalOutput(compressed);
	recordCompression(output.length, result.length);
	return result;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

const WRAPPER_COMMANDS = new Set(['bun', 'bunx', 'npm', 'npx', 'pnpm', 'yarn']);

const PM_SUBCOMMANDS = new Set(['add', 'audit', 'dlx', 'exec', 'i', 'install', 'outdated', 'remove', 'run', 'test']);

function resolveStrategyKey(command: string): string {
	const tokens = command.trimStart().split(/\s+/);
	const first = tokens[0] ?? '';
	if (!WRAPPER_COMMANDS.has(first)) return first;
	const second = tokens[1] ?? '';
	if (!PM_SUBCOMMANDS.has(second) && registry.has(second)) return second;
	return first;
}
