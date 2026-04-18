import * as path from 'path';

import type { CodebaseGraph, FileNode, ModuleNode, SymbolReference } from 'analysis/analysis.types';

export interface RenderedOutput {
	index: string;
	modules: Map<string, string>;
}

export class DocumentationRenderer {
	render(graph: CodebaseGraph): RenderedOutput {
		return {
			index: this.renderIndex(graph),
			modules: this.renderModules(graph)
		};
	}

	private fileGraphLines(files: FileNode[]): string[] {
		const fileSet = new Set(files.map((f) => f.path));
		const lines = ['graph LR'];
		for (const file of files) {
			const from = this.nodeId(path.basename(file.path, '.ts'));
			for (const imp of file.imports.filter((i) => fileSet.has(i))) {
				lines.push(`  ${from} --> ${this.nodeId(path.basename(imp, '.ts'))}`);
			}
		}
		if (lines.length === 1) lines.push('  %% no internal dependencies');
		return lines;
	}

	private moduleGraphLines(modules: ModuleNode[]): string[] {
		const lines = ['graph LR'];
		for (const mod of modules) {
			for (const dep of mod.dependsOn) lines.push(`  ${mod.name} --> ${dep}`);
		}
		if (lines.length === 1) lines.push('  %% no dependencies');
		return lines;
	}

	private nodeId(label: string): string {
		return label.replace(/[^a-zA-Z0-9]/g, '_');
	}

	private renderIndex(graph: CodebaseGraph): string {
		const date = graph.generatedAt.toISOString().split('T')[0];
		const lines = ['# Codebase Map', '', `_Generated: ${date}_`, '', '## Module Dependencies', '', '```mermaid'];
		lines.push(...this.moduleGraphLines(graph.modules));
		lines.push('```', '');
		return lines.join('\n');
	}

	private renderModule(name: string, files: FileNode[], symbols: SymbolReference[], date: Date): string {
		const d = date.toISOString().split('T')[0];
		const sections = [`# Module: \`${name}\``, '', `_Generated: ${d}_`, ''];

		if (files.length > 0) {
			sections.push('## File Dependencies', '', '```mermaid');
			sections.push(...this.fileGraphLines(files));
			sections.push('```', '');
		}

		if (symbols.length > 0) {
			sections.push('## Symbol References', '', this.symbolTable(symbols), '');
		}

		return sections.join('\n');
	}

	private renderModules(graph: CodebaseGraph): Map<string, string> {
		const result = new Map<string, string>();
		const moduleNames = [...new Set(graph.modules.map((m) => m.name))];

		for (const name of moduleNames) {
			const files = graph.files.filter((f) => f.module === name);
			const symbols = graph.symbols.filter((s) => s.definedIn.includes(`/${name}/`));
			result.set(name, this.renderModule(name, files, symbols, graph.generatedAt));
		}

		return result;
	}

	private symbolTable(symbols: SymbolReference[]): string {
		const header = '| Symbol | Kind | Defined in | Used in |';
		const sep = '|--------|------|------------|---------|';
		const rows = symbols.map((s) => {
			const usedIn = s.usedIn.map((f) => path.basename(f)).join(', ') || '—';
			return `| ${s.name} | ${s.kind} | ${path.basename(s.definedIn)} | ${usedIn} |`;
		});
		return [header, sep, ...rows].join('\n');
	}
}
