/**
 * Search Tools Service
 *
 * Handles file and content search operations for the LLM tool system.
 * Extracted from ToolExecutionService to follow Single Responsibility Principle.
 *
 * Operations:
 * - Glob file search
 * - Grep content search
 * - Codebase semantic search
 *
 * Uses SafeExecutor.execute (spawn with an argument array, no shell) — the
 * `pattern`/`path` arguments here come straight from an LLM tool call with no
 * sanitization, and search patterns routinely contain quotes/backticks/`$()`
 * when searching for code that itself contains those characters (e.g.
 * searching for `exec("`). Interpolating them into a shell string let an
 * embedded `"` break out and run arbitrary commands via completely ordinary
 * grep/glob_file_search usage — no adversarial intent required.
 */

import type { getLogger } from 'output/logger';

import { getASTIndexService } from 'ast/ast-index.service';
import { searchSymbols } from 'ast/ast-query.service';
import { DEFAULT_TIMEOUT_MS, MAX_GREP_OUTPUT_LINES } from 'config/constants';
import { SafeExecutor } from 'utils/safe-exec';

type Logger = ReturnType<typeof getLogger>;

/**
 * Paths to exclude from grep searches
 */
const GREP_EXCLUDE_PATHS = ['.valora/sessions', 'node_modules', '.git', 'dist', 'build', '*.log', '*.json'];
const GREP_EXCLUDE_ARGS = GREP_EXCLUDE_PATHS.flatMap((p) => ['--glob', `!${p}`]);
const GREP_FALLBACK_EXCLUDE_ARGS = [
	'--exclude-dir=node_modules',
	'--exclude-dir=.git',
	'--exclude-dir=.valora',
	'--exclude-dir=data'
];

/**
 * Service for search operations
 */
export class SearchToolsService {
	private readonly workingDir: string;

	constructor(workingDir: string = process.cwd(), _logger?: Logger) {
		this.workingDir = workingDir;
	}

	/**
	 * Search for files using glob pattern
	 * Uses fd for fast, .gitignore-aware file discovery with find as fallback
	 */
	async executeGlobSearch(args: Record<string, unknown>): Promise<string> {
		const pattern = args['pattern'] as string;

		if (!pattern) {
			return 'glob_file_search requires pattern argument';
		}

		try {
			const stdout = await this.runGlobSearch(pattern);
			const matches = stdout.trim().split('\n').slice(0, 100).join('\n');
			return matches || 'No files found matching pattern';
		} catch {
			return 'No files found matching pattern';
		}
	}

	/** Try fd first (fast, .gitignore-aware); fall back to find if fd is unavailable or errors. */
	private async runGlobSearch(pattern: string): Promise<string> {
		try {
			// `--glob` is fd's own boolean mode-switch flag — not a value-taking
			// option — so `--glob=<pattern>` is rejected outright (fd errors on
			// binding a value to a flag that takes none). The pattern is fd's own
			// positional argument; `--` marks the end of fd's own options so a
			// pattern starting with "-" can't be parsed as one of fd's own flags.
			const { stdout } = await SafeExecutor.execute(
				'fd',
				['--glob', '--type', 'f', '--max-results', '100', '--', pattern],
				{
					cwd: this.workingDir,
					timeout: DEFAULT_TIMEOUT_MS
				}
			);
			return stdout;
		} catch {
			const { stdout } = await SafeExecutor.execute('find', ['.', '-path', pattern, '-type', 'f'], {
				cwd: this.workingDir,
				timeout: DEFAULT_TIMEOUT_MS
			});
			return stdout;
		}
	}

	/**
	 * Search file contents using grep
	 */
	async executeGrep(args: Record<string, unknown>): Promise<string> {
		const pattern = args['pattern'] as string;
		const path = (args['path'] as string) ?? '.';

		if (!pattern) {
			return 'grep requires pattern argument';
		}

		try {
			const stdout = await this.runGrepSearch(pattern, path);
			if (!stdout) return 'No matches found';

			const lines = stdout.trimEnd().split('\n');
			const limited = lines.slice(0, MAX_GREP_OUTPUT_LINES).join('\n');
			const suffix =
				lines.length >= MAX_GREP_OUTPUT_LINES
					? `\n[Results limited to ${MAX_GREP_OUTPUT_LINES} lines — narrow your pattern for more precision]`
					: '';
			return limited + suffix;
		} catch {
			return 'No matches found';
		}
	}

	/** Try ripgrep first (fast, respects excludes); fall back to grep if rg is unavailable, errors, or finds nothing. */
	private async runGrepSearch(pattern: string, path: string): Promise<string> {
		// `--` marks the end of rg's/grep's own options — without it, a pattern
		// starting with "-" (e.g. rg's `--pre=COMMAND`, which spawns COMMAND per
		// matched file, or grep's `-f` reading the *next* argument as a
		// patterns-file instead of `path`) is parsed as a flag by the invoked
		// binary itself. Array-form spawn alone stops shell injection, not this
		// — a distinct argument-injection primitive against the same untrusted
		// tool-call `pattern`.
		try {
			const { stdout } = await SafeExecutor.execute(
				'rg',
				['--line-number', ...GREP_EXCLUDE_ARGS, '--', pattern, path],
				{
					cwd: this.workingDir,
					timeout: DEFAULT_TIMEOUT_MS
				}
			);
			return stdout;
		} catch {
			const { stdout } = await SafeExecutor.execute(
				'grep',
				['-rn', ...GREP_FALLBACK_EXCLUDE_ARGS, '--', pattern, path],
				{
					cwd: this.workingDir,
					timeout: DEFAULT_TIMEOUT_MS
				}
			);
			return stdout;
		}
	}

	/**
	 * Semantic codebase search
	 * Uses AST symbol index when available, falls back to grep
	 */
	async executeCodebaseSearch(args: Record<string, unknown>): Promise<string> {
		const query = args['query'] as string;

		if (!query) {
			return 'codebase_search requires query argument';
		}

		// Try AST index first for symbol-aware search
		try {
			const indexService = getASTIndexService(this.workingDir);
			if (indexService.isBuilt()) {
				const results = searchSymbols(query, { limit: 20 });
				if (results.length > 0) {
					const lines = results.map((r) => {
						const loc = `${r.symbol.filePath}:${r.symbol.startLine}`;
						const exp = r.symbol.exported ? 'exported ' : '';
						return `${loc} — ${exp}${r.symbol.kind} ${r.symbol.name} (${r.matchType})`;
					});
					const header = `Found ${results.length} symbol(s) matching "${query}":\n`;
					const grepNote = '\n\n(Also searching file contents with grep...)';
					const grepResults = await this.executeGrep({ path: '.', pattern: query });
					const grepSection = grepResults !== 'No matches found' ? `\n\nGrep results:\n${grepResults}` : '';
					return header + lines.join('\n') + grepNote + grepSection;
				}
			}
		} catch {
			// Fall through to grep
		}

		return this.executeGrep({ path: '.', pattern: query });
	}
}

/**
 * Singleton instance
 */
let searchToolsServiceInstance: null | SearchToolsService = null;

/**
 * Get the singleton SearchToolsService instance
 */
export function getSearchToolsService(workingDir?: string): SearchToolsService {
	searchToolsServiceInstance ??= new SearchToolsService(workingDir);
	return searchToolsServiceInstance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetSearchToolsService(): void {
	searchToolsServiceInstance = null;
}
