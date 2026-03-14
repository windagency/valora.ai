/**
 * LSP Type Definitions
 *
 * Types for the Language Server Protocol integration layer.
 */

/**
 * Supported LSP language servers
 */
export type LSPLanguage = 'go' | 'javascript' | 'python' | 'rust' | 'typescript';

/**
 * LSP server configuration
 */
export interface LSPServerConfig {
	/** Language(s) this server handles */
	languages: LSPLanguage[];
	/** Command to start the server */
	command: string;
	/** Command arguments */
	args: string[];
	/** File extensions this server handles */
	extensions: string[];
	/** Environment variables to set */
	env?: Record<string, string>;
	/** Initialization options to send */
	initializationOptions?: Record<string, unknown>;
}

/**
 * State of an LSP client connection
 */
export type LSPClientState = 'error' | 'ready' | 'starting' | 'stopped';

/**
 * LSP position (0-based line/character as per LSP spec)
 */
export interface LSPPosition {
	character: number;
	line: number;
}

/**
 * LSP range
 */
export interface LSPRange {
	end: LSPPosition;
	start: LSPPosition;
}

/**
 * LSP location (file + range)
 */
export interface LSPLocation {
	range: LSPRange;
	uri: string;
}

/**
 * Result from goto_definition
 */
export interface DefinitionResult {
	/** Where the symbol is defined */
	location: LSPLocation;
	/** Formatted display string */
	display: string;
}

/**
 * Result from get_type_info / hover_info
 */
export interface HoverResult {
	/** Type signature or hover contents */
	contents: string;
	/** Range of the hovered symbol */
	range?: LSPRange;
}

/**
 * Result from get_diagnostics
 */
export interface DiagnosticResult {
	diagnostics: Array<{
		code?: number | string;
		message: string;
		range: LSPRange;
		severity: 'error' | 'hint' | 'information' | 'warning';
		source?: string;
	}>;
	filePath: string;
}

/**
 * LSP JSON-RPC message types
 */
export interface JSONRPCNotification {
	jsonrpc: '2.0';
	method: string;
	params?: unknown;
}

export interface JSONRPCRequest {
	id: number;
	jsonrpc: '2.0';
	method: string;
	params?: unknown;
}

export interface JSONRPCResponse {
	error?: {
		code: number;
		data?: unknown;
		message: string;
	};
	id: number;
	jsonrpc: '2.0';
	result?: unknown;
}

/**
 * LRU cache entry
 */
export interface CacheEntry<T> {
	key: string;
	timestamp: number;
	value: T;
}

/**
 * LSP result cache options
 */
export interface LSPCacheOptions {
	maxEntries: number;
	ttlMs: number;
}
