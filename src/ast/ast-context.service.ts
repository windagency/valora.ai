/**
 * AST Context Service
 *
 * Smart context extraction for token reduction.
 * Provides budget-aware context assembly at different extraction levels.
 */

import type {
	ContextDeduplicationState,
	ContextLevel,
	IndexedSymbol,
	SmartContextOptions,
	SmartContextResult
} from './ast.types';

import { getASTIndexService } from './ast-index.service';
import { estimateTokens } from './ast-parser.service';
import { searchSymbols } from './ast-query.service';

/**
 * Default token budget (leaves room for system message + output)
 */
const DEFAULT_BUDGET = 50_000;

/** Fraction of budget allocated for dependency context */
const DEPENDENCY_BUDGET_RATIO = 0.9;

/** Maximum results when searching for focal symbols */
const FOCAL_SYMBOL_SEARCH_LIMIT = 5;

/** Maximum number of focal files to consider */
const MAX_FOCAL_FILES = 10;

/** Minimum word length for task word extraction */
const MIN_WORD_LENGTH = 3;

/**
 * Extract smart context for a task
 */
export function extractSmartContext(options: SmartContextOptions): SmartContextResult {
	const indexService = getASTIndexService();
	const index = indexService.getIndex();
	const budget = options.budget ?? DEFAULT_BUDGET;

	const includedFiles: SmartContextResult['includedFiles'] = [];
	const focalSymbols: string[] = [];
	const contentParts: string[] = [];
	let totalTokens = 0;

	// Step 1: Identify focal files
	const focalFiles = options.files ?? identifyFocalFiles(options.task, index);

	// Step 2: Identify focal symbols from task text
	const taskSymbols = identifyFocalSymbols(options.task);

	// Step 3: Add focal file symbols at Level 2 (full body)
	totalTokens = addFocalFileContext(
		focalFiles,
		taskSymbols,
		budget,
		indexService,
		contentParts,
		includedFiles,
		focalSymbols,
		totalTokens
	);

	// Step 4: Add dependency signatures at Level 1
	addDependencyContext(focalFiles, index, budget, indexService, contentParts, includedFiles, totalTokens);

	return {
		content: contentParts.join('\n\n'),
		focalSymbols,
		includedFiles,
		tokenEstimate: totalTokens
	};
}

/**
 * Add focal file symbols at Level 2
 */
function addFocalFileContext(
	focalFiles: string[],
	taskSymbols: string[],
	budget: number,
	indexService: ReturnType<typeof getASTIndexService>,
	contentParts: string[],
	includedFiles: SmartContextResult['includedFiles'],
	focalSymbols: string[],
	totalTokens: number
): number {
	for (const filePath of focalFiles) {
		if (totalTokens >= budget) break;

		const fileSymbols = indexService.lookupByFile(filePath);
		if (fileSymbols.length === 0) continue;

		const relevantSymbols = fileSymbols.filter((s) => s.exported || taskSymbols.includes(s.name));

		let fileTokens = 0;
		const symbolParts: string[] = [`// File: ${filePath}`];

		for (const sym of relevantSymbols) {
			if (totalTokens + fileTokens + sym.tokenEstimate > budget) break;
			symbolParts.push(formatSymbolAtLevel(sym, 2));
			fileTokens += sym.tokenEstimate;
			focalSymbols.push(sym.name);
		}

		if (symbolParts.length > 1) {
			contentParts.push(symbolParts.join('\n'));
			totalTokens += fileTokens;
			includedFiles.push({ filePath, level: 2, tokenEstimate: fileTokens });
		}
	}

	return totalTokens;
}

/**
 * Add dependency signatures at Level 1
 */
function addDependencyContext(
	focalFiles: string[],
	index: ReturnType<ReturnType<typeof getASTIndexService>['getIndex']>,
	budget: number,
	indexService: ReturnType<typeof getASTIndexService>,
	contentParts: string[],
	includedFiles: SmartContextResult['includedFiles'],
	totalTokens: number
): void {
	const dependencyFiles = getDependencyFiles(focalFiles, index);
	for (const filePath of dependencyFiles) {
		if (totalTokens >= budget * DEPENDENCY_BUDGET_RATIO) break;
		if (focalFiles.includes(filePath)) continue;

		const fileSymbols = indexService.lookupByFile(filePath);
		const exportedSymbols = fileSymbols.filter((s) => s.exported);
		if (exportedSymbols.length === 0) continue;

		let fileTokens = 0;
		const symbolParts: string[] = [`// File: ${filePath} (signatures only)`];

		for (const sym of exportedSymbols) {
			const sigTokens = estimateTokens(sym.signature);
			if (totalTokens + fileTokens + sigTokens > budget * DEPENDENCY_BUDGET_RATIO) break;
			symbolParts.push(formatSymbolAtLevel(sym, 1));
			fileTokens += sigTokens;
		}

		if (symbolParts.length > 1) {
			contentParts.push(symbolParts.join('\n'));
			totalTokens += fileTokens;
			includedFiles.push({ filePath, level: 1, tokenEstimate: fileTokens });
		}
	}
}

/**
 * Format a symbol at a given extraction level
 */
function formatSymbolAtLevel(sym: IndexedSymbol, level: ContextLevel): string {
	switch (level) {
		case 0:
			return `  ${sym.kind} ${sym.name}`;
		case 1:
			return sym.docComment ? `/** ${sym.docComment.split('\n')[0]} */\n${sym.signature}` : sym.signature;
		case 2:
		case 3:
			return sym.docComment
				? `/** ${sym.docComment} */\n${sym.signature} // lines ${sym.startLine}-${sym.endLine}`
				: `${sym.signature} // lines ${sym.startLine}-${sym.endLine}`;
	}
}

/**
 * Identify focal files from task description
 */
function identifyFocalFiles(
	task: string,
	index: ReturnType<ReturnType<typeof getASTIndexService>['getIndex']>
): string[] {
	const files: string[] = [];

	const filePathPattern = /(?:[\w-]+\/)*[\w-]+\.\w+/g;
	const matches = task.match(filePathPattern) ?? [];

	for (const match of matches) {
		if (index.files[match]) {
			files.push(match);
		}
	}

	const symbolResults = searchSymbols(task.split(/\s+/).filter((w) => w.length > MIN_WORD_LENGTH)[0] ?? '', {
		limit: FOCAL_SYMBOL_SEARCH_LIMIT
	});
	for (const result of symbolResults) {
		if (!files.includes(result.symbol.filePath)) {
			files.push(result.symbol.filePath);
		}
	}

	return files.slice(0, MAX_FOCAL_FILES);
}

/**
 * Identify symbol names mentioned in task text
 */
function identifyFocalSymbols(task: string): string[] {
	const identifiers = task.match(/\b[A-Z][a-zA-Z0-9]+\b/g) ?? [];
	return [...new Set(identifiers)];
}

/**
 * Get files that focal files depend on (via imports)
 */
function getDependencyFiles(
	focalFiles: string[],
	index: ReturnType<ReturnType<typeof getASTIndexService>['getIndex']>
): string[] {
	const deps = new Set<string>();

	for (const filePath of focalFiles) {
		const fileEntry = index.files[filePath];
		if (!fileEntry) continue;

		for (const imp of fileEntry.imports) {
			for (const indexedFilePath of Object.keys(index.files)) {
				if (indexedFilePath.includes(imp.source.replace(/^\.\//, ''))) {
					deps.add(indexedFilePath);
				}
			}
		}
	}

	return Array.from(deps);
}

/**
 * Context Deduplicator — tracks what was sent across pipeline stages
 */
export class ContextDeduplicator {
	private state: ContextDeduplicationState = {
		sentFiles: new Map(),
		sentSymbols: new Map()
	};

	getBackReference(symbolId: string): null | string {
		const entry = this.state.sentSymbols.get(symbolId);
		if (!entry) return null;
		const sym = getASTIndexService().getSymbol(symbolId);
		const name = sym?.name ?? symbolId;
		return `[Previously provided: ${name} — see stage "${entry.stage}"]`;
	}

	recordFileSent(filePath: string, stage: string, level: ContextLevel): void {
		this.state.sentFiles.set(filePath, { level, stage });
	}

	recordSymbolSent(symbolId: string, stage: string, level: ContextLevel): void {
		this.state.sentSymbols.set(symbolId, { level, stage });
	}

	reset(): void {
		this.state.sentFiles.clear();
		this.state.sentSymbols.clear();
	}

	wasFileSent(filePath: string, minLevel: ContextLevel): null | { level: ContextLevel; stage: string } {
		const entry = this.state.sentFiles.get(filePath);
		if (entry && entry.level >= minLevel) return entry;
		return null;
	}

	wasSymbolSent(symbolId: string, minLevel: ContextLevel): null | { level: ContextLevel; stage: string } {
		const entry = this.state.sentSymbols.get(symbolId);
		if (entry && entry.level >= minLevel) return entry;
		return null;
	}
}

/**
 * Singleton
 */
let deduplicatorInstance: ContextDeduplicator | null = null;

export function getContextDeduplicator(): ContextDeduplicator {
	deduplicatorInstance ??= new ContextDeduplicator();
	return deduplicatorInstance;
}

export function resetContextDeduplicator(): void {
	deduplicatorInstance = null;
}
