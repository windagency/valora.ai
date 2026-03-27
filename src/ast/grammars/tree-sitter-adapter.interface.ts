/**
 * Tree-Sitter Adapter Interface
 *
 * Library-agnostic interface for tree-sitter parsing operations.
 * Implementations can use web-tree-sitter, native tree-sitter, or any compatible parser.
 *
 * This separation allows:
 * - Multiple adapter implementations without coupling
 * - Easy testing with mock adapters
 * - Library migration without changing consumer code
 */

import type { ASTLanguage } from 'ast/ast.types';

import { createDefaultTreeSitterAdapter } from './tree-sitter-adapter';

/**
 * Opaque handle to a loaded language grammar
 */
export type TreeSitterLanguage = unknown;

/**
 * A syntax tree node returned by parsing
 */
export type TreeSitterNode = unknown;

/**
 * A parsed syntax tree
 */
export interface TreeSitterTree {
	readonly rootNode: TreeSitterNode;
}

/**
 * A configured parser instance that can parse source code
 */
export interface TreeSitterParser {
	parse(content: string): null | TreeSitterTree;
	setLanguage(language: TreeSitterLanguage): void;
}

/**
 * Tree-Sitter Adapter Interface
 *
 * Defines the contract for tree-sitter parsing implementations.
 * All parsing operations should go through this interface.
 */
export interface TreeSitterAdapter {
	/**
	 * Clear all cached grammars and reset parser state (for testing)
	 */
	clearCache(): void;

	/**
	 * Create a new parser instance configured for a language
	 *
	 * @param language - The language to configure the parser for
	 * @returns A configured parser instance
	 */
	createParser(language: ASTLanguage): Promise<TreeSitterParser>;

	/**
	 * Load a language grammar (cached after first load)
	 *
	 * @param language - The language to load
	 * @returns The loaded language grammar handle
	 */
	loadLanguage(language: ASTLanguage): Promise<TreeSitterLanguage>;
}

/**
 * Singleton instance
 */
let adapterInstance: null | TreeSitterAdapter = null;

/**
 * Get the singleton TreeSitterAdapter instance
 *
 * @returns TreeSitterAdapter instance
 *
 * @example
 * import { getTreeSitterAdapter } from 'ast/grammars/tree-sitter-adapter.interface';
 *
 * const adapter = getTreeSitterAdapter();
 * const parser = await adapter.createParser('typescript');
 * const tree = parser.parse(sourceCode);
 */
export function getTreeSitterAdapter(): TreeSitterAdapter {
	adapterInstance ??= createDefaultTreeSitterAdapter();
	return adapterInstance;
}

/**
 * Set a custom TreeSitterAdapter implementation
 * Useful for testing or switching to different parsing libraries
 *
 * @param adapter - The adapter instance to use
 */
export function setTreeSitterAdapter(adapter: TreeSitterAdapter): void {
	adapterInstance = adapter;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetTreeSitterAdapter(): void {
	adapterInstance = null;
}
