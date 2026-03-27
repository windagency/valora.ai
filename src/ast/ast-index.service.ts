/**
 * AST Index Service
 *
 * Builds, persists, loads, and queries the codebase symbol index.
 * Uses sharded persistence to avoid loading the entire index for queries.
 */

import { exec } from 'child_process';
import { type Dirent, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { readFile as readFileAsync } from 'fs/promises';
import { extname, join, relative } from 'path';
import { promisify } from 'util';

import type { CodebaseIndex, IndexedFile, IndexedSymbol, IndexManifest } from './ast.types';

import { computeContentHash, parseFile } from './ast-parser.service';
import { isSupportedExtension } from './grammars/language-map';

const execAsync = promisify(exec);

/** Maximum buffer size for exec commands (10 MB) */
const MAX_EXEC_BUFFER = 10 * 1024 * 1024;

/** Current index schema version */
const INDEX_VERSION = 1;

/** Maximum files to index (safety limit) */
const MAX_FILES = 50_000;

/** Number of files indexed concurrently per batch */
const INDEX_BATCH_SIZE = 100;

/** Directories always excluded from indexing */
export const EXCLUDED_DIRS = new Set([
	'.cache',
	'.git',
	'.next',
	'.output',
	'.valora',
	'__pycache__',
	'build',
	'coverage',
	'dist',
	'node_modules',
	'target',
	'vendor'
]);

/**
 * AST Index Service — singleton that manages the codebase index
 */
export class ASTIndexService {
	private building = false;
	private built = false;
	private index: CodebaseIndex;
	private readonly indexDir: string;
	private readonly projectRoot: string;

	constructor(projectRoot: string) {
		this.projectRoot = projectRoot;
		this.indexDir = join(projectRoot, '.valora', 'index');
		this.index = this.createEmptyIndex();
	}

	/**
	 * Check if the index has been built
	 */
	isBuilt(): boolean {
		return this.built;
	}

	/**
	 * Check if the index is currently building
	 */
	isBuilding(): boolean {
		return this.building;
	}

	/**
	 * Get the current index (may be empty if not built)
	 */
	getIndex(): CodebaseIndex {
		return this.index;
	}

	/**
	 * Build the index from scratch
	 */
	async buildIndex(): Promise<CodebaseIndex> {
		if (this.building) return this.index;
		this.building = true;

		try {
			const filePaths = await this.discoverFiles();
			await this.indexFiles(filePaths);
			this.index.updatedAt = new Date().toISOString();
			this.persistIndex();
			this.built = true;
			return this.index;
		} finally {
			this.building = false;
		}
	}

	/**
	 * Incremental update: re-index only changed files
	 */
	async incrementalUpdate(changedFiles?: string[]): Promise<number> {
		const files = changedFiles ?? (await this.getChangedFiles());
		if (files.length === 0) return 0;

		let updatedCount = 0;
		for (const filePath of files) {
			const relPath = relative(
				this.projectRoot,
				filePath.startsWith('/') ? filePath : join(this.projectRoot, filePath)
			);
			const absPath = join(this.projectRoot, relPath);

			if (!existsSync(absPath)) {
				// File was deleted — remove from index
				this.removeFileFromIndex(relPath);
				updatedCount++;
				continue;
			}

			try {
				const content = await readFileAsync(absPath, 'utf-8');
				const hash = computeContentHash(content);

				// Skip if unchanged
				const existing = this.index.files[relPath];
				if (existing?.contentHash === hash) continue;

				// Re-parse
				await this.indexSingleFile(relPath, content);
				updatedCount++;
			} catch {
				// Skip unreadable files
			}
		}

		if (updatedCount > 0) {
			this.index.updatedAt = new Date().toISOString();
			this.persistIndex();
		}

		return updatedCount;
	}

	/**
	 * Load a previously persisted index from disk
	 */
	loadIndex(): boolean {
		const manifestPath = join(this.indexDir, 'manifest.json');
		if (!existsSync(manifestPath)) return false;

		try {
			const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as IndexManifest;
			if (manifest.version !== INDEX_VERSION) return false;

			// Load files
			const filesPath = join(this.indexDir, 'files.json');
			if (existsSync(filesPath)) {
				this.index.files = JSON.parse(readFileSync(filesPath, 'utf-8')) as Record<string, IndexedFile>;
			}

			// Load symbol shards
			this.index.symbols = {};
			this.index.nameIndex = {};
			this.index.fileIndex = {};

			for (const shardFile of manifest.shards) {
				const shardPath = join(this.indexDir, shardFile);
				if (!existsSync(shardPath)) continue;

				const symbols = JSON.parse(readFileSync(shardPath, 'utf-8')) as Record<string, IndexedSymbol>;
				for (const [id, sym] of Object.entries(symbols)) {
					this.index.symbols[id] = sym;
					this.addToNameIndex(sym.name, id);
					this.addToFileIndex(sym.filePath, id);
				}
			}

			this.index.version = manifest.version;
			this.index.projectRoot = manifest.projectRoot;
			this.index.updatedAt = manifest.updatedAt;
			this.built = true;
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Clear the index (in-memory and on disk)
	 */
	clearIndex(): void {
		this.index = this.createEmptyIndex();
		this.built = false;
		if (existsSync(this.indexDir)) {
			rmSync(this.indexDir, { force: true, recursive: true });
		}
	}

	/**
	 * Get index statistics
	 */
	getStats(): { fileCount: number; symbolCount: number; updatedAt: string } {
		return {
			fileCount: Object.keys(this.index.files).length,
			symbolCount: Object.keys(this.index.symbols).length,
			updatedAt: this.index.updatedAt
		};
	}

	/**
	 * Look up symbols by name
	 */
	lookupByName(name: string): IndexedSymbol[] {
		const ids = this.index.nameIndex[name];
		if (!ids) return [];
		return ids.map((id) => this.index.symbols[id]).filter(Boolean) as IndexedSymbol[];
	}

	/**
	 * Look up symbols in a file
	 */
	lookupByFile(filePath: string): IndexedSymbol[] {
		const ids = this.index.fileIndex[filePath];
		if (!ids) return [];
		return ids.map((id) => this.index.symbols[id]).filter(Boolean) as IndexedSymbol[];
	}

	/**
	 * Get a specific symbol by ID
	 */
	getSymbol(id: string): IndexedSymbol | undefined {
		return this.index.symbols[id];
	}

	/**
	 * Get a file's index entry
	 */
	getFile(filePath: string): IndexedFile | undefined {
		return this.index.files[filePath];
	}

	// --- Private methods ---

	private createEmptyIndex(): CodebaseIndex {
		return {
			fileIndex: {},
			files: {},
			nameIndex: {},
			projectRoot: this.projectRoot,
			symbols: {},
			updatedAt: new Date().toISOString(),
			version: INDEX_VERSION
		};
	}

	/**
	 * Discover all indexable files in the project
	 */
	private async discoverFiles(): Promise<string[]> {
		const files: string[] = [];

		try {
			// Use git ls-files for best performance and .gitignore awareness
			const { stdout } = await execAsync('git ls-files --cached --others --exclude-standard', {
				cwd: this.projectRoot,
				maxBuffer: MAX_EXEC_BUFFER
			});
			const allFiles = stdout.trim().split('\n').filter(Boolean);

			for (const file of allFiles) {
				if (files.length >= MAX_FILES) break;
				const ext = extname(file);
				if (isSupportedExtension(ext) && !this.isExcluded(file)) {
					files.push(file);
				}
			}
		} catch {
			// Fallback: walk directory tree
			this.walkDirectory(this.projectRoot, '', files);
		}

		return files;
	}

	private processDirectoryEntry(entry: Dirent, absDir: string, relDir: string, files: string[]): void {
		const name = entry.name;
		const relPath = relDir ? `${relDir}/${name}` : name;

		if (entry.isDirectory()) {
			if (!EXCLUDED_DIRS.has(name) && !name.startsWith('.')) {
				this.walkDirectory(join(absDir, name), relPath, files);
			}
		} else if (entry.isFile() && isSupportedExtension(extname(name))) {
			files.push(relPath);
		}
	}

	/**
	 * Fallback directory walker when git is unavailable
	 */
	private walkDirectory(absDir: string, relDir: string, files: string[]): void {
		if (files.length >= MAX_FILES) return;

		try {
			const entries = readdirSync(absDir, { withFileTypes: true });
			for (const entry of entries) {
				if (files.length >= MAX_FILES) return;
				this.processDirectoryEntry(entry, absDir, relDir, files);
			}
		} catch {
			// Skip unreadable directories
		}
	}

	/**
	 * Check if a file path should be excluded
	 */
	private isExcluded(filePath: string): boolean {
		const parts = filePath.split('/');
		return parts.some((p) => EXCLUDED_DIRS.has(p));
	}

	/**
	 * Index a batch of files
	 */
	private async indexFiles(filePaths: string[]): Promise<void> {
		// Process in batches for memory efficiency
		for (let i = 0; i < filePaths.length; i += INDEX_BATCH_SIZE) {
			const batch = filePaths.slice(i, i + INDEX_BATCH_SIZE);
			await Promise.all(
				batch.map(async (relPath) => {
					try {
						const absPath = join(this.projectRoot, relPath);
						const content = await readFileAsync(absPath, 'utf-8');
						await this.indexSingleFile(relPath, content);
					} catch {
						// Skip unreadable files
					}
				})
			);
		}
	}

	/**
	 * Index a single file, updating the index in place
	 */
	private async indexSingleFile(relPath: string, content: string): Promise<void> {
		// Remove old symbols for this file
		this.removeFileFromIndex(relPath);

		const result = await parseFile(relPath, content);
		if (!result) return;

		const fileEntry: IndexedFile = {
			contentHash: result.contentHash,
			filePath: relPath,
			imports: result.imports,
			indexedAt: Date.now(),
			language: result.language,
			symbolIds: result.symbols.map((s: IndexedSymbol) => s.id)
		};

		this.index.files[relPath] = fileEntry;

		for (const sym of result.symbols) {
			this.index.symbols[sym.id] = sym;
			this.addToNameIndex(sym.name, sym.id);
			this.addToFileIndex(relPath, sym.id);
		}
	}

	/**
	 * Remove a file and its symbols from the index
	 */
	private addToFileIndex(filePath: string, id: string): void {
		this.index.fileIndex[filePath] ??= [];
		this.index.fileIndex[filePath]!.push(id);
	}

	private addToNameIndex(name: string, id: string): void {
		this.index.nameIndex[name] ??= [];
		this.index.nameIndex[name]!.push(id);
	}

	private removeFileFromIndex(filePath: string): void {
		const existing = this.index.files[filePath];
		if (!existing) return;

		for (const symId of existing.symbolIds) {
			const sym = this.index.symbols[symId];
			if (sym) {
				// Remove from name index
				const nameIds = this.index.nameIndex[sym.name];
				if (nameIds) {
					this.index.nameIndex[sym.name] = nameIds.filter((id) => id !== symId);
					if (this.index.nameIndex[sym.name]!.length === 0) {
						delete this.index.nameIndex[sym.name];
					}
				}
			}
			delete this.index.symbols[symId];
		}

		// Remove from file index
		delete this.index.fileIndex[filePath];
		delete this.index.files[filePath];
	}

	/**
	 * Get files changed since last index
	 */
	private async getChangedFiles(): Promise<string[]> {
		try {
			const { stdout } = await execAsync('git diff --name-only HEAD', {
				cwd: this.projectRoot
			});
			return stdout.trim().split('\n').filter(Boolean);
		} catch {
			return [];
		}
	}

	/**
	 * Persist the index to disk in sharded format
	 */
	private persistIndex(): void {
		try {
			mkdirSync(this.indexDir, { recursive: true });

			// Write files.json
			writeFileSync(join(this.indexDir, 'files.json'), JSON.stringify(this.index.files, null, 2));

			// Shard symbols by first character of name (a-z + _other)
			const shards = new Map<string, Record<string, IndexedSymbol>>();
			for (const [id, sym] of Object.entries(this.index.symbols)) {
				const firstChar = sym.name[0]?.toLowerCase() ?? '_';
				const shardKey = /[a-z]/.test(firstChar) ? firstChar : '_other';
				if (!shards.has(shardKey)) shards.set(shardKey, {});
				shards.get(shardKey)![id] = sym;
			}

			const shardFiles: string[] = [];
			for (const [key, symbols] of shards) {
				const filename = `symbols-${key}.json`;
				writeFileSync(join(this.indexDir, filename), JSON.stringify(symbols, null, 2));
				shardFiles.push(filename);
			}

			// Write manifest
			const manifest: IndexManifest = {
				fileCount: Object.keys(this.index.files).length,
				projectRoot: this.projectRoot,
				shards: shardFiles,
				symbolCount: Object.keys(this.index.symbols).length,
				updatedAt: this.index.updatedAt,
				version: INDEX_VERSION
			};
			writeFileSync(join(this.indexDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
		} catch {
			// Non-fatal: index persistence failure shouldn't crash the pipeline
		}
	}
}

/**
 * Singleton management
 */
let indexServiceInstance: ASTIndexService | null = null;

export function getASTIndexService(projectRoot?: string): ASTIndexService {
	if (!indexServiceInstance && projectRoot) {
		indexServiceInstance = new ASTIndexService(projectRoot);
	}
	indexServiceInstance ??= new ASTIndexService(process.cwd());
	return indexServiceInstance;
}

export function resetASTIndexService(): void {
	indexServiceInstance = null;
}
