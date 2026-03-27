/**
 * Grammar Loader
 *
 * Public API for loading tree-sitter grammars and creating parsers.
 * Delegates to the TreeSitterAdapter for actual parsing operations.
 *
 * Consumers should import from this module rather than the adapter directly.
 */

import type { ASTLanguage } from 'ast/ast.types';

import { getTreeSitterAdapter, type TreeSitterLanguage, type TreeSitterParser } from './tree-sitter-adapter.interface';

/**
 * Load a tree-sitter language grammar (cached)
 */
export async function loadLanguage(language: ASTLanguage): Promise<TreeSitterLanguage> {
	return getTreeSitterAdapter().loadLanguage(language);
}

/**
 * Create a new parser instance configured for a language
 */
export async function createParser(language: ASTLanguage): Promise<TreeSitterParser> {
	return getTreeSitterAdapter().createParser(language);
}

/**
 * Clear cached grammars (for testing)
 */
export function clearGrammarCache(): void {
	getTreeSitterAdapter().clearCache();
}
