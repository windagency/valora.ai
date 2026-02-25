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

import type { getLogger } from 'output/logger';

import { exec } from 'child_process';
import { DEFAULT_TIMEOUT_MS } from 'config/constants';
import { promisify } from 'util';

const execAsync = promisify(exec);

type Logger = ReturnType<typeof getLogger>;

/**
 * Paths to exclude from grep searches
 */
const GREP_EXCLUDE_PATHS = ['.ai/sessions', 'node_modules', '.git', 'dist', 'build', '*.log', '*.json'];

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
			throw new Error('glob_file_search requires pattern argument');
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
			throw new Error('grep requires pattern argument');
		}

		try {
			// Build exclusion patterns for ripgrep
			const excludes = GREP_EXCLUDE_PATHS.map((p) => `--glob '!${p}'`).join(' ');

			// Use ripgrep for better performance with exclusions, fall back to grep
			const command = `rg --line-number ${excludes} "${pattern}" "${path}" 2>/dev/null || grep -rn --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.ai "${pattern}" "${path}" 2>/dev/null`;
			const { stdout } = await execAsync(command, {
				cwd: this.workingDir,
				timeout: DEFAULT_TIMEOUT_MS
			});

			return stdout || 'No matches found';
		} catch {
			return 'No matches found';
		}
	}

	/**
	 * Semantic codebase search
	 * Currently falls back to grep-based search
	 */
	async executeCodebaseSearch(args: Record<string, unknown>): Promise<string> {
		const query = args['query'] as string;

		if (!query) {
			throw new Error('codebase_search requires query argument');
		}

		// For now, fall back to grep-based search
		// A real implementation would use embeddings/semantic search
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
