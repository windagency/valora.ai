import { describe, expect, it } from 'vitest';

import { ModuleDependencyAnalyser } from './module-dependency.analyser';
import type { CodebaseIndex } from 'ast/ast.types';

function makeIndex(files: Record<string, string[]>): CodebaseIndex {
	const indexFiles: CodebaseIndex['files'] = {};
	for (const [filePath, importSources] of Object.entries(files)) {
		indexFiles[filePath] = {
			filePath,
			language: 'typescript',
			contentHash: 'abc',
			indexedAt: 0,
			imports: importSources.map((source) => ({ source, names: [], typeOnly: false })),
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

describe('ModuleDependencyAnalyser', () => {
	const analyser = new ModuleDependencyAnalyser();

	it('detects cross-module alias import', () => {
		const index = makeIndex({
			'src/cli/index.ts': ['executor/pipeline']
		});
		const modules = analyser.analyse(index, '/proj');
		const cli = modules.find((m) => m.name === 'cli');
		expect(cli?.dependsOn).toContain('executor');
	});

	it('ignores same-module imports', () => {
		const index = makeIndex({
			'src/ast/ast-index.service.ts': ['ast/ast-parser.service']
		});
		const modules = analyser.analyse(index, '/proj');
		const ast = modules.find((m) => m.name === 'ast');
		expect(ast?.dependsOn).toHaveLength(0);
	});

	it('resolves relative cross-module imports', () => {
		const index = makeIndex({
			'src/cli/commands/map.ts': ['../../../executor/pipeline']
		});
		const modules = analyser.analyse(index, '/proj');
		const cli = modules.find((m) => m.name === 'cli');
		expect(cli?.dependsOn).toContain('executor');
	});

	it('ignores external packages', () => {
		const index = makeIndex({
			'src/ast/ast-parser.service.ts': ['vitest', 'path', 'web-tree-sitter']
		});
		const modules = analyser.analyse(index, '/proj');
		const ast = modules.find((m) => m.name === 'ast');
		expect(ast?.dependsOn).toHaveLength(0);
	});

	it('returns module path as src/<name>', () => {
		const index = makeIndex({ 'src/ast/ast-index.service.ts': [] });
		const modules = analyser.analyse(index, '/proj');
		expect(modules[0]?.path).toBe('src/ast');
	});
});
