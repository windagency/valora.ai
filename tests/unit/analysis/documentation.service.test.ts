import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('fs');
import * as fs from 'fs';

import { DocumentationService } from 'analysis/documentation.service';
import type { CodebaseGraphBuilder } from 'analysis/codebase-graph.builder';
import type { DocumentationRenderer } from 'analysis/documentation.renderer';
import type { CodebaseGraph } from 'analysis/analysis.types';

const EMPTY_GRAPH: CodebaseGraph = {
	modules: [{ name: 'ast', path: 'src/ast', dependsOn: [] }],
	files: [],
	symbols: [],
	generatedAt: new Date()
};

function makeMocks() {
	const builder = { build: vi.fn().mockResolvedValue(EMPTY_GRAPH) } as unknown as CodebaseGraphBuilder;
	const renderer = {
		render: vi.fn().mockReturnValue({ index: '# index', modules: new Map([['ast', '# ast']]) })
	} as unknown as DocumentationRenderer;
	return { builder, renderer };
}

describe('DocumentationService', () => {
	beforeEach(() => vi.clearAllMocks());

	it('creates output directory recursively', async () => {
		const { builder, renderer } = makeMocks();
		const service = new DocumentationService(builder, renderer, '/out');
		await service.generate();
		expect(fs.mkdirSync).toHaveBeenCalledWith('/out', { recursive: true });
	});

	it('writes index.md', async () => {
		const { builder, renderer } = makeMocks();
		const service = new DocumentationService(builder, renderer, '/out');
		await service.generate();
		expect(fs.writeFileSync).toHaveBeenCalledWith('/out/index.md', '# index', 'utf-8');
	});

	it('writes one file per module', async () => {
		const { builder, renderer } = makeMocks();
		const service = new DocumentationService(builder, renderer, '/out');
		await service.generate();
		expect(fs.writeFileSync).toHaveBeenCalledWith('/out/ast.md', '# ast', 'utf-8');
	});

	it('passes includeSymbols option to builder', async () => {
		const { builder, renderer } = makeMocks();
		const service = new DocumentationService(builder, renderer, '/out');
		await service.generate({ includeSymbols: false });
		expect(builder.build).toHaveBeenCalledWith({ includeSymbols: false });
	});
});
