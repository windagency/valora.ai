/**
 * AST Types Tests
 *
 * Verifies type definitions and data structures for the AST module.
 */

import { describe, expect, it } from 'vitest';

import type {
	ASTLanguage,
	CodebaseIndex,
	CodebaseMapEntry,
	ContextDeduplicationState,
	ContextLevel,
	ContextSavingsMetrics,
	FileOutlineEntry,
	ImportInfo,
	IndexedFile,
	IndexedSymbol,
	IndexManifest,
	SmartContextOptions,
	SmartContextResult,
	SymbolKind,
	SymbolSearchResult
} from './ast.types';

describe('AST Types', () => {
	it('should define valid ASTLanguage values', () => {
		const languages: ASTLanguage[] = ['typescript', 'javascript', 'python', 'go', 'rust', 'java'];
		expect(languages).toHaveLength(6);
	});

	it('should define valid SymbolKind values', () => {
		const kinds: SymbolKind[] = ['function', 'class', 'interface', 'type', 'enum', 'method', 'variable', 'constant'];
		expect(kinds).toHaveLength(8);
	});

	it('should define valid ContextLevel values', () => {
		const levels: ContextLevel[] = [0, 1, 2, 3];
		expect(levels).toHaveLength(4);
	});

	it('should create a valid IndexedSymbol', () => {
		const sym: IndexedSymbol = {
			endLine: 10,
			exported: true,
			filePath: 'src/foo.ts',
			id: 'src/foo.ts#myFunc#function#1',
			kind: 'function',
			name: 'myFunc',
			references: ['Bar', 'Baz'],
			signature: 'export function myFunc(): void',
			startLine: 1,
			tokenEstimate: 50
		};
		expect(sym.id).toContain('myFunc');
		expect(sym.kind).toBe('function');
		expect(sym.exported).toBe(true);
	});

	it('should create a valid IndexedFile', () => {
		const file: IndexedFile = {
			contentHash: 'abc123',
			filePath: 'src/foo.ts',
			imports: [{ names: ['Bar'], source: './bar', typeOnly: false }],
			indexedAt: Date.now(),
			language: 'typescript',
			symbolIds: ['src/foo.ts#myFunc#function#1']
		};
		expect(file.language).toBe('typescript');
		expect(file.imports).toHaveLength(1);
	});

	it('should create a valid CodebaseIndex', () => {
		const index: CodebaseIndex = {
			fileIndex: { 'src/foo.ts': ['sym1'] },
			files: {},
			nameIndex: { myFunc: ['sym1'] },
			projectRoot: '/project',
			symbols: {},
			updatedAt: new Date().toISOString(),
			version: 1
		};
		expect(index.version).toBe(1);
		expect(index.nameIndex['myFunc']).toHaveLength(1);
	});

	it('should create a valid ImportInfo', () => {
		const imp: ImportInfo = {
			names: ['useState', 'useEffect'],
			source: 'react',
			typeOnly: false
		};
		expect(imp.names).toHaveLength(2);
		expect(imp.typeOnly).toBe(false);
	});

	it('should create a valid SymbolSearchResult', () => {
		const result: SymbolSearchResult = {
			matchType: 'exact',
			score: 100,
			symbol: {
				endLine: 5,
				exported: true,
				filePath: 'test.ts',
				id: 'test.ts#Test#class#1',
				kind: 'class',
				name: 'Test',
				references: [],
				signature: 'export class Test',
				startLine: 1,
				tokenEstimate: 20
			}
		};
		expect(result.matchType).toBe('exact');
		expect(result.score).toBe(100);
	});

	it('should create a valid FileOutlineEntry', () => {
		const entry: FileOutlineEntry = {
			children: [
				{
					endLine: 5,
					exported: false,
					kind: 'method',
					name: 'doThing',
					signature: 'doThing(): void',
					startLine: 3
				}
			],
			endLine: 10,
			exported: true,
			kind: 'class',
			name: 'MyClass',
			signature: 'export class MyClass',
			startLine: 1
		};
		expect(entry.children).toHaveLength(1);
		expect(entry.children![0]!.kind).toBe('method');
	});

	it('should create a valid SmartContextOptions', () => {
		const opts: SmartContextOptions = {
			budget: 10000,
			files: ['src/foo.ts'],
			mode: 'focused',
			task: 'Fix the bug in foo'
		};
		expect(opts.mode).toBe('focused');
	});

	it('should create a valid IndexManifest', () => {
		const manifest: IndexManifest = {
			fileCount: 100,
			projectRoot: '/project',
			shards: ['symbols-a.json', 'symbols-b.json'],
			symbolCount: 500,
			updatedAt: new Date().toISOString(),
			version: 1
		};
		expect(manifest.shards).toHaveLength(2);
	});

	it('should create a valid ContextSavingsMetrics', () => {
		const metrics: ContextSavingsMetrics = {
			contextSavingsPercent: 45,
			contextTokensAfter: 5500,
			contextTokensBefore: 10000,
			progressiveDisclosureCalls: 3
		};
		expect(metrics.contextSavingsPercent).toBe(45);
	});
});
