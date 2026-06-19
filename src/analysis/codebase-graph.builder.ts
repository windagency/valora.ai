import type { CodebaseGraph } from 'analysis/analysis.types';
import type { ASTIndexService } from 'ast/ast-index.service';

import { FileDependencyAnalyzer } from 'analysis/file-dependency.analyser';
import { ModuleDependencyAnalyzer } from 'analysis/module-dependency.analyser';
import { SymbolReferenceAnalyzer } from 'analysis/symbol-reference.analyser';

export class CodebaseGraphBuilder {
	constructor(
		private readonly astIndex: ASTIndexService,
		private readonly projectRoot: string,
		private readonly moduleDeps: ModuleDependencyAnalyzer = new ModuleDependencyAnalyzer(),
		private readonly fileDeps: FileDependencyAnalyzer = new FileDependencyAnalyzer(),
		private readonly symbolRefs: SymbolReferenceAnalyzer = new SymbolReferenceAnalyzer(null)
	) {}

	async build(options: { includeSymbols?: boolean } = {}): Promise<CodebaseGraph> {
		if (!this.astIndex.isBuilt()) await this.astIndex.buildIndex();

		const index = this.astIndex.getIndex();
		const modules = this.moduleDeps.analyze(index, this.projectRoot);
		const files = this.fileDeps.analyze(index, this.projectRoot);
		const symbols = options.includeSymbols !== false ? await this.symbolRefs.analyze(index, this.projectRoot) : [];

		return { files, generatedAt: new Date(), modules, symbols };
	}
}
