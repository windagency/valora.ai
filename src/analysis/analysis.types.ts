import type { SymbolKind } from 'ast/ast.types';

export interface CodebaseGraph {
	files: FileNode[];
	generatedAt: Date;
	modules: ModuleNode[];
	symbols: SymbolReference[];
}

export interface FileNode {
	imports: string[];
	module: string;
	path: string;
}

export interface ModuleNode {
	dependsOn: string[];
	name: string;
	path: string;
}

export interface SymbolReference {
	definedIn: string;
	exported: boolean;
	kind: SymbolKind;
	name: string;
	typeSignature?: string;
	usedIn: string[];
}
