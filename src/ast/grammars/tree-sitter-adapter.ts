/**
 * Web Tree-Sitter Adapter — web-tree-sitter implementation of the tree-sitter adapter
 *
 * This is a concrete implementation of TreeSitterAdapter using the web-tree-sitter
 * WASM-based parser library. The interfaces are defined separately to allow for
 * other implementations (native tree-sitter, mock parsers for testing, etc.)
 *
 * Benefits:
 * - Implements library-agnostic TreeSitterAdapter interface
 * - Can be swapped with other implementations without changing consumers
 * - Isolates all web-tree-sitter and tree-sitter-wasms dependencies to this file
 */

/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

import type { ASTLanguage } from 'ast/ast.types';

import { readFile } from 'fs/promises';
import { createRequire } from 'module';
import { join } from 'path';

import type { TreeSitterAdapter, TreeSitterLanguage, TreeSitterParser } from './tree-sitter-adapter.interface';

import { getGrammarWasmFile } from './language-map';

const require = createRequire(import.meta.url);

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/naming-convention
let ParserClass: any = null;
let initPromise: null | Promise<void> = null;
const languageCache = new Map<ASTLanguage, TreeSitterLanguage>();

/**
 * Resolve the path to WASM files from tree-sitter-wasms package
 */
function resolveWasmDir(): string {
	const wasmPkgPath = require.resolve('tree-sitter-wasms/package.json');
	return join(wasmPkgPath, '..', 'out');
}

/**
 * Initialise the web-tree-sitter parser (once, concurrency-safe)
 */
async function ensureParserInitialised(): Promise<void> {
	if (ParserClass) return;

	initPromise ??= (async () => {
		const mod = await import('web-tree-sitter');
		const cls = mod.default ?? mod;
		await cls.init();
		ParserClass = cls;
	})();

	await initPromise;
}

/**
 * Web Tree-Sitter Adapter Implementation
 *
 * Concrete implementation of TreeSitterAdapter using the web-tree-sitter WASM library.
 */
export class WebTreeSitterAdapter implements TreeSitterAdapter {
	/**
	 * Clear all cached grammars and reset parser state
	 */
	clearCache(): void {
		languageCache.clear();
		ParserClass = null;
		initPromise = null;
	}

	/**
	 * Create a new parser instance configured for a language
	 */
	async createParser(language: ASTLanguage): Promise<TreeSitterParser> {
		await ensureParserInitialised();

		const lang = await this.loadLanguage(language);
		const parser = new ParserClass() as TreeSitterParser;
		parser.setLanguage(lang);
		return parser;
	}

	/**
	 * Load a language grammar (cached after first load)
	 */
	async loadLanguage(language: ASTLanguage): Promise<TreeSitterLanguage> {
		const cached = languageCache.get(language);
		if (cached) return cached;

		await ensureParserInitialised();

		const wasmFile = getGrammarWasmFile(language);
		const wasmDir = resolveWasmDir();
		const wasmPath = join(wasmDir, wasmFile);

		const wasmBuffer = await readFile(wasmPath);
		const lang = (await ParserClass.Language.load(wasmBuffer)) as TreeSitterLanguage;
		languageCache.set(language, lang);
		return lang;
	}
}

/**
 * Default adapter instance factory
 * This is used by the getTreeSitterAdapter function in the interface
 */
export function createDefaultTreeSitterAdapter(): TreeSitterAdapter {
	return new WebTreeSitterAdapter();
}
