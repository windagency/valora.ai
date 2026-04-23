import { describe, expect, it } from 'vitest';

import { FileDependencyAnalyser } from './file-dependency.analyser';
import type { CodebaseIndex } from 'ast/ast.types';

function makeIndex(files: Record<string, { imports: string[] }>): CodebaseIndex {
	const indexFiles: CodebaseIndex['files'] = {};
	for (const [fp, { imports }] of Object.entries(files)) {
		indexFiles[fp] = {
			filePath: fp,
			language: 'typescript',
			contentHash: 'x',
			indexedAt: 0,
			imports: imports.map((source) => ({ source, names: [], typeOnly: false })),
			symbolIds: []
		};
	}
	return {
		version: 1,
		projectRoot: '/proj',
		updatedAt: '',
		files: indexFiles,
		symbols: {},
		nameIndex: {},
		fileIndex: {}
	};
}

describe('FileDependencyAnalyser', () => {
	const analyser = new FileDependencyAnalyser();

	it('resolves alias import to file path', () => {
		const index = makeIndex({
			'src/ast/ast-index.service.ts': { imports: ['ast/ast-parser.service'] },
			'src/ast/ast-parser.service.ts': { imports: [] }
		});
		const nodes = analyser.analyse(index, '/proj');
		const node = nodes.find((n) => n.path === 'src/ast/ast-index.service.ts');
		expect(node?.imports).toContain('src/ast/ast-parser.service.ts');
	});

	it('resolves relative import to file path', () => {
		const index = makeIndex({
			'src/ast/ast-index.service.ts': { imports: ['./ast-parser.service'] },
			'src/ast/ast-parser.service.ts': { imports: [] }
		});
		const nodes = analyser.analyse(index, '/proj');
		const node = nodes.find((n) => n.path === 'src/ast/ast-index.service.ts');
		expect(node?.imports).toContain('src/ast/ast-parser.service.ts');
	});

	it('ignores external imports not in index', () => {
		const index = makeIndex({
			'src/ast/ast-parser.service.ts': { imports: ['web-tree-sitter', 'path'] }
		});
		const nodes = analyser.analyse(index, '/proj');
		const node = nodes.find((n) => n.path === 'src/ast/ast-parser.service.ts');
		expect(node?.imports).toHaveLength(0);
	});

	it('deduplicates imports', () => {
		const index = makeIndex({
			'src/ast/a.ts': { imports: ['ast/b', 'ast/b'] },
			'src/ast/b.ts': { imports: [] }
		});
		const nodes = analyser.analyse(index, '/proj');
		const node = nodes.find((n) => n.path === 'src/ast/a.ts');
		expect(node?.imports).toHaveLength(1);
	});

	it('sets module name from src/<module>/ directory', () => {
		const index = makeIndex({ 'src/executor/pipeline.ts': { imports: [] } });
		const nodes = analyser.analyse(index, '/proj');
		expect(nodes[0]?.module).toBe('executor');
	});
});
