/**
 * LSP Tools Service
 *
 * LLM tool handlers for LSP operations:
 * goto_definition, get_type_info, get_diagnostics, hover_info
 */

import { readFile } from 'fs/promises';
import { join } from 'path';

import type { getLogger } from 'output/logger';

import type { DefinitionResult, HoverResult, LSPLocation, LSPPosition } from './lsp.types';

import { getLSPClientManager } from './lsp-client-manager.service';
import { LSPResultCache } from './lsp-result-cache';

type Logger = ReturnType<typeof getLogger>;

/** Delay to allow language server to compute diagnostics after opening a document */
const DIAGNOSTICS_WAIT_MS = 2000;

/** Maximum number of diagnostic items to display */
const MAX_DIAGNOSTIC_DISPLAY = 20;

/** Map from LSP diagnostic severity numbers to human-readable labels */
const SEVERITY_MAP: Record<number, string> = { 1: 'error', 2: 'warning', 3: 'info', 4: 'hint' };

/** Maps file extensions (without leading dot) to LSP language identifiers */
const LSP_LANGUAGE_ID_MAP: Record<string, string> = {
	cjs: 'javascript',
	cts: 'typescript',
	go: 'go',
	java: 'java',
	js: 'javascript',
	jsx: 'javascriptreact',
	mjs: 'javascript',
	mts: 'typescript',
	py: 'python',
	rs: 'rust',
	ts: 'typescript',
	tsx: 'typescriptreact'
};

/**
 * LSP Tools Service — handles LLM tool calls for LSP operations
 */
export class LSPToolsService {
	private readonly cache = new LSPResultCache();
	private readonly projectRoot: string;

	constructor(projectRoot: string = process.cwd(), _logger?: Logger) {
		this.projectRoot = projectRoot;
	}

	/**
	 * Execute the goto_definition tool
	 */
	async executeGotoDefinition(args: Record<string, unknown>): Promise<string> {
		const filePath = args['file_path'] as string;
		if (!filePath) return 'goto_definition requires a file_path argument';

		const position = await this.resolvePosition(filePath, args);
		if (!position) return 'Could not resolve position. Provide either symbol name or line/character.';

		const cacheKey = LSPResultCache.makeKey('definition', filePath, position.line, position.character);
		const cached = this.cache.get<DefinitionResult>(cacheKey);
		if (cached) return this.formatDefinitionResult(cached);

		const manager = getLSPClientManager(this.projectRoot);
		const client = await manager.getClientForFile(filePath);
		if (!client) return 'No language server available for this file type. Use grep as fallback.';

		try {
			// Open the document
			const content = await this.readFileContent(filePath);
			if (!content) return `Could not read file: ${filePath}`;

			client.sendNotification('textDocument/didOpen', {
				textDocument: {
					languageId: this.getLanguageId(filePath),
					text: content,
					uri: this.toUri(filePath),
					version: 1
				}
			});

			const result = await client.sendRequest('textDocument/definition', {
				position,
				textDocument: { uri: this.toUri(filePath) }
			});

			const defResult = this.parseDefinitionResult(result);
			if (defResult) {
				this.cache.set(cacheKey, defResult);
				return this.formatDefinitionResult(defResult);
			}

			return 'No definition found';
		} catch (error) {
			return `Language server unavailable. Use grep to search for the definition instead.`;
		}
	}

	/**
	 * Execute the get_type_info tool
	 */
	async executeGetTypeInfo(args: Record<string, unknown>): Promise<string> {
		const filePath = args['file_path'] as string;
		if (!filePath) return 'get_type_info requires a file_path argument';

		const position = await this.resolvePosition(filePath, args);
		if (!position) return 'Could not resolve position.';

		return this.executeHover(filePath, position, 'type');
	}

	/**
	 * Execute the get_diagnostics tool
	 */
	async executeGetDiagnostics(args: Record<string, unknown>): Promise<string> {
		const filePath = args['file_path'] as string;
		if (!filePath) return 'get_diagnostics requires a file_path argument';

		const manager = getLSPClientManager(this.projectRoot);
		const client = await manager.getClientForFile(filePath);
		if (!client) return 'No language server available. Use the compiler/linter directly via run_terminal_cmd.';

		try {
			const content = await this.readFileContent(filePath);
			if (!content) return `Could not read file: ${filePath}`;

			// Open document to trigger diagnostics
			client.sendNotification('textDocument/didOpen', {
				textDocument: {
					languageId: this.getLanguageId(filePath),
					text: content,
					uri: this.toUri(filePath),
					version: 1
				}
			});

			// Wait briefly for diagnostics to arrive
			await new Promise((resolve) => setTimeout(resolve, DIAGNOSTICS_WAIT_MS));

			// Pull diagnostics (LSP 3.17+)
			try {
				const result = await client.sendRequest('textDocument/diagnostic', {
					textDocument: { uri: this.toUri(filePath) }
				});

				return this.formatDiagnostics(filePath, result);
			} catch {
				return 'Diagnostics not available from this language server. Use run_terminal_cmd with the compiler.';
			}
		} catch {
			return 'Language server unavailable for diagnostics.';
		}
	}

	/**
	 * Execute the hover_info tool
	 */
	async executeHoverInfo(args: Record<string, unknown>): Promise<string> {
		const filePath = args['file_path'] as string;
		if (!filePath) return 'hover_info requires a file_path argument';

		const position = await this.resolvePosition(filePath, args);
		if (!position) return 'Could not resolve position.';

		return this.executeHover(filePath, position, 'hover');
	}

	// --- Private helpers ---

	/**
	 * Execute a hover request
	 */
	private async executeHover(filePath: string, position: LSPPosition, mode: 'hover' | 'type'): Promise<string> {
		const cacheKey = LSPResultCache.makeKey(mode, filePath, position.line, position.character);
		const cached = this.cache.get<HoverResult>(cacheKey);
		if (cached) return cached.contents;

		const manager = getLSPClientManager(this.projectRoot);
		const client = await manager.getClientForFile(filePath);
		if (!client) return 'No language server available.';

		try {
			const content = await this.readFileContent(filePath);
			if (!content) return `Could not read file: ${filePath}`;

			client.sendNotification('textDocument/didOpen', {
				textDocument: {
					languageId: this.getLanguageId(filePath),
					text: content,
					uri: this.toUri(filePath),
					version: 1
				}
			});

			const result = (await client.sendRequest('textDocument/hover', {
				position,
				textDocument: { uri: this.toUri(filePath) }
			})) as null | { contents?: string | { kind?: string; value?: string } };

			if (!result) return 'No hover information available';

			const hoverContents =
				typeof result.contents === 'string'
					? result.contents
					: (result.contents?.value ?? 'No hover information available');

			const hoverResult: HoverResult = { contents: hoverContents };
			this.cache.set(cacheKey, hoverResult);
			return hoverContents;
		} catch {
			return 'Language server unavailable. Use grep or read_file as fallback.';
		}
	}

	/**
	 * Resolve a position from either symbol name or line/character
	 */
	private async resolvePosition(filePath: string, args: Record<string, unknown>): Promise<LSPPosition | null> {
		const line = args['line'] as number | undefined;
		const character = args['character'] as number | undefined;

		if (line !== undefined) {
			return { character: character ?? 0, line };
		}

		// Symbol name resolution
		const symbol = args['symbol'] as string | undefined;
		if (!symbol) return null;

		const content = await this.readFileContent(filePath);
		if (!content) return null;

		// Find symbol in file
		const lines = content.split('\n');
		const lineIdx = lines.findIndex((l) => l.includes(symbol));
		if (lineIdx === -1) return null;

		return { character: lines[lineIdx]!.indexOf(symbol), line: lineIdx };
	}

	/**
	 * Read file content
	 */
	private async readFileContent(filePath: string): Promise<null | string> {
		try {
			const absPath = filePath.startsWith('/') ? filePath : join(this.projectRoot, filePath);
			return await readFile(absPath, 'utf-8');
		} catch {
			return null;
		}
	}

	/**
	 * Convert file path to URI
	 */
	private toUri(filePath: string): string {
		const absPath = filePath.startsWith('/') ? filePath : join(this.projectRoot, filePath);
		return `file://${absPath}`;
	}

	/**
	 * Get language ID for a file
	 */
	private getLanguageId(filePath: string): string {
		const ext = filePath.split('.').pop()?.toLowerCase();
		return LSP_LANGUAGE_ID_MAP[ext ?? ''] ?? 'plaintext';
	}

	/**
	 * Parse a definition result from LSP
	 */
	private parseDefinitionResult(result: unknown): DefinitionResult | null {
		const loc = extractLocation(result);
		if (!loc?.uri) return null;

		const filePath = loc.uri.replace('file://', '');
		const line = loc.range?.start?.line ?? 0;

		return {
			display: `${filePath}:${line + 1}`,
			location: {
				range: {
					end: loc.range?.end ?? { character: 0, line },
					start: loc.range?.start ?? { character: 0, line }
				},
				uri: loc.uri
			}
		};
	}

	/**
	 * Format a definition result for display
	 */
	private formatDefinitionResult(result: DefinitionResult): string {
		return `Definition found at: ${result.display}`;
	}

	/**
	 * Format diagnostics for display
	 */
	private formatDiagnostics(filePath: string, result: unknown): string {
		if (!result || typeof result !== 'object') return 'No diagnostics available';

		const items = (result as { items?: unknown[] }).items ?? [];
		if (items.length === 0) return `No diagnostics for ${filePath}`;

		const formatted = items.slice(0, MAX_DIAGNOSTIC_DISPLAY).map((item: unknown) => {
			const d = item as {
				message?: string;
				range?: { start?: { character?: number; line?: number } };
				severity?: number;
			};
			const severity = SEVERITY_MAP[d.severity ?? 4] ?? 'unknown';
			const line = (d.range?.start?.line ?? 0) + 1;
			return `${filePath}:${line} [${severity}] ${d.message ?? ''}`;
		});

		return formatted.join('\n');
	}
}

/**
 * Extract a single location from an LSP definition result
 */
function extractLocation(result: unknown): null | Partial<LSPLocation> {
	if (!result) return null;
	// LSP can return Location or Location[] or LocationLink[]
	const loc = (Array.isArray(result) ? result[0] : result) as null | Partial<LSPLocation> | undefined;
	if (!loc || typeof loc !== 'object') return null;
	return loc;
}

/**
 * Singleton management
 */
let lspToolsServiceInstance: LSPToolsService | null = null;

export function getLSPToolsService(projectRoot?: string): LSPToolsService {
	lspToolsServiceInstance ??= new LSPToolsService(projectRoot);
	return lspToolsServiceInstance;
}

export function resetLSPToolsService(): void {
	lspToolsServiceInstance = null;
}
