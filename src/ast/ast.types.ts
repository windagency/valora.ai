/**
 * AST Code Intelligence Type Definitions
 *
 * Core types for the AST-based codebase index, symbol extraction,
 * and smart context system.
 */

/**
 * Supported languages for AST parsing
 */
export type ASTLanguage = 'go' | 'java' | 'javascript' | 'python' | 'rust' | 'typescript';

/**
 * Symbol kinds extracted from AST
 */
export type SymbolKind = 'class' | 'constant' | 'enum' | 'function' | 'interface' | 'method' | 'type' | 'variable';

/**
 * Context extraction levels for token reduction
 */
export type ContextLevel = 0 | 1 | 2 | 3;

/**
 * Import information extracted from a file
 */
export interface ImportInfo {
	names: string[];
	source: string;
	typeOnly: boolean;
}

/**
 * A symbol extracted from AST parsing
 */
export interface IndexedSymbol {
	/** Unique ID: filePath#name#kind#line */
	id: string;
	/** Symbol name */
	name: string;
	/** Symbol kind (function, class, etc.) */
	kind: SymbolKind;
	/** File path relative to project root */
	filePath: string;
	/** Start line (1-based) */
	startLine: number;
	/** End line (1-based) */
	endLine: number;
	/** Declaration signature (not body) */
	signature: string;
	/** Whether the symbol is exported */
	exported: boolean;
	/** JSDoc or doc comment content */
	docComment?: string;
	/** Parent symbol ID (for methods inside classes) */
	parentId?: string;
	/** Symbol names referenced in body */
	references: string[];
	/** Estimated token count for the symbol body */
	tokenEstimate: number;
}

/**
 * A file's index entry
 */
export interface IndexedFile {
	/** File path relative to project root */
	filePath: string;
	/** Detected language */
	language: ASTLanguage;
	/** SHA-256 content hash for incremental updates */
	contentHash: string;
	/** Timestamp of last indexing */
	indexedAt: number;
	/** Extracted imports */
	imports: ImportInfo[];
	/** IDs of symbols defined in this file */
	symbolIds: string[];
}

/**
 * The complete codebase index
 */
export interface CodebaseIndex {
	/** Schema version for migration */
	version: number;
	/** Absolute path to project root */
	projectRoot: string;
	/** ISO 8601 timestamp of last update */
	updatedAt: string;
	/** Files indexed, keyed by relative path */
	files: Record<string, IndexedFile>;
	/** All symbols, keyed by symbol ID */
	symbols: Record<string, IndexedSymbol>;
	/** Symbol name -> symbol IDs (for name-based lookup) */
	nameIndex: Record<string, string[]>;
	/** File path -> symbol IDs (for file-based lookup) */
	fileIndex: Record<string, string[]>;
}

/**
 * Result of a symbol search query
 */
export interface SymbolSearchResult {
	matchType: 'contains' | 'exact' | 'fuzzy' | 'prefix';
	score: number;
	symbol: IndexedSymbol;
}

/**
 * File outline entry (structured view of a file)
 */
export interface FileOutlineEntry {
	children?: FileOutlineEntry[];
	endLine: number;
	exported: boolean;
	kind: SymbolKind;
	name: string;
	signature: string;
	startLine: number;
}

/**
 * Smart context request options
 */
export interface SmartContextOptions {
	/** Task description for relevance scoring */
	task: string;
	/** Specific files to focus on */
	files?: string[];
	/** Token budget (default: model context - system - output reserve) */
	budget?: number;
	/** Context mode */
	mode?: 'broad' | 'focused';
}

/**
 * Smart context result
 */
export interface SmartContextResult {
	/** The assembled context string */
	content: string;
	/** Total estimated tokens */
	tokenEstimate: number;
	/** Files included and their extraction levels */
	includedFiles: Array<{ filePath: string; level: ContextLevel; tokenEstimate: number }>;
	/** Symbols included at full body level */
	focalSymbols: string[];
}

/**
 * Codebase map entry for compact overview
 */
export interface CodebaseMapEntry {
	/** Directory path */
	directory: string;
	/** Files in this directory */
	files: Array<{
		description: string;
		lineCount: number;
		name: string;
		symbols: Array<{ exported: boolean; kind: SymbolKind; name: string }>;
	}>;
}

/**
 * Index manifest for persistence
 */
export interface IndexManifest {
	fileCount: number;
	projectRoot: string;
	shards: string[];
	symbolCount: number;
	updatedAt: string;
	version: number;
}

/**
 * Context deduplication tracking
 */
export interface ContextDeduplicationState {
	/** Symbols sent at full level, keyed by symbol ID */
	sentSymbols: Map<string, { level: ContextLevel; stage: string }>;
	/** Files sent, keyed by file path */
	sentFiles: Map<string, { level: ContextLevel; stage: string }>;
}

/**
 * Context savings metrics
 */
export interface ContextSavingsMetrics {
	contextSavingsPercent: number;
	contextTokensAfter: number;
	contextTokensBefore: number;
	progressiveDisclosureCalls: number;
}
