import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DocumentationService } from './documentation.service';
import { DocumentationRenderer } from './documentation.renderer';
import type { CodebaseGraphBuilder } from './codebase-graph.builder';
import type { CodebaseGraph } from './analysis.types';

const FIXED_DATE = new Date('2024-01-15T00:00:00.000Z');

function makeGraph(overrides: Partial<CodebaseGraph> = {}): CodebaseGraph {
	return {
		modules: [{ name: 'ast', path: 'src/ast', dependsOn: [] }],
		files: [],
		symbols: [],
		generatedAt: FIXED_DATE,
		...overrides
	};
}

function makeBuilder(graph: CodebaseGraph): CodebaseGraphBuilder {
	return { build: vi.fn().mockResolvedValue(graph) } as unknown as CodebaseGraphBuilder;
}

describe('DocumentationService', () => {
	let workingDir: string;

	beforeEach(() => {
		workingDir = mkdtempSync(join(tmpdir(), 'valora-doc-test-'));
	});

	afterEach(() => {
		rmSync(workingDir, { recursive: true, force: true });
	});

	it('creates output directory and writes index.md with module dependency section', async () => {
		const graph = makeGraph();
		const service = new DocumentationService(makeBuilder(graph), new DocumentationRenderer(), workingDir);

		await service.generate();

		const index = readFileSync(join(workingDir, 'index.md'), 'utf-8');
		expect(index).toContain('# Codebase Map');
		expect(index).toContain('## Module Dependencies');
		expect(index).toContain('```mermaid');
	});

	it('writes one markdown file per module named after the module', async () => {
		const graph = makeGraph();
		const service = new DocumentationService(makeBuilder(graph), new DocumentationRenderer(), workingDir);

		await service.generate();

		const astContent = readFileSync(join(workingDir, 'ast.md'), 'utf-8');
		expect(astContent).toContain('# Module: `ast`');
	});

	it('writes the generated date into index.md based on the graph timestamp', async () => {
		const graph = makeGraph({ generatedAt: new Date('2024-06-20T00:00:00.000Z') });
		const service = new DocumentationService(makeBuilder(graph), new DocumentationRenderer(), workingDir);

		await service.generate();

		const index = readFileSync(join(workingDir, 'index.md'), 'utf-8');
		expect(index).toContain('2024-06-20');
	});

	it('passes includeSymbols option through to the builder and reflects it in generated output', async () => {
		const graph = makeGraph({
			symbols: [],
			files: [{ path: 'src/ast/parser.ts', module: 'ast', imports: [] }]
		});
		const builder = makeBuilder(graph);
		const service = new DocumentationService(builder, new DocumentationRenderer(), workingDir);

		await service.generate({ includeSymbols: false });

		// The builder was called with the right option
		expect(vi.mocked(builder.build)).toHaveBeenCalledWith({ includeSymbols: false });
		// The output was still written to disk
		expect(readFileSync(join(workingDir, 'index.md'), 'utf-8')).toContain('# Codebase Map');
	});
});
