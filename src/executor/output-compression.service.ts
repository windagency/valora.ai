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

import { MAX_GREP_OUTPUT_LINES, MAX_TERMINAL_OUTPUT_CHARS, OUTPUT_COMPRESSION_THRESHOLD } from 'config/constants';

/** Maximum git log entries to retain when compressing `git log` output. */
const GIT_LOG_MAX_ENTRIES = 20;

/** Maximum examples per diagnostic code when compressing `tsc` output. */
const TSC_MAX_EXAMPLES_PER_CODE = 3;

/** Maximum examples per lint rule when compressing `eslint` output. */
const ESLINT_MAX_EXAMPLES_PER_RULE = 2;

/** ANSI CSI escape sequence — matches colour codes, cursor movement, etc. */
const ANSI_ESCAPE_RE = new RegExp(String.fromCharCode(0x1b) + '\\[[0-9;]*[a-zA-Z]', 'g');

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
	const compressed = applyFilter(tool, clean, command);
	const result = truncateTerminalOutput(compressed);

	recordCompression(clean.length, result.length);

	return result;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

const TOOL_FILTERS: Record<string, (output: string, command: string) => string> = {
	cargo: filterCargo,
	docker: filterDocker,
	eslint: filterEslint,
	git: (output, command) => filterGit(command, output),
	grep: filterRg,
	jest: filterTestRunner,
	make: filterMake,
	npm: filterPackageManager,
	npx: filterPackageManager,
	pnpm: filterPackageManager,
	pytest: filterPython,
	python: filterPython,
	rg: filterRg,
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

// ── Git filters ───────────────────────────────────────────────────────────────

const GIT_SUBCOMMAND_FILTERS: Record<string, (output: string) => string> = {
	diff: filterGitDiff,
	log: filterGitLog,
	status: filterGitStatus
};

function filterGit(command: string, output: string): string {
	const subMatch = command.match(/git\s+(\w+)/);
	const sub = subMatch?.[1] ?? '';
	return (GIT_SUBCOMMAND_FILTERS[sub] ?? ((o: string) => o))(output);
}

/**
 * Compress `git diff` output by removing internal metadata lines.
 * Changed lines (+/-) and hunk headers (@@ ... @@) are always preserved.
 */
function extractCommitSubject(line: string): string {
	const trimmed = line.trim();
	return trimmed && !/^(Author:|Date:|Merge:)/.test(trimmed) ? trimmed : '';
}

function filterGitDiff(output: string): string {
	return output
		.split('\n')
		.filter((line) => !isGitDiffMetaLine(line))
		.join('\n');
}

function isGitDiffMetaLine(line: string): boolean {
	// "index a3f8c2e..9d4b1f7 100644"
	if (/^index [0-9a-f]+\.\.[0-9a-f]+/.test(line)) return true;
	// "old mode 100644" / "new mode 100644"
	if (/^(old|new) mode \d+$/.test(line)) return true;
	return false;
}

/**
 * Compress `git log` output by converting multi-line commit entries to a
 * one-line-per-commit format, capped at GIT_LOG_MAX_ENTRIES.
 */
function filterGitLog(output: string): string {
	const lines = output.split('\n');
	const entries: string[] = [];
	let currentHash = '';
	let currentSubject = '';

	for (const line of lines) {
		const commitMatch = line.match(/^commit ([0-9a-f]{7,40})/);
		if (commitMatch) {
			if (currentHash) entries.push(`${currentHash.slice(0, 7)} ${currentSubject}`);
			if (entries.length >= GIT_LOG_MAX_ENTRIES) break;
			currentHash = commitMatch[1] ?? '';
			currentSubject = '';
		} else if (currentHash && !currentSubject) {
			currentSubject = extractCommitSubject(line);
		}
	}

	if (currentHash && entries.length < GIT_LOG_MAX_ENTRIES) {
		entries.push(`${currentHash.slice(0, 7)} ${currentSubject}`);
	}

	return entries.join('\n');
}

/**
 * Compress `git status` by keeping only the branch line and per-file entries,
 * discarding verbose section prose and blank lines.
 */
function filterGitStatus(output: string): string {
	const lines = output.split('\n').filter((l) => l.trim());

	const kept: string[] = [];
	for (const line of lines) {
		// "On branch ..." / "HEAD detached ..." / "No commits yet"
		if (/^(On branch|HEAD detached|No commits)/.test(line)) {
			kept.push(line);
			continue;
		}
		// File status lines — indented with a tab + status word
		if (/^\t(modified|new file|deleted|renamed|copied|both|Untracked)/.test(line)) {
			kept.push(line.trim());
			continue;
		}
		// Section headers ("Changes to be committed:", "Untracked files:", etc.)
		if (/^(Changes|Untracked|nothing|Your branch)/.test(line)) {
			kept.push(line);
			continue;
		}
	}

	return kept.join('\n');
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

// ── rg / grep filter ──────────────────────────────────────────────────────────

/**
 * Compress rg/grep output by deduplicating identical lines and capping at
 * MAX_GREP_OUTPUT_LINES to prevent overwhelming the context window.
 */
function filterRg(output: string): string {
	const lines = output.split('\n');
	const seen = new Set<string>();
	const deduped: string[] = [];
	for (const line of lines) {
		if (!seen.has(line)) {
			seen.add(line);
			deduped.push(line);
		}
	}
	return deduped.slice(0, MAX_GREP_OUTPUT_LINES).join('\n');
}

// ── Docker filter ─────────────────────────────────────────────────────────────

/**
 * Compress docker output by removing layer-pull progress lines, keeping errors
 * and the final digest/completion line.
 */
function filterDocker(output: string): string {
	return output
		.split('\n')
		.filter((line) => !isDockerProgressLine(line))
		.join('\n');
}

function isDockerProgressLine(line: string): boolean {
	if (/^Pulling from /.test(line)) return true;
	if (/^Pulling fs layer/.test(line)) return true;
	if (/^Waiting$/.test(line.trim())) return true;
	if (/^Downloading/.test(line)) return true;
	if (/^Extracting/.test(line)) return true;
	if (/^Pull complete/.test(line)) return true;
	if (/^Already exists/.test(line)) return true;
	return false;
}

// ── Make filter ───────────────────────────────────────────────────────────────

/**
 * Compress make output by removing directory-entry chatter, keeping recipe
 * lines and errors.
 */
function filterMake(output: string): string {
	return output
		.split('\n')
		.filter((line) => !/^make\[\d+\]: (Entering|Leaving) directory/.test(line))
		.join('\n');
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
