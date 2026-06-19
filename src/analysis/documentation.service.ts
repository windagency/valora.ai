import * as fs from 'fs';
import * as path from 'path';

import type { CodebaseGraphBuilder } from 'analysis/codebase-graph.builder';
import type { DocumentationRenderer } from 'analysis/documentation.renderer';

export class DocumentationService {
	constructor(
		private readonly graphBuilder: CodebaseGraphBuilder,
		private readonly renderer: DocumentationRenderer,
		private readonly outputDir: string
	) {}

	async generate(options: { includeSymbols?: boolean } = {}): Promise<void> {
		fs.mkdirSync(this.outputDir, { recursive: true });

		const graph = await this.graphBuilder.build(options);
		const output = this.renderer.render(graph);

		fs.writeFileSync(path.join(this.outputDir, 'index.md'), output.index, 'utf-8');
		for (const [moduleName, content] of output.modules) {
			fs.writeFileSync(path.join(this.outputDir, `${moduleName}.md`), content, 'utf-8');
		}
	}
}
