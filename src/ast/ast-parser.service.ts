/**
 * AST Parser Service
 *
 * Wraps tree-sitter to parse source files and extract symbols, imports,
 * and structural information.
 *
 * Tree-sitter nodes are dynamically typed through WASM — ESLint unsafe
 * rules are suppressed where node property access is unavoidable.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */

import { createHash } from 'crypto';
import { extname } from 'path';

import type { ASTLanguage, ImportInfo, IndexedSymbol, SymbolKind } from './ast.types';

import { createParser } from './grammars/grammar-loader';
import { getLanguageForExtension } from './grammars/language-map';

/** Approximate number of characters per token for rough estimation */
export const CHARS_PER_TOKEN = 4;

/**
 * Result of parsing a single file
 */
export interface ParseResult {
	contentHash: string;
	imports: ImportInfo[];
	language: ASTLanguage;
	symbols: IndexedSymbol[];
}

/**
 * Estimate tokens from text (rough: ~4 chars per token)
 */
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Generate a symbol ID
 */
function makeSymbolId(filePath: string, name: string, kind: SymbolKind, line: number): string {
	return `${filePath}#${name}#${kind}#${line}`;
}

/**
 * Parse a source file and extract symbols and imports
 */
export async function parseFile(filePath: string, content: string): Promise<null | ParseResult> {
	const ext = extname(filePath);
	const language = getLanguageForExtension(ext);
	if (!language) return null;

	const contentHash = createHash('sha256').update(content).digest('hex');

	try {
		const parser = await createParser(language);
		const tree = parser.parse(content);
		if (!tree) return { contentHash, imports: [], language, symbols: [] };
		const rootNode = tree.rootNode;

		const symbols = extractSymbols(rootNode, filePath, language, content);
		const imports = extractImports(rootNode, language, content);

		return { contentHash, imports, language, symbols };
	} catch {
		// If parsing fails, return empty result rather than crashing
		return { contentHash, imports: [], language, symbols: [] };
	}
}

/**
 * Compute content hash without full parse
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TSNode = any;

export function computeContentHash(content: string): string {
	return createHash('sha256').update(content).digest('hex');
}

/**
 * Extract symbols from the AST root node
 */
function extractSymbols(rootNode: TSNode, filePath: string, language: ASTLanguage, content: string): IndexedSymbol[] {
	const symbols: IndexedSymbol[] = [];
	const lines = content.split('\n');
	const visitedNodes = new Set<number>();

	visitNode(rootNode, null);

	function visitNode(node: TSNode, parentId: null | string): void {
		const nodeId = node.id as number;
		if (visitedNodes.has(nodeId)) return;
		visitedNodes.add(nodeId);

		const nodeType = node.type as string;

		// For export_statement nodes in TS/JS, mark the inner declaration as visited
		if ((language === 'typescript' || language === 'javascript') && nodeType === 'export_statement') {
			markExportDeclarationVisited(node, visitedNodes);
		}

		const extracted = extractSymbolFromNode(node, filePath, language, lines, parentId);
		if (extracted) {
			symbols.push(extracted);
			visitChildren(node, nodeType, extracted.id, visitNode);
		} else {
			for (let i = 0; i < node.childCount; i++) {
				visitNode(node.child(i), parentId);
			}
		}
	}

	return symbols;
}

/**
 * Mark export_statement's declaration child as visited to prevent duplicates
 */
function markExportDeclarationVisited(node: TSNode, visitedNodes: Set<number>): void {
	const decl = node.childForFieldName?.('declaration');
	if (decl) {
		visitedNodes.add(decl.id as number);
	}
}

/**
 * Visit children of an extracted symbol node
 */
function visitChildren(
	node: TSNode,
	nodeType: string,
	parentId: string,
	visitNode: (node: TSNode, parentId: null | string) => void
): void {
	if (nodeType === 'export_statement') {
		// Traverse the inner declaration's children directly
		const decl = node.childForFieldName?.('declaration');
		if (decl) {
			for (let i = 0; i < decl.childCount; i++) {
				visitNode(decl.child(i), parentId);
			}
		}
	} else {
		for (let i = 0; i < node.childCount; i++) {
			visitNode(node.child(i), parentId);
		}
	}
}

/**
 * Extract a symbol from a single AST node
 */
interface ExtractedSymbolInfo {
	exported: boolean;
	kind: SymbolKind;
	name: string;
}

function extractSymbolFromNode(
	node: TSNode,
	filePath: string,
	language: ASTLanguage,
	lines: string[],
	parentId: null | string
): IndexedSymbol | null {
	const nodeType = node.type as string;
	const startLine = (node.startPosition.row as number) + 1;
	const endLine = (node.endPosition.row as number) + 1;

	const result = extractLanguageSymbol(node, nodeType, language, lines, startLine);
	if (!result) return null;

	const id = makeSymbolId(filePath, result.name, result.kind, startLine);
	const signatureLine = lines[startLine - 1]?.trim() ?? '';
	const bodyText = lines.slice(startLine - 1, endLine).join('\n');
	const references = extractReferences(bodyText);
	const docComment = extractDocComment(lines, startLine - 2);

	return {
		docComment: docComment ?? undefined,
		endLine,
		exported: result.exported,
		filePath,
		id,
		kind: result.kind,
		name: result.name,
		parentId: parentId ?? undefined,
		references,
		signature: signatureLine,
		startLine,
		tokenEstimate: estimateTokens(bodyText)
	};
}

/**
 * Dispatch to language-specific symbol extractor
 */
function extractLanguageSymbol(
	node: TSNode,
	nodeType: string,
	language: ASTLanguage,
	lines: string[],
	startLine: number
): ExtractedSymbolInfo | null {
	switch (language) {
		case 'go':
			return extractGoSymbol(node, nodeType);
		case 'java':
			return extractJavaSymbol(node, nodeType);
		case 'javascript':
		case 'typescript':
			return extractTSSymbol(node, nodeType, lines, startLine);
		case 'python':
			return extractPythonSymbol(node, nodeType);
		case 'rust':
			return extractRustSymbol(node, nodeType);
		default:
			return null;
	}
}

function extractTSExportStatement(node: TSNode, lines: string[], startLine: number): ExtractedSymbolInfo | null {
	const decl = node.childForFieldName?.('declaration');
	if (!decl) return null;
	const result = extractTSSymbol(decl, decl.type, lines, startLine);
	return result ? { ...result, exported: true } : null;
}

/**
 * Extract TypeScript/JavaScript symbol info
 */
function extractTSSymbol(
	node: TSNode,
	nodeType: string,
	lines: string[],
	startLine: number
): ExtractedSymbolInfo | null {
	const nameNode = node.childForFieldName?.('name');
	const lineText = lines[startLine - 1] ?? '';
	const isExported = lineText.trimStart().startsWith('export');

	const kindForType = tsNodeKindMap(nodeType);
	if (kindForType) return nameFromNode(nameNode, kindForType, isExported);

	switch (nodeType) {
		case 'export_statement':
			return extractTSExportStatement(node, lines, startLine);
		case 'lexical_declaration':
		case 'variable_declaration':
			return extractTSVariableDecl(node, isExported);
		case 'method_definition':
			return nameFromNode(nameNode, 'method', false);
		default:
			return null;
	}
}

function extractTSVariableDecl(node: TSNode, isExported: boolean): ExtractedSymbolInfo | null {
	const declarator = findChild(node, 'variable_declarator');
	if (!declarator) return null;

	const n = declarator.childForFieldName?.('name')?.text as string | undefined;
	if (!n) return null;

	return { exported: isExported, kind: inferVariableKind(declarator, n), name: n };
}

/**
 * Infer the symbol kind for a variable declarator based on its value
 */
function inferVariableKind(declarator: TSNode, name: string): SymbolKind {
	const value = declarator.childForFieldName?.('value');
	const valueType = value?.type as string | undefined;
	if (valueType === 'arrow_function' || valueType === 'function') return 'function';
	if (name === name.toUpperCase() && name.length > 1) return 'constant';
	return 'variable';
}

function nameFromNode(nameNode: TSNode, kind: SymbolKind, exported: boolean): ExtractedSymbolInfo | null {
	const n = nameNode?.text as string | undefined;
	return n ? { exported, kind, name: n } : null;
}

/**
 * Map TS/JS node types to symbol kinds for simple named declarations
 */
const TS_NODE_KIND_MAP: Record<string, SymbolKind> = {
	class_declaration: 'class',
	enum_declaration: 'enum',
	function: 'function',
	function_declaration: 'function',
	interface_declaration: 'interface',
	type_alias_declaration: 'type'
};

function tsNodeKindMap(nodeType: string): null | SymbolKind {
	return TS_NODE_KIND_MAP[nodeType] ?? null;
}

/**
 * Extract Python symbol info
 */
function extractPythonSymbol(node: TSNode, nodeType: string): ExtractedSymbolInfo | null {
	const nameNode = node.childForFieldName?.('name');

	switch (nodeType) {
		case 'class_definition': {
			const n = nameNode?.text as string | undefined;
			if (n) return { exported: !n.startsWith('_'), kind: 'class', name: n };
			break;
		}
		case 'function_definition': {
			const n = nameNode?.text as string | undefined;
			if (n) return { exported: !n.startsWith('_'), kind: 'function', name: n };
			break;
		}
	}

	return null;
}

/**
 * Extract Go symbol info
 */
function extractGoSymbol(node: TSNode, nodeType: string): ExtractedSymbolInfo | null {
	const nameNode = node.childForFieldName?.('name');

	switch (nodeType) {
		case 'function_declaration':
			return goNamedSymbol(nameNode, 'function');
		case 'method_declaration':
			return goNamedSymbol(nameNode, 'method');
		case 'type_declaration':
			return extractGoTypeDecl(node);
		default:
			return null;
	}
}

function extractGoTypeDecl(node: TSNode): ExtractedSymbolInfo | null {
	const spec = findChild(node, 'type_spec');
	if (!spec) return null;
	const n = spec.childForFieldName?.('name')?.text as string | undefined;
	if (!n) return null;
	const isExported = n[0] === (n[0] as string | undefined)?.toUpperCase();
	const typeNode = spec.childForFieldName?.('type');
	const kind: SymbolKind = typeNode?.type === 'struct_type' ? 'class' : 'type';
	return { exported: isExported, kind, name: n };
}

function goNamedSymbol(nameNode: TSNode, kind: SymbolKind): ExtractedSymbolInfo | null {
	const n = nameNode?.text as string | undefined;
	if (!n) return null;
	const isExported = n[0] === (n[0] as string | undefined)?.toUpperCase();
	return { exported: isExported, kind, name: n };
}

/**
 * Extract Rust symbol info
 */
const RUST_NODE_KIND_MAP: Record<string, SymbolKind> = {
	enum_item: 'enum',
	function_item: 'function',
	struct_item: 'class',
	trait_item: 'interface',
	type_item: 'type'
};

function extractRustSymbol(node: TSNode, nodeType: string): ExtractedSymbolInfo | null {
	const kind = RUST_NODE_KIND_MAP[nodeType];
	if (!kind) return null;

	const nameNode = node.childForFieldName?.('name');
	const nodeText = node.text as string;
	const isPub = nodeText.trimStart().startsWith('pub');

	return nameFromNode(nameNode, kind, isPub);
}

/**
 * Extract Java symbol info
 */
const JAVA_NODE_KIND_MAP: Record<string, SymbolKind> = {
	class_declaration: 'class',
	enum_declaration: 'enum',
	interface_declaration: 'interface',
	method_declaration: 'method'
};

function extractJavaSymbol(node: TSNode, nodeType: string): ExtractedSymbolInfo | null {
	const kind = JAVA_NODE_KIND_MAP[nodeType];
	if (!kind) return null;

	const nameNode = node.childForFieldName?.('name');
	const isPublic = hasModifier(node, 'public');

	return nameFromNode(nameNode, kind, isPublic);
}

/**
 * Check if a Java node has a specific modifier
 */
function hasModifier(node: TSNode, modifier: string): boolean {
	for (let i = 0; i < node.childCount; i++) {
		const child = node.child(i);
		if (child?.type === 'modifiers') {
			return (child.text as string).includes(modifier);
		}
	}
	return false;
}

/**
 * Find a child node of a specific type
 */
function findChild(node: TSNode, type: string): null | TSNode {
	for (let i = 0; i < node.childCount; i++) {
		const child = node.child(i);
		if (child?.type === type) return child;
	}
	return null;
}

/**
 * Extract referenced symbol names from body text
 */
function extractReferences(bodyText: string): string[] {
	const identifierPattern = /\b([A-Z][a-zA-Z0-9]*)\b/g;
	const refs = new Set<string>();
	let match: null | RegExpExecArray;
	while ((match = identifierPattern.exec(bodyText)) !== null) {
		if (match[1]) {
			refs.add(match[1]);
		}
	}
	return Array.from(refs);
}

/**
 * Extract doc comment above a symbol
 */
function extractDocComment(lines: string[], lineIndex: number): null | string {
	if (lineIndex < 0) return null;

	const commentLines: string[] = [];
	let i = lineIndex;

	while (i >= 0) {
		const line = lines[i]?.trim() ?? '';
		if (isCommentLine(line)) {
			commentLines.unshift(line);
			i--;
		} else if (line === '') {
			if (commentLines.length > 0) break;
			i--;
		} else {
			break;
		}
	}

	if (commentLines.length === 0) return null;

	return commentLines
		.map((l) =>
			l
				.replace(/^\/\*\*\s?/, '')
				.replace(/^\*\/\s?$/, '')
				.replace(/^\*\s?/, '')
				.replace(/^\/\/\s?/, '')
				.replace(/^#\s?/, '')
				.trim()
		)
		.filter(Boolean)
		.join('\n');
}

function isCommentLine(line: string): boolean {
	return (
		line.startsWith('*') ||
		line.startsWith('/**') ||
		line.startsWith('*/') ||
		line.startsWith('//') ||
		line.startsWith('#')
	);
}

/**
 * Extract imports from AST
 */
const IMPORT_EXTRACTORS: Record<string, (content: string) => ImportInfo[]> = {
	go: extractGoImports,
	java: extractJavaImports,
	javascript: extractTSImports,
	python: extractPythonImports,
	rust: extractRustImports,
	typescript: extractTSImports
};

function extractImports(_rootNode: TSNode, language: ASTLanguage, content: string): ImportInfo[] {
	const extractor = IMPORT_EXTRACTORS[language];
	return extractor ? extractor(content) : [];
}

/**
 * Extract TypeScript/JavaScript imports using regex
 */
function extractTSImports(content: string): ImportInfo[] {
	const imports: ImportInfo[] = [];

	const namedImportRe = /import\s+(?:type\s+)?{([^}]*)}\s+from\s+['"]([^'"]+)['"]/g;
	let match: null | RegExpExecArray;
	while ((match = namedImportRe.exec(content)) !== null) {
		const names = (match[1] ?? '')
			.split(',')
			.map((n) => n.trim().split(/\s+as\s+/)[0] ?? '')
			.filter(Boolean);
		const typeOnly = content.substring(match.index, match.index + match[0].length).includes('import type');
		imports.push({ names, source: match[2] ?? '', typeOnly });
	}

	const defaultImportRe = /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;
	while ((match = defaultImportRe.exec(content)) !== null) {
		imports.push({ names: [match[1] ?? ''], source: match[2] ?? '', typeOnly: false });
	}

	const nsImportRe = /import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;
	while ((match = nsImportRe.exec(content)) !== null) {
		imports.push({ names: [`* as ${match[1] ?? ''}`], source: match[2] ?? '', typeOnly: false });
	}

	return imports;
}

/**
 * Extract Python imports
 */
function extractPythonImports(content: string): ImportInfo[] {
	const imports: ImportInfo[] = [];

	const fromImportRe = /from\s+([\w.]+)\s+import\s+(.+)/g;
	let match: null | RegExpExecArray;
	while ((match = fromImportRe.exec(content)) !== null) {
		const names = (match[2] ?? '')
			.split(',')
			.map((n) => n.trim().split(/\s+as\s+/)[0] ?? '')
			.filter(Boolean);
		imports.push({ names, source: match[1] ?? '', typeOnly: false });
	}

	const importRe = /^import\s+([\w.,\s]+)/gm;
	while ((match = importRe.exec(content)) !== null) {
		const names = (match[1] ?? '')
			.split(',')
			.map((n) => n.trim().split(/\s+as\s+/)[0] ?? '')
			.filter(Boolean);
		imports.push({ names, source: names[0] ?? '', typeOnly: false });
	}

	return imports;
}

/**
 * Extract Go imports
 */
function extractGoImports(content: string): ImportInfo[] {
	const imports: ImportInfo[] = [];

	const singleRe = /import\s+"([^"]+)"/g;
	let match: null | RegExpExecArray;
	while ((match = singleRe.exec(content)) !== null) {
		const source = match[1] ?? '';
		const name = source.split('/').pop() ?? source;
		imports.push({ names: [name], source, typeOnly: false });
	}

	const groupRe = /import\s*\(([\s\S]*?)\)/g;
	while ((match = groupRe.exec(content)) !== null) {
		const block = match[1] ?? '';
		const lineRe = /(?:(\w+)\s+)?"([^"]+)"/g;
		let lineMatch: null | RegExpExecArray;
		while ((lineMatch = lineRe.exec(block)) !== null) {
			const source = lineMatch[2] ?? '';
			const alias = lineMatch[1] ?? source.split('/').pop() ?? source;
			imports.push({ names: [alias], source, typeOnly: false });
		}
	}

	return imports;
}

/**
 * Extract Rust imports
 */
function extractRustImports(content: string): ImportInfo[] {
	const imports: ImportInfo[] = [];
	const useRe = /use\s+([\w:]+)(?:::\{([^}]+)\})?/g;
	let match: null | RegExpExecArray;
	while ((match = useRe.exec(content)) !== null) {
		const source = match[1] ?? '';
		const names = match[2]
			? match[2]
					.split(',')
					.map((n) => n.trim())
					.filter(Boolean)
			: [source.split('::').pop() ?? source];
		imports.push({ names, source, typeOnly: false });
	}
	return imports;
}

/**
 * Extract Java imports
 */
function extractJavaImports(content: string): ImportInfo[] {
	const imports: ImportInfo[] = [];
	const importRe = /import\s+(?:static\s+)?([\w.]+(?:\.\*)?);/g;
	let match: null | RegExpExecArray;
	while ((match = importRe.exec(content)) !== null) {
		const source = match[1] ?? '';
		const name = source.split('.').pop() ?? source;
		imports.push({ names: [name], source, typeOnly: false });
	}
	return imports;
}
