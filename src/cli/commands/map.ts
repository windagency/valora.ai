/**
 * Map command for generating AST-based codebase documentation
 */

import { getLSPToolsService } from 'lsp/lsp-tools.service';

import type { CommandAdapter } from 'cli/command-adapter.interface';

import { CodebaseGraphBuilder } from 'analysis/codebase-graph.builder';
import { DocumentationRenderer } from 'analysis/documentation.renderer';
import { DocumentationService } from 'analysis/documentation.service';
import { SymbolReferenceAnalyzer } from 'analysis/symbol-reference.analyser';
import { getASTIndexService } from 'ast/ast-index.service';
import { InputValidator } from 'utils/input-validator';

interface MapOptions extends Record<string, unknown> {
	module?: string;
	outputDir?: string;
	symbols?: boolean;
}

export function configureMapCommand(program: CommandAdapter): void {
	program
		.command('map')
		.description('Generate AST-based codebase map to documentation/generated/')
		// Named --output-dir, not --output: a global `--output <format>`
		// option (choices markdown/json/yaml) is registered on the root
		// program, and silently wins over a same-named subcommand-local
		// option — a real path here always errored "Allowed choices are
		// markdown, json, yaml" before this action handler ever ran,
		// live-verified against the actual CLI.
		.option('--output-dir <path>', 'Output directory', 'documentation/generated')
		.option('--module <name>', 'Limit analysis to a single module')
		.option('--no-symbols', 'Skip symbol-level analysis')
		.action(async (options: MapOptions) => {
			const projectRoot = process.cwd();

			let outputDir: string;
			try {
				outputDir = InputValidator.validatePath(options.outputDir ?? 'documentation/generated', projectRoot);
			} catch (error) {
				console.error('Invalid --output-dir path:', (error as Error).message);
				process.exit(1);
				return;
			}

			const astIndex = getASTIndexService(projectRoot);
			const lsp = getLSPToolsService(projectRoot);
			const symbolRefs = new SymbolReferenceAnalyzer(lsp);
			const builder = new CodebaseGraphBuilder(astIndex, projectRoot, undefined, undefined, symbolRefs);
			const service = new DocumentationService(builder, new DocumentationRenderer(), outputDir);

			await service.generate({ includeSymbols: options.symbols !== false });
			process.exit(0);
		});
}
