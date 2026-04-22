import { describe, expect, it, vi, beforeEach } from 'vitest';

import { SymbolReferenceAnalyser } from 'analysis/symbol-reference.analyser';
import type { CodebaseIndex, IndexedSymbol } from 'ast/ast.types';

vi.mock('ast/ast-query.service', () => ({
	findReferences: vi.fn()
}));

import { findReferences } from 'ast/ast-query.service';
const mockFindRefs = vi.mocked(findReferences);

function makeSymbol(overrides: Partial<IndexedSymbol> = {}): IndexedSymbol {
	return {
		id: 'sym1',
		name: 'MyService',
		kind: 'class',
		filePath: 'src/ast/my.service.ts',
		startLine: 10,
		endLine: 50,
		signature: 'class MyService',
		exported: true,
		references: [],
		tokenEstimate: 100,
		...overrides
	};
}

function makeIndex(symbols: IndexedSymbol[]): CodebaseIndex {
	return {
		version: 1,
		projectRoot: '/proj',
		updatedAt: '',
		files: {},
		symbols: Object.fromEntries(symbols.map((s) => [s.id, s])),
		nameIndex: {},
		fileIndex: {}
	};
}

describe('SymbolReferenceAnalyser', () => {
	let analyser: SymbolReferenceAnalyser;

	beforeEach(() => {
		vi.clearAllMocks();
		analyser = new SymbolReferenceAnalyser(null);
	});

	it('maps exported symbol with its reference files', async () => {
		const sym = makeSymbol();
		mockFindRefs.mockReturnValue([
			{ filePath: 'src/cli/index.ts', line: 5, symbolId: 'sym1', symbolName: 'MyService' },
			{ filePath: 'src/di/container.ts', line: 20, symbolId: 'sym1', symbolName: 'MyService' }
		]);

		const refs = await analyser.analyse(makeIndex([sym]), '/proj');

		expect(refs).toHaveLength(1);
		expect(refs[0]!.name).toBe('MyService');
		expect(refs[0]!.usedIn).toEqual(['src/cli/index.ts', 'src/di/container.ts']);
	});

	it('excludes the definition file from usedIn', async () => {
		const sym = makeSymbol();
		mockFindRefs.mockReturnValue([
			{ filePath: 'src/ast/my.service.ts', line: 10, symbolId: 'sym1', symbolName: 'MyService' },
			{ filePath: 'src/cli/index.ts', line: 5, symbolId: 'sym1', symbolName: 'MyService' }
		]);

		const refs = await analyser.analyse(makeIndex([sym]), '/proj');
		expect(refs[0]!.usedIn).not.toContain('src/ast/my.service.ts');
	});

	it('skips non-exported symbols', async () => {
		const sym = makeSymbol({ exported: false });
		const refs = await analyser.analyse(makeIndex([sym]), '/proj');
		expect(refs).toHaveLength(0);
	});

	it('degrades gracefully when LSP is unavailable', async () => {
		const mockLsp = { executeGetTypeInfo: vi.fn().mockRejectedValue(new Error('LSP offline')) };
		const analyserWithLsp = new SymbolReferenceAnalyser(mockLsp as never);
		const sym = makeSymbol();
		mockFindRefs.mockReturnValue([]);

		const refs = await analyserWithLsp.analyse(makeIndex([sym]), '/proj');
		expect(refs[0]!.typeSignature).toBeUndefined();
	});

	it('attaches typeSignature from LSP when available', async () => {
		const mockLsp = { executeGetTypeInfo: vi.fn().mockResolvedValue('class MyService {}') };
		const analyserWithLsp = new SymbolReferenceAnalyser(mockLsp as never);
		const sym = makeSymbol();
		mockFindRefs.mockReturnValue([]);

		const refs = await analyserWithLsp.analyse(makeIndex([sym]), '/proj');
		expect(refs[0]!.typeSignature).toBe('class MyService {}');
	});
});
