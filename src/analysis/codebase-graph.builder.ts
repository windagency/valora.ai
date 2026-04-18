import type { CodebaseGraph } from 'analysis/analysis.types';
import type { ASTIndexService } from 'ast/ast-index.service';

import { FileDependencyAnalyser } from 'analysis/file-dependency.analyser';
import { ModuleDependencyAnalyser } from 'analysis/module-dependency.analyser';
import { SymbolReferenceAnalyser } from 'analysis/symbol-reference.analyser';

export class CodebaseGraphBuilder {
	constructor(
		private readonly astIndex: ASTIndexService,
		private readonly projectRoot: string,
		private readonly moduleDeps: ModuleDependencyAnalyser = new ModuleDependencyAnalyser(),
		private readonly fileDeps: FileDependencyAnalyser = new FileDependencyAnalyser(),
		private readonly symbolRefs: SymbolReferenceAnalyser = new SymbolReferenceAnalyser(null)
	) {}

	async build(options: { includeSymbols?: boolean } = {}): Promise<CodebaseGraph> {
		if (!this.astIndex.isBuilt()) await this.astIndex.buildIndex();

		const index = this.astIndex.getIndex();
		const modules = this.moduleDeps.analyse(index, this.projectRoot);
		const files = this.fileDeps.analyse(index, this.projectRoot);
		const symbols = options.includeSymbols !== false ? await this.symbolRefs.analyse(index, this.projectRoot) : [];

		return { files, generatedAt: new Date(), modules, symbols };
	}
}
