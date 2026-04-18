import { describe, expect, it } from 'vitest';

import { DocumentationRenderer } from 'analysis/documentation.renderer';
import type { CodebaseGraph } from 'analysis/analysis.types';

const GRAPH: CodebaseGraph = {
	generatedAt: new Date('2026-04-17'),
	modules: [
		{ name: 'ast', path: 'src/ast', dependsOn: ['utils'] },
		{ name: 'utils', path: 'src/utils', dependsOn: [] }
	],
	files: [
		{ path: 'src/ast/index.ts', module: 'ast', imports: ['src/ast/parser.ts'] },
		{ path: 'src/ast/parser.ts', module: 'ast', imports: [] }
	],
	symbols: [
		{ name: 'AstParser', kind: 'class', definedIn: 'src/ast/parser.ts', exported: true, usedIn: ['src/ast/index.ts'] }
	]
};

describe('DocumentationRenderer', () => {
	const renderer = new DocumentationRenderer();

	it('renders mermaid module dependency graph in index', () => {
		const output = renderer.render(GRAPH);
		expect(output.index).toContain('```mermaid');
		expect(output.index).toContain('ast --> utils');
	});

	it('index does not contain utils since it has no deps', () => {
		const output = renderer.render(GRAPH);
		expect(output.index).not.toContain('utils -->');
	});

	it('creates a module file for each module', () => {
		const output = renderer.render(GRAPH);
		expect(output.modules.has('ast')).toBe(true);
		expect(output.modules.has('utils')).toBe(true);
	});

	it('module file contains intra-module file graph', () => {
		const output = renderer.render(GRAPH);
		const astDoc = output.modules.get('ast')!;
		expect(astDoc).toContain('```mermaid');
		expect(astDoc).toContain('index --> parser');
	});

	it('module file contains symbol reference table', () => {
		const output = renderer.render(GRAPH);
		const astDoc = output.modules.get('ast')!;
		expect(astDoc).toContain('AstParser');
		expect(astDoc).toContain('class');
		expect(astDoc).toContain('index.ts');
	});

	it('index contains generated date', () => {
		const output = renderer.render(GRAPH);
		expect(output.index).toContain('2026-04-17');
	});
});
