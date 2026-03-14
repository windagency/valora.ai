/**
 * LSP Types Tests
 */

import { describe, expect, it } from 'vitest';

import type {
	CacheEntry,
	DefinitionResult,
	DiagnosticResult,
	HoverResult,
	JSONRPCNotification,
	JSONRPCRequest,
	JSONRPCResponse,
	LSPCacheOptions,
	LSPClientState,
	LSPLanguage,
	LSPLocation,
	LSPPosition,
	LSPRange,
	LSPServerConfig
} from './lsp.types';

describe('LSP Types', () => {
	it('should define valid LSPLanguage values', () => {
		const languages: LSPLanguage[] = ['typescript', 'javascript', 'python', 'go', 'rust'];
		expect(languages).toHaveLength(5);
	});

	it('should define valid LSPClientState values', () => {
		const states: LSPClientState[] = ['starting', 'ready', 'error', 'stopped'];
		expect(states).toHaveLength(4);
	});

	it('should create a valid LSPServerConfig', () => {
		const config: LSPServerConfig = {
			args: ['--stdio'],
			command: 'typescript-language-server',
			extensions: ['.ts', '.tsx'],
			languages: ['typescript', 'javascript']
		};
		expect(config.command).toBe('typescript-language-server');
		expect(config.languages).toHaveLength(2);
	});

	it('should create a valid LSPPosition', () => {
		const pos: LSPPosition = { character: 5, line: 10 };
		expect(pos.line).toBe(10);
		expect(pos.character).toBe(5);
	});

	it('should create a valid DefinitionResult', () => {
		const result: DefinitionResult = {
			display: 'src/foo.ts:42',
			location: {
				range: {
					end: { character: 10, line: 42 },
					start: { character: 0, line: 42 }
				},
				uri: 'file:///src/foo.ts'
			}
		};
		expect(result.display).toContain('foo.ts');
	});

	it('should create a valid HoverResult', () => {
		const result: HoverResult = {
			contents: '(method) MyClass.doThing(): void'
		};
		expect(result.contents).toContain('doThing');
	});

	it('should create a valid DiagnosticResult', () => {
		const result: DiagnosticResult = {
			diagnostics: [
				{
					code: 2322,
					message: "Type 'string' is not assignable to type 'number'",
					range: {
						end: { character: 20, line: 5 },
						start: { character: 0, line: 5 }
					},
					severity: 'error',
					source: 'ts'
				}
			],
			filePath: 'src/foo.ts'
		};
		expect(result.diagnostics).toHaveLength(1);
		expect(result.diagnostics[0]!.severity).toBe('error');
	});

	it('should create valid JSON-RPC messages', () => {
		const request: JSONRPCRequest = {
			id: 1,
			jsonrpc: '2.0',
			method: 'textDocument/definition',
			params: { textDocument: { uri: 'file:///foo.ts' } }
		};
		expect(request.jsonrpc).toBe('2.0');

		const response: JSONRPCResponse = {
			id: 1,
			jsonrpc: '2.0',
			result: { uri: 'file:///bar.ts' }
		};
		expect(response.id).toBe(1);

		const notification: JSONRPCNotification = {
			jsonrpc: '2.0',
			method: 'initialized',
			params: {}
		};
		expect(notification.method).toBe('initialized');
	});

	it('should create a valid CacheEntry', () => {
		const entry: CacheEntry<string> = {
			key: 'test-key',
			timestamp: Date.now(),
			value: 'cached-value'
		};
		expect(entry.key).toBe('test-key');
		expect(entry.value).toBe('cached-value');
	});

	it('should create valid LSPCacheOptions', () => {
		const opts: LSPCacheOptions = {
			maxEntries: 500,
			ttlMs: 30000
		};
		expect(opts.maxEntries).toBe(500);
	});
});
