import * as path from 'path';

import type { ModuleNode } from 'analysis/analysis.types';
import type { CodebaseIndex } from 'ast/ast.types';

export class ModuleDependencyAnalyser {
	analyse(index: CodebaseIndex, projectRoot: string): ModuleNode[] {
		const moduleFiles = this.groupFilesByModule(index);
		const modules: ModuleNode[] = [];

		for (const [moduleName, files] of moduleFiles) {
			const dependsOn = new Set<string>();

			for (const filePath of files) {
				const file = index.files[filePath];
				if (!file) continue;
				for (const imp of file.imports) {
					const target = this.resolveModule(imp.source, filePath, projectRoot);
					if (target && target !== moduleName) dependsOn.add(target);
				}
			}

			modules.push({ dependsOn: [...dependsOn].sort(), name: moduleName, path: `src/${moduleName}` });
		}

		return modules.sort((a, b) => a.name.localeCompare(b.name));
	}

	private groupFilesByModule(index: CodebaseIndex): Map<string, string[]> {
		const map = new Map<string, string[]>();
		for (const filePath of Object.keys(index.files)) {
			const mod = this.moduleOf(filePath);
			if (!mod) continue;
			if (!map.has(mod)) map.set(mod, []);
			map.get(mod)!.push(filePath);
		}
		return map;
	}

	private moduleOf(filePath: string): null | string {
		const parts = filePath.replace(/\\/g, '/').split('/');
		const idx = parts.indexOf('src');
		return idx !== -1 && idx + 1 < parts.length ? (parts[idx + 1] ?? null) : null;
	}

	/**
	 * Resolves an import source to a top-level src module name.
	 *
	 * Rules:
	 * - Relative imports (start with `.`): resolved against the file's directory,
	 *   then the first non-`..` segment of the path relative to `src/` is the module name.
	 * - Alias imports (no `.` prefix, not `@`-scoped, contains `/`): the first
	 *   path segment is the module name (e.g. `executor/pipeline` → `executor`).
	 * - Bare package names (no `/`) and scoped packages (`@scope/pkg`) are
	 *   treated as external and return `null`.
	 */
	private resolveModule(source: string, fromFile: string, projectRoot: string): null | string {
		if (source.startsWith('.')) {
			const fromDir = path.dirname(path.resolve(projectRoot, fromFile));
			const resolved = path.resolve(fromDir, source).replace(/\\/g, '/');
			const rel = path.relative(path.join(projectRoot, 'src'), resolved).replace(/\\/g, '/');
			// Strip leading `../` segments to find the target module name
			const parts = rel.split('/');
			const first = parts.find((p) => p !== '..');
			return first ?? null;
		}

		// Scoped packages (@scope/pkg) are always external
		if (source.startsWith('@')) return null;

		// Bare names (no `/`) are external packages (vitest, path, web-tree-sitter, …)
		const slashIdx = source.indexOf('/');
		if (slashIdx === -1) return null;

		// Alias import: first segment is the module name
		return source.slice(0, slashIdx);
	}
}
