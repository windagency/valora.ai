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
 */

import { getASTIndexService } from 'ast/ast-index.service';
import { searchSymbols } from 'ast/ast-query.service';
import { exec } from 'child_process';
import { promisify } from 'util';

import type { getLogger } from 'output/logger';

import { DEFAULT_TIMEOUT_MS, MAX_GREP_OUTPUT_LINES } from 'config/constants';

const execAsync = promisify(exec);

type Logger = ReturnType<typeof getLogger>;

/**
 * Paths to exclude from grep searches
 */
const GREP_EXCLUDE_PATHS = ['.valora/sessions', 'node_modules', '.git', 'dist', 'build', '*.log', '*.json'];

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
			// Use fd for better performance and .gitignore awareness, fall back to find
			const command = `fd --glob "${pattern}" --type f --max-results 100 2>/dev/null || find . -path "${pattern}" -type f 2>/dev/null | head -100`;
			const { stdout } = await execAsync(command, {
				cwd: this.workingDir,
				timeout: DEFAULT_TIMEOUT_MS
			});

			const matches = stdout.trim();

			if (!matches) {
				return 'No files found matching pattern';
			}

			return matches;
		} catch {
			return 'No files found matching pattern';
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
			// Build exclusion patterns for ripgrep
			const excludes = GREP_EXCLUDE_PATHS.map((p) => `--glob '!${p}'`).join(' ');

			// Use ripgrep for better performance with exclusions, fall back to grep.
			// Wrap in parens so | head applies to the whole pipeline, not just the grep fallback.
			const command = `(rg --line-number ${excludes} "${pattern}" "${path}" 2>/dev/null || grep -rn --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.valora --exclude-dir=data "${pattern}" "${path}" 2>/dev/null) | head -${MAX_GREP_OUTPUT_LINES}`;
			const { stdout } = await execAsync(command, {
				cwd: this.workingDir,
				timeout: DEFAULT_TIMEOUT_MS
			});

			if (!stdout) return 'No matches found';

			const lines = stdout.trimEnd().split('\n');
			const suffix =
				lines.length >= MAX_GREP_OUTPUT_LINES
					? `\n[Results limited to ${MAX_GREP_OUTPUT_LINES} lines — narrow your pattern for more precision]`
					: '';
			return stdout.trimEnd() + suffix;
		} catch {
			return 'No matches found';
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
