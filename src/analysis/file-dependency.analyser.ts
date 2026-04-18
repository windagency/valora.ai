import * as path from 'path';

import type { FileNode } from 'analysis/analysis.types';
import type { CodebaseIndex } from 'ast/ast.types';

export class FileDependencyAnalyser {
	analyse(index: CodebaseIndex, projectRoot: string): FileNode[] {
		const allPaths = new Set(Object.keys(index.files));
		const nodes: FileNode[] = [];

		for (const [filePath, file] of Object.entries(index.files)) {
			const mod = this.moduleOf(filePath);
			if (!mod) continue;

			const imports = new Set<string>();
			for (const imp of file.imports) {
				const resolved = this.resolve(imp.source, filePath, allPaths, projectRoot);
				if (resolved) imports.add(resolved);
			}

			nodes.push({ imports: [...imports].sort(), module: mod, path: filePath });
		}

		return nodes.sort((a, b) => a.path.localeCompare(b.path));
	}

	private moduleOf(filePath: string): null | string {
		const parts = filePath.replace(/\\/g, '/').split('/');
		const idx = parts.indexOf('src');
		return idx !== -1 && idx + 1 < parts.length ? (parts[idx + 1] ?? null) : null;
	}

	private resolve(source: string, fromFile: string, allPaths: Set<string>, projectRoot: string): null | string {
		const candidates: string[] = [];

		if (source.startsWith('.')) {
			const dir = path.dirname(path.resolve(projectRoot, fromFile));
			const base = path.resolve(dir, source);
			const rel = (p: string): string => path.relative(projectRoot, p).replace(/\\/g, '/');
			candidates.push(rel(base), rel(base + '.ts'), rel(path.join(base, 'index.ts')));
		} else {
			candidates.push(`src/${source}`, `src/${source}.ts`, `src/${source}/index.ts`);
		}

		return candidates.find((c) => allPaths.has(c)) ?? null;
	}
}
