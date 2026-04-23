import { describe, expect, it, vi } from 'vitest';

import { CodebaseGraphBuilder } from './codebase-graph.builder';
import type { FileDependencyAnalyser } from './file-dependency.analyser';
import type { ModuleDependencyAnalyser } from './module-dependency.analyser';
import type { SymbolReferenceAnalyser } from './symbol-reference.analyser';
import type { ASTIndexService } from 'ast/ast-index.service';
import type { CodebaseIndex } from 'ast/ast.types';

const EMPTY_INDEX: CodebaseIndex = {
	version: 1,
	projectRoot: '/proj',
	updatedAt: '',
	files: {},
	symbols: {},
	nameIndex: {},
	fileIndex: {}
};

function makeMocks() {
	const astIndex = {
		isBuilt: vi.fn().mockReturnValue(true),
		buildIndex: vi.fn(),
		getIndex: vi.fn().mockReturnValue(EMPTY_INDEX)
	} as unknown as ASTIndexService;
	const modDeps = {
		analyse: vi.fn().mockReturnValue([{ name: 'ast', path: 'src/ast', dependsOn: [] }])
	} as unknown as ModuleDependencyAnalyser;
	const fileDeps = {
		analyse: vi.fn().mockReturnValue([{ path: 'src/ast/a.ts', module: 'ast', imports: [] }])
	} as unknown as FileDependencyAnalyser;
	const symRefs = { analyse: vi.fn().mockResolvedValue([]) } as unknown as SymbolReferenceAnalyser;
	return { astIndex, modDeps, fileDeps, symRefs };
}

describe('CodebaseGraphBuilder', () => {
	it('assembles graph from all three analysers', async () => {
		const { astIndex, modDeps, fileDeps, symRefs } = makeMocks();
		const builder = new CodebaseGraphBuilder(astIndex, '/proj', modDeps, fileDeps, symRefs);

		const graph = await builder.build();

		expect(graph.modules).toHaveLength(1);
		expect(graph.files).toHaveLength(1);
		expect(graph.symbols).toHaveLength(0);
		expect(graph.generatedAt).toBeInstanceOf(Date);
	});

	it('builds AST index when not yet built', async () => {
		const { astIndex, modDeps, fileDeps, symRefs } = makeMocks();
		vi.mocked(astIndex.isBuilt).mockReturnValue(false);
		const builder = new CodebaseGraphBuilder(astIndex, '/proj', modDeps, fileDeps, symRefs);

		await builder.build();

		expect(astIndex.buildIndex).toHaveBeenCalledOnce();
	});

	it('skips symbol analysis when includeSymbols is false', async () => {
		const { astIndex, modDeps, fileDeps, symRefs } = makeMocks();
		const builder = new CodebaseGraphBuilder(astIndex, '/proj', modDeps, fileDeps, symRefs);

		const graph = await builder.build({ includeSymbols: false });

		expect(symRefs.analyse).not.toHaveBeenCalled();
		expect(graph.symbols).toHaveLength(0);
	});
});
