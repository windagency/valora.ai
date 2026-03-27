/**
 * AST Tools Service
 *
 * LLM tool handlers for AST-based code intelligence:
 * symbol_search, file_outline, find_references, smart_context, request_context
 */

import { readFile } from 'fs/promises';
import { join } from 'path';

import type { getLogger } from 'output/logger';

import { extractSmartContext } from './ast-context.service';
import { getASTIndexService } from './ast-index.service';
import { DEFAULT_SEARCH_LIMIT, findReferences, getFileOutline, searchSymbols } from './ast-query.service';

type Logger = ReturnType<typeof getLogger>;

/**
 * AST Tools Service — handles LLM tool calls for AST operations
 */
export class ASTToolsService {
	private readonly projectRoot: string;

	constructor(projectRoot: string = process.cwd(), _logger?: Logger) {
		this.projectRoot = projectRoot;
	}

	/**
	 * Execute the symbol_search tool
	 */
	executeSymbolSearch(args: Record<string, unknown>): string {
		const query = args['query'] as string;
		if (!query) return 'symbol_search requires a query argument';

		const indexService = getASTIndexService(this.projectRoot);

		// Ensure index is available
		if (!indexService.isBuilt()) {
			if (!indexService.loadIndex()) {
				return 'Codebase index not yet built. Run `valora index build` or wait for automatic indexing. Falling back to grep.';
			}
		}

		const kind = args['kind'] as string | undefined;
		const language = args['language'] as string | undefined;

		const results = searchSymbols(query, {
			kind: kind as Parameters<typeof searchSymbols>[1] extends { kind?: infer K } ? K : never,
			language,
			limit: DEFAULT_SEARCH_LIMIT
		});

		if (results.length === 0) {
			return `No symbols found matching "${query}"`;
		}

		const formatted = results.map((r) => {
			const sym = r.symbol;
			const exportLabel = sym.exported ? 'exported ' : '';
			const doc = sym.docComment ? ` — ${sym.docComment.split('\n')[0]}` : '';
			return `${sym.filePath}:${sym.startLine} ${exportLabel}${sym.kind} ${sym.name}${doc} (score: ${r.score})`;
		});

		return formatted.join('\n');
	}

	/**
	 * Execute the file_outline tool
	 */
	executeFileOutline(args: Record<string, unknown>): string {
		const path = args['path'] as string;
		if (!path) return 'file_outline requires a path argument';

		const indexService = getASTIndexService(this.projectRoot);

		if (!indexService.isBuilt()) {
			if (!indexService.loadIndex()) {
				return 'Codebase index not yet built. Falling back to basic file reading.';
			}
		}

		const outline = getFileOutline(path);
		if (outline.length === 0) {
			return `No symbols found in ${path}. The file may not be indexed yet.`;
		}

		const formatted = outline.map((entry) => formatOutlineEntry(entry, 0));
		return formatted.join('\n');
	}

	/**
	 * Execute the find_references tool
	 */
	executeFindReferences(args: Record<string, unknown>): string {
		const symbol = args['symbol'] as string;
		if (!symbol) return 'find_references requires a symbol argument';

		const indexService = getASTIndexService(this.projectRoot);

		if (!indexService.isBuilt()) {
			if (!indexService.loadIndex()) {
				return 'Codebase index not yet built. Falling back to grep.';
			}
		}

		const scopePath = args['path'] as string | undefined;
		const refs = findReferences(symbol, scopePath);

		if (refs.length === 0) {
			return `No references found for "${symbol}"`;
		}

		const formatted = refs.map((r) => `${r.filePath}:${r.line} — ${r.symbolName}`);

		return `Found ${refs.length} reference(s) to "${symbol}":\n${formatted.join('\n')}`;
	}

	/**
	 * Execute the smart_context tool
	 */
	executeSmartContext(args: Record<string, unknown>): string {
		const task = args['task'] as string;
		if (!task) return 'smart_context requires a task argument';

		const indexService = getASTIndexService(this.projectRoot);

		if (!indexService.isBuilt()) {
			if (!indexService.loadIndex()) {
				return 'Codebase index not yet built. Cannot extract smart context.';
			}
		}

		const files = args['files'] as string[] | undefined;
		const budget = args['budget'] as number | undefined;
		const mode = args['mode'] as 'broad' | 'focused' | undefined;

		const result = extractSmartContext({ budget, files, mode, task });

		const header =
			`Smart context: ${result.includedFiles.length} files, ~${result.tokenEstimate} tokens\n` +
			`Focal symbols: ${result.focalSymbols.join(', ') || 'none'}\n---\n`;

		return header + result.content;
	}

	/**
	 * Execute the request_context tool (progressive disclosure)
	 */
	async executeRequestContext(args: Record<string, unknown>): Promise<string> {
		const target = args['target'] as string;
		if (!target) return 'request_context requires a target argument';

		const level = (args['level'] as string) ?? 'full';

		const indexService = getASTIndexService(this.projectRoot);

		// Try to find the target as a file
		const fileEntry = indexService.getFile(target);
		if (fileEntry) {
			if (level === 'signatures') {
				const symbols = indexService.lookupByFile(target);
				const exported = symbols.filter((s) => s.exported);
				return exported.map((s) => s.signature).join('\n');
			}

			// Full file content
			try {
				const absPath = join(this.projectRoot, target);
				const content = await readFile(absPath, 'utf-8');
				return `--- File: ${target} ---\n${content}\n--- End of File ---`;
			} catch {
				return `Could not read file: ${target}`;
			}
		}

		// Try to find the target as a symbol
		const results = searchSymbols(target, { limit: 1 });
		if (results.length > 0) {
			const sym = results[0]!.symbol;
			if (level === 'signatures') {
				return sym.signature;
			}

			// Full symbol body
			try {
				const absPath = join(this.projectRoot, sym.filePath);
				const content = await readFile(absPath, 'utf-8');
				const lines = content.split('\n');
				const body = lines.slice(sym.startLine - 1, sym.endLine).join('\n');
				return `// ${sym.filePath}:${sym.startLine}-${sym.endLine}\n${body}`;
			} catch {
				return `Could not read symbol body for: ${target}`;
			}
		}

		return `Target not found in index: "${target}". Try using read_file or grep.`;
	}
}

/**
 * Format an outline entry with indentation
 */
function formatOutlineEntry(entry: ReturnType<typeof getFileOutline>[number], depth: number): string {
	const indent = '  '.repeat(depth);
	const exportLabel = entry.exported ? 'exported ' : '';
	let line = `${indent}${entry.startLine}-${entry.endLine} ${exportLabel}${entry.kind} ${entry.name}: ${entry.signature}`;

	if (entry.children) {
		const childLines = entry.children.map((c) => formatOutlineEntry(c, depth + 1));
		line += '\n' + childLines.join('\n');
	}

	return line;
}

/**
 * Singleton management
 */
let astToolsServiceInstance: ASTToolsService | null = null;

export function getASTToolsService(projectRoot?: string): ASTToolsService {
	astToolsServiceInstance ??= new ASTToolsService(projectRoot);
	return astToolsServiceInstance;
}

export function resetASTToolsService(): void {
	astToolsServiceInstance = null;
}
