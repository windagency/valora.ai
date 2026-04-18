import type { LSPToolsService } from 'lsp/lsp-tools.service';

import * as path from 'path';

import type { SymbolReference } from 'analysis/analysis.types';
import type { CodebaseIndex } from 'ast/ast.types';

import { findReferences } from 'ast/ast-query.service';

export class SymbolReferenceAnalyser {
	constructor(private readonly lsp: LSPToolsService | null) {}

	async analyse(index: CodebaseIndex, projectRoot: string): Promise<SymbolReference[]> {
		const refs: SymbolReference[] = [];

		for (const symbol of Object.values(index.symbols)) {
			if (!symbol.exported) continue;

			const found = findReferences(symbol.name);
			const usedIn = [...new Set(found.map((r) => r.filePath).filter((f) => f !== symbol.filePath))].sort();

			let typeSignature: string | undefined;
			if (this.lsp) {
				try {
					typeSignature = await this.lsp.executeGetTypeInfo({
						character: 0,
						file: path.resolve(projectRoot, symbol.filePath),
						line: symbol.startLine - 1
					});
				} catch {
					// LSP unavailable — skip type enrichment
				}
			}

			refs.push({
				definedIn: symbol.filePath,
				exported: symbol.exported,
				kind: symbol.kind,
				name: symbol.name,
				typeSignature,
				usedIn
			});
		}

		return refs.sort((a, b) => a.name.localeCompare(b.name));
	}
}
