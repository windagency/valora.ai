/**
 * Map command for generating AST-based codebase documentation
 */

import { getLSPToolsService } from 'lsp/lsp-tools.service';
import * as path from 'path';

import type { CommandAdapter } from 'cli/command-adapter.interface';

import { CodebaseGraphBuilder } from 'analysis/codebase-graph.builder';
import { DocumentationRenderer } from 'analysis/documentation.renderer';
import { DocumentationService } from 'analysis/documentation.service';
import { SymbolReferenceAnalyzer } from 'analysis/symbol-reference.analyser';
import { getASTIndexService } from 'ast/ast-index.service';

interface MapOptions extends Record<string, unknown> {
	module?: string;
	output?: string;
	symbols?: boolean;
}

export function configureMapCommand(program: CommandAdapter): void {
	program
		.command('map')
		.description('Generate AST-based codebase map to documentation/generated/')
		.option('--output <path>', 'Output directory', 'documentation/generated')
		.option('--module <name>', 'Limit analysis to a single module')
		.option('--no-symbols', 'Skip symbol-level analysis')
		.action(async (options: MapOptions) => {
			const projectRoot = process.cwd();
			const astIndex = getASTIndexService(projectRoot);
			const lsp = getLSPToolsService(projectRoot);
			const symbolRefs = new SymbolReferenceAnalyzer(lsp);
			const builder = new CodebaseGraphBuilder(astIndex, projectRoot, undefined, undefined, symbolRefs);
			const outputDir = path.resolve(projectRoot, options.output ?? 'documentation/generated');
			const service = new DocumentationService(builder, new DocumentationRenderer(), outputDir);

			await service.generate({ includeSymbols: options.symbols !== false });
			process.exit(0);
		});
}
