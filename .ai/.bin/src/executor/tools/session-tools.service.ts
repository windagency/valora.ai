/**
 * Session Tools Service
 *
 * Handles session querying operations for the LLM tool system.
 * Extracted from ToolExecutionService to follow Single Responsibility Principle.
 *
 * Operations:
 * - List recent sessions
 * - Search sessions for content
 * - Get session details
 */

import type { getLogger } from 'output/logger';

import { existsSync, readdirSync } from 'fs';
import { readFile } from 'utils/file-utils';
import { isNonEmptyString } from 'utils/type-guards';

type Logger = ReturnType<typeof getLogger>;

/**
 * Maximum output size for session queries (prevents context overflow)
 */
const MAX_SESSION_OUTPUT_SIZE = 50000;

/**
 * Sessions directory relative path
 */
const SESSIONS_DIR = '.ai/sessions';

/**
 * Session summary for listing
 */
interface SessionSummary {
	command: string;
	created: string;
	id: string;
	status: string;
}

/**
 * Search result entry
 */
interface SearchResult {
	context: string;
	match: string;
	sessionId: string;
}

/**
 * Session file structure (partial - only fields we use)
 */
interface SessionFile {
	commands?: Array<{
		command?: string;
		duration_ms?: number;
		outputs?: Record<string, unknown>;
		status?: string;
	}>;
	created_at?: string;
	session_id?: string;
	status?: string;
	updated_at?: string;
}

/**
 * Service for session query operations
 */
export class SessionToolsService {
	private readonly workingDir: string;

	constructor(workingDir: string = process.cwd(), _logger?: Logger) {
		this.workingDir = workingDir;
	}

	/**
	 * Execute query session tool
	 */
	async executeQuerySession(args: Record<string, unknown>): Promise<string> {
		const action = args['action'] as string;
		const query = args['query'] as string;
		const sessionId = args['session_id'] as string;

		if (!action) {
			throw new Error('query_session requires action argument (list, search, or get)');
		}

		const sessionsDir = this.resolvePath(SESSIONS_DIR);

		if (!existsSync(sessionsDir)) {
			return 'No sessions directory found. No previous sessions available.';
		}

		switch (action) {
			case 'get':
				if (!sessionId) {
					throw new Error('query_session with action="get" requires session_id argument');
				}
				return this.getSessionDetails(sessionsDir, sessionId);
			case 'list':
				return this.listSessions(sessionsDir);
			case 'search':
				if (!query) {
					throw new Error('query_session with action="search" requires query argument');
				}
				return this.searchSessions(sessionsDir, query);
			default:
				throw new Error(`Unknown action: ${action}. Use "list", "search", or "get"`);
		}
	}

	/**
	 * List recent sessions with metadata
	 */
	private async listSessions(sessionsDir: string): Promise<string> {
		const files = readdirSync(sessionsDir).filter((f) => f.endsWith('.json'));

		if (files.length === 0) {
			return 'No sessions found.';
		}

		const sessions = await this.parseSessionFiles(sessionsDir, files.slice(-20));

		// Sort by creation date (newest first)
		sessions.sort((a, b) => b.created.localeCompare(a.created));

		// Format output
		const lines = sessions.map((s) => `  ${s.id} | ${s.status.padEnd(10)} | ${s.command.padEnd(20)} | ${s.created}`);

		return ['Recent sessions:', '', ...lines].join('\n');
	}

	/**
	 * Parse session files into summaries
	 */
	private async parseSessionFiles(sessionsDir: string, files: string[]): Promise<SessionSummary[]> {
		const sessions: SessionSummary[] = [];

		for (const file of files) {
			const summary = await this.parseSessionFile(sessionsDir, file);
			if (summary) {
				sessions.push(summary);
			}
		}

		return sessions;
	}

	/**
	 * Parse a single session file into a summary
	 */
	private async parseSessionFile(sessionsDir: string, file: string): Promise<null | SessionSummary> {
		try {
			const content = await readFile(`${sessionsDir}/${file}`);
			const session = JSON.parse(content) as SessionFile;
			return {
				command: session.commands?.[0]?.command ?? 'unknown',
				created: session.created_at ?? 'unknown',
				id: session.session_id ?? file.replace('.json', ''),
				status: session.status ?? 'unknown'
			};
		} catch {
			return null;
		}
	}

	/**
	 * Search sessions for matching content
	 */
	private async searchSessions(sessionsDir: string, query: string): Promise<string> {
		const files = readdirSync(sessionsDir).filter((f) => f.endsWith('.json'));
		const lowerQuery = query.toLowerCase();
		const results: SearchResult[] = [];

		for (const file of files) {
			const fileResults = await this.searchSessionFile(sessionsDir, file, lowerQuery, query);
			results.push(...fileResults);

			// Limit total results
			if (results.length >= 10) {
				break;
			}
		}

		if (results.length === 0) {
			return `No matches found for query: "${query}"`;
		}

		// Format output with size limit
		let output = `Found ${results.length} match(es) for "${query}":\n\n`;

		for (const result of results) {
			const entry = `Session: ${result.sessionId}\n${result.context}\nMatch: ${result.match}\n\n---\n\n`;

			if (output.length + entry.length > MAX_SESSION_OUTPUT_SIZE) {
				output += '\n[Output truncated - use session_id to get specific session details]';
				break;
			}

			output += entry;
		}

		return output;
	}

	/**
	 * Search a single session file for matching content
	 */
	private async searchSessionFile(
		sessionsDir: string,
		file: string,
		lowerQuery: string,
		query: string
	): Promise<SearchResult[]> {
		const results: SearchResult[] = [];

		try {
			const content = await readFile(`${sessionsDir}/${file}`);
			const session = JSON.parse(content) as SessionFile;
			const sessionId = session.session_id ?? file.replace('.json', '');

			for (const cmd of session.commands ?? []) {
				const outputStr = JSON.stringify(cmd.outputs ?? {});

				if (!outputStr.toLowerCase().includes(lowerQuery)) {
					continue;
				}

				const match = this.extractMatchSnippet(outputStr, lowerQuery, query.length);
				results.push({
					context: `Command: ${cmd.command ?? 'unknown'}`,
					match,
					sessionId
				});

				// Limit matches per session
				if (results.length >= 3) {
					break;
				}
			}
		} catch {
			// Skip invalid session files
		}

		return results;
	}

	/**
	 * Extract a snippet around a match with context
	 */
	private extractMatchSnippet(text: string, lowerQuery: string, queryLength: number): string {
		const lowerText = text.toLowerCase();
		const matchIndex = lowerText.indexOf(lowerQuery);
		const start = Math.max(0, matchIndex - 100);
		const end = Math.min(text.length, matchIndex + queryLength + 200);
		const snippet = text.slice(start, end);

		return (start > 0 ? '...' : '') + snippet + (end < text.length ? '...' : '');
	}

	/**
	 * Get details of a specific session
	 */
	private async getSessionDetails(sessionsDir: string, sessionId: string): Promise<string> {
		const sessionFile = `${sessionsDir}/${sessionId}.json`;

		if (!existsSync(sessionFile)) {
			throw new Error(`Session not found: ${sessionId}`);
		}

		const content = await readFile(sessionFile);
		const session = JSON.parse(content) as SessionFile;

		// Build structured output
		const output: string[] = [
			`Session: ${session.session_id ?? 'unknown'}`,
			`Status: ${session.status ?? 'unknown'}`,
			`Created: ${session.created_at ?? 'unknown'}`,
			`Updated: ${session.updated_at ?? 'unknown'}`,
			''
		];

		// Add command summaries
		if (session.commands && session.commands.length > 0) {
			output.push('Commands executed:');
			session.commands.forEach((cmd) => {
				output.push(...this.formatCommandDetails(cmd));
			});
		}

		// Apply size limit
		let result = output.join('\n');
		if (result.length > MAX_SESSION_OUTPUT_SIZE) {
			result = result.slice(0, MAX_SESSION_OUTPUT_SIZE) + '\n\n[Output truncated due to size limit]';
		}

		return result;
	}

	/**
	 * Format command details for output
	 */
	private formatCommandDetails(cmd: NonNullable<SessionFile['commands']>[number]): string[] {
		const lines: string[] = [];
		lines.push(`  - ${cmd.command ?? 'unknown'} (${cmd.duration_ms ?? 0}ms, ${cmd.status ?? 'completed'})`);

		if (!cmd.outputs) {
			return lines;
		}

		const outputKeys = Object.keys(cmd.outputs);
		if (outputKeys.length === 0) {
			return lines;
		}

		lines.push(`    Outputs: ${outputKeys.join(', ')}`);

		for (const key of outputKeys.slice(0, 5)) {
			const formatted = this.formatOutputValue(key, cmd.outputs[key]);
			if (formatted) {
				lines.push(formatted);
			}
		}

		return lines;
	}

	/**
	 * Format a single output value with truncation
	 */
	private formatOutputValue(key: string, value: unknown): null | string {
		if (isNonEmptyString(value)) {
			const truncated = value.length > 500 ? value.slice(0, 500) + '...' : value;
			return `    ${key}: ${truncated}`;
		}

		if (typeof value === 'object' && value !== null) {
			const json = JSON.stringify(value);
			const truncated = json.length > 500 ? json.slice(0, 500) + '...' : json;
			return `    ${key}: ${truncated}`;
		}

		return null;
	}

	/**
	 * Resolve a path relative to the working directory
	 */
	private resolvePath(path: string): string {
		if (path.startsWith('/')) {
			return path;
		}
		return `${this.workingDir}/${path}`;
	}
}

/**
 * Singleton instance
 */
let sessionToolsServiceInstance: null | SessionToolsService = null;

/**
 * Get the singleton SessionToolsService instance
 */
export function getSessionToolsService(workingDir?: string): SessionToolsService {
	sessionToolsServiceInstance ??= new SessionToolsService(workingDir);
	return sessionToolsServiceInstance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetSessionToolsService(): void {
	sessionToolsServiceInstance = null;
}
