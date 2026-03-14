/**
 * Language Map
 *
 * Maps file extensions to AST languages and provides tree-sitter
 * query patterns for each language.
 */

import type { ASTLanguage } from 'ast/ast.types';

/**
 * Map file extensions to AST languages
 */
const EXTENSION_MAP: Record<string, ASTLanguage> = {
	'.cjs': 'javascript',
	'.cts': 'typescript',
	'.go': 'go',
	'.java': 'java',
	'.js': 'javascript',
	'.jsx': 'javascript',
	'.mjs': 'javascript',
	'.mts': 'typescript',
	'.py': 'python',
	'.rs': 'rust',
	'.ts': 'typescript',
	'.tsx': 'typescript'
};

/**
 * tree-sitter WASM grammar file names from tree-sitter-wasms package
 */
const GRAMMAR_WASM_MAP: Record<ASTLanguage, string> = {
	go: 'tree-sitter-go.wasm',
	java: 'tree-sitter-java.wasm',
	javascript: 'tree-sitter-javascript.wasm',
	python: 'tree-sitter-python.wasm',
	rust: 'tree-sitter-rust.wasm',
	typescript: 'tree-sitter-typescript.wasm'
};

/**
 * Get the AST language for a file extension
 */
export function getLanguageForExtension(ext: string): ASTLanguage | null {
	return EXTENSION_MAP[ext.toLowerCase()] ?? null;
}

/**
 * Get the WASM grammar filename for a language
 */
export function getGrammarWasmFile(language: ASTLanguage): string {
	return GRAMMAR_WASM_MAP[language];
}

/**
 * Get all supported file extensions
 */
export function getSupportedExtensions(): string[] {
	return Object.keys(EXTENSION_MAP);
}

/**
 * Check if a file extension is supported
 */
export function isSupportedExtension(ext: string): boolean {
	return ext.toLowerCase() in EXTENSION_MAP;
}

/**
 * Get all supported languages
 */
export function getSupportedLanguages(): ASTLanguage[] {
	return [...new Set(Object.values(EXTENSION_MAP))];
}
