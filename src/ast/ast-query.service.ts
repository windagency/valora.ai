/**
 * AST Query Service
 *
 * High-level query operations on the codebase index:
 * symbol search, file outline, reference finding.
 */

import type { FileOutlineEntry, IndexedSymbol, SymbolKind, SymbolSearchResult } from './ast.types';

import { getASTIndexService } from './ast-index.service';
import { CHARS_PER_TOKEN } from './ast-parser.service';

export const DEFAULT_SEARCH_LIMIT = 20;
const SCORE_EXACT = 100;
const SCORE_PREFIX = 80;
const SCORE_CONTAINS = 60;
const SCORE_FUZZY = 40;
const EXPORT_BONUS = 5;
const INITIAL_TOKEN_ESTIMATE = 10;

/**
 * Search for symbols by name with fuzzy matching
 */
export function searchSymbols(
	query: string,
	options?: { kind?: SymbolKind; language?: string; limit?: number }
): SymbolSearchResult[] {
	const indexService = getASTIndexService();
	const index = indexService.getIndex();
	const results: SymbolSearchResult[] = [];
	const queryLower = query.toLowerCase();
	const limit = options?.limit ?? DEFAULT_SEARCH_LIMIT;

	for (const [name, ids] of Object.entries(index.nameIndex)) {
		if (!ids || ids.length === 0) continue;

		const match = scoreSymbolMatch(name.toLowerCase(), queryLower);
		if (!match) continue;

		collectMatchingSymbols(ids, index, options, match, results);
	}

	results.sort((a, b) => b.score - a.score || a.symbol.name.localeCompare(b.symbol.name));
	return results.slice(0, limit);
}

/**
 * Score a symbol name match against a query
 */
function scoreSymbolMatch(
	nameLower: string,
	queryLower: string
): null | { matchType: SymbolSearchResult['matchType']; score: number } {
	if (nameLower === queryLower) return { matchType: 'exact', score: SCORE_EXACT };
	if (nameLower.startsWith(queryLower)) return { matchType: 'prefix', score: SCORE_PREFIX };
	if (nameLower.includes(queryLower)) return { matchType: 'contains', score: SCORE_CONTAINS };
	if (fuzzyMatch(queryLower, nameLower)) return { matchType: 'fuzzy', score: SCORE_FUZZY };
	return null;
}

/**
 * Collect matching symbols from IDs, applying filters
 */
function collectMatchingSymbols(
	ids: string[],
	index: ReturnType<ReturnType<typeof getASTIndexService>['getIndex']>,
	options: undefined | { kind?: SymbolKind; language?: string; limit?: number },
	match: { matchType: SymbolSearchResult['matchType']; score: number },
	results: SymbolSearchResult[]
): void {
	for (const id of ids) {
		const sym = index.symbols[id];
		if (!sym) continue;

		if (isSymbolFilteredOut(sym, index, options)) continue;

		const exportBonus = sym.exported ? EXPORT_BONUS : 0;
		results.push({
			matchType: match.matchType,
			score: match.score + exportBonus,
			symbol: sym
		});
	}
}

function isSymbolFilteredOut(
	sym: IndexedSymbol,
	index: ReturnType<ReturnType<typeof getASTIndexService>['getIndex']>,
	options: undefined | { kind?: SymbolKind; language?: string; limit?: number }
): boolean {
	if (options?.kind && sym.kind !== options.kind) return true;
	if (options?.language) {
		const file = index.files[sym.filePath];
		if (file && file.language !== options.language) return true;
	}
	return false;
}

/**
 * Get a structured outline of a file
 */
export function getFileOutline(filePath: string): FileOutlineEntry[] {
	const indexService = getASTIndexService();
	const symbols = indexService.lookupByFile(filePath);
	if (symbols.length === 0) return [];

	const topLevel: IndexedSymbol[] = [];
	const childrenMap = new Map<string, IndexedSymbol[]>();

	for (const sym of symbols) {
		if (sym.parentId) {
			if (!childrenMap.has(sym.parentId)) childrenMap.set(sym.parentId, []);
			childrenMap.get(sym.parentId)!.push(sym);
		} else {
			topLevel.push(sym);
		}
	}

	topLevel.sort((a, b) => a.startLine - b.startLine);
	return topLevel.map((sym) => symbolToOutlineEntry(sym, childrenMap));
}

/**
 * Find all references to a symbol across the index
 */
export function findReferences(
	symbolName: string,
	scopePath?: string
): Array<{ filePath: string; line: number; symbolId: string; symbolName: string }> {
	const indexService = getASTIndexService();
	const index = indexService.getIndex();
	const results: Array<{ filePath: string; line: number; symbolId: string; symbolName: string }> = [];

	for (const [id, sym] of Object.entries(index.symbols)) {
		if (sym.references.includes(symbolName)) {
			if (scopePath && !sym.filePath.startsWith(scopePath)) continue;
			results.push({ filePath: sym.filePath, line: sym.startLine, symbolId: id, symbolName: sym.name });
		}
	}

	for (const [filePath, fileEntry] of Object.entries(index.files)) {
		if (scopePath && !filePath.startsWith(scopePath)) continue;

		for (const imp of fileEntry.imports) {
			if (imp.names.includes(symbolName)) {
				results.push({
					filePath,
					line: 1,
					symbolId: `${filePath}#import#${symbolName}`,
					symbolName: `import ${symbolName}`
				});
			}
		}
	}

	return results;
}

/**
 * Generate a compact codebase map
 */
export function generateCodebaseMap(maxTokens?: number): string {
	const indexService = getASTIndexService();
	const index = indexService.getIndex();
	const budget = maxTokens ?? 2000;

	const dirMap = buildDirectoryMap(index);
	return renderCodebaseMap(dirMap, budget);
}

// --- Helpers ---

function buildDirectoryMap(
	index: ReturnType<ReturnType<typeof getASTIndexService>['getIndex']>
): Map<string, Array<{ name: string; symbols: IndexedSymbol[] }>> {
	const dirMap = new Map<string, Array<{ name: string; symbols: IndexedSymbol[] }>>();

	for (const [filePath, fileEntry] of Object.entries(index.files)) {
		const parts = filePath.split('/');
		const dir = parts.slice(0, -1).join('/') || '.';
		const name = parts[parts.length - 1] ?? filePath;

		if (!dirMap.has(dir)) dirMap.set(dir, []);

		const symbols = fileEntry.symbolIds
			.map((id) => index.symbols[id])
			.filter((s): s is IndexedSymbol => !!s && s.exported);

		dirMap.get(dir)!.push({ name, symbols });
	}

	return dirMap;
}

function fuzzyMatch(query: string, target: string): boolean {
	let qi = 0;
	for (let ti = 0; ti < target.length && qi < query.length; ti++) {
		if (target[ti] === query[qi]) qi++;
	}
	return qi === query.length;
}

function renderCodebaseMap(
	dirMap: Map<string, Array<{ name: string; symbols: IndexedSymbol[] }>>,
	budget: number
): string {
	const lines: string[] = ['## Codebase Map\n'];
	let tokenEstimate = INITIAL_TOKEN_ESTIMATE;

	const sortedDirs = Array.from(dirMap.entries()).sort(([a], [b]) => a.localeCompare(b));

	for (const [dir, files] of sortedDirs) {
		const dirLine = `${dir}/`;
		const dirTokens = Math.ceil(dirLine.length / CHARS_PER_TOKEN);

		if (tokenEstimate + dirTokens > budget) break;
		lines.push(dirLine);
		tokenEstimate += dirTokens;

		for (const file of files.sort((a, b) => a.name.localeCompare(b.name))) {
			const symbolNames = file.symbols.map((s) => s.name).join(', ');
			const fileLine = `  ${file.name} — ${symbolNames || '(no exports)'}`;
			const fileTokens = Math.ceil(fileLine.length / CHARS_PER_TOKEN);

			if (tokenEstimate + fileTokens > budget) break;
			lines.push(fileLine);
			tokenEstimate += fileTokens;
		}
	}

	return lines.join('\n');
}

function symbolToOutlineEntry(sym: IndexedSymbol, childrenMap: Map<string, IndexedSymbol[]>): FileOutlineEntry {
	const children = childrenMap.get(sym.id);
	const childEntries = children
		?.sort((a, b) => a.startLine - b.startLine)
		.map((c) => symbolToOutlineEntry(c, childrenMap));

	return {
		children: childEntries && childEntries.length > 0 ? childEntries : undefined,
		endLine: sym.endLine,
		exported: sym.exported,
		kind: sym.kind,
		name: sym.name,
		signature: sym.signature,
		startLine: sym.startLine
	};
}
