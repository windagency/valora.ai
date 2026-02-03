/**
 * File system utilities
 */

import type { Stats } from 'fs';

import * as fsSync from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

import { shouldGracefullyHandleFileErrors } from './environment';

export class DirectoryNotFoundError extends Error {
	constructor(public readonly dirPath: string) {
		super(`Directory not found: ${dirPath}`);
		this.name = 'DirectoryNotFoundError';
	}
}

export class FileNotFoundError extends Error {
	constructor(public readonly filePath: string) {
		super(`File not found: ${filePath}`);
		this.name = 'FileNotFoundError';
	}
}

/**
 * Read file with error handling
 */
export async function readFile(filePath: string): Promise<string> {
	try {
		return await fs.readFile(filePath, 'utf-8');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			throw new FileNotFoundError(filePath);
		}
		throw error;
	}
}

/**
 * Safely handle file system errors in sandboxed environments
 */
function handleFileSystemError(error: NodeJS.ErrnoException, operation: string, filePath: string): void {
	const isPermissionError = error.code === 'EPERM' || error.code === 'EACCES';
	const shouldGracefullyHandle = shouldGracefullyHandleFileErrors();

	if (isPermissionError && shouldGracefullyHandle) {
		// Silently ignore permission errors in production sandboxed environments
		// This allows the application to continue functioning

		console.debug(`File operation skipped in sandboxed environment: ${operation} ${filePath}`);
		return;
	}

	// Re-throw other errors, or permission errors in test environments (for proper testing)
	throw error;
}

/**
 * Write file with directory creation and sandbox resilience
 */
export async function writeFile(filePath: string, content: string): Promise<void> {
	try {
		const dir = path.dirname(filePath);
		await fs.mkdir(dir, { recursive: true });
		await fs.writeFile(filePath, content, 'utf-8');
	} catch (error) {
		handleFileSystemError(error as NodeJS.ErrnoException, 'write', filePath);
	}
}

/**
 * Append content to file with directory creation and sandbox resilience
 */
export async function appendFile(filePath: string, content: string): Promise<void> {
	try {
		const dir = path.dirname(filePath);
		await fs.mkdir(dir, { recursive: true });
		await fs.appendFile(filePath, content, 'utf-8');
	} catch (error) {
		handleFileSystemError(error as NodeJS.ErrnoException, 'append', filePath);
	}
}

/**
 * Check if file exists
 */
export function fileExists(filePath: string): boolean {
	return fsSync.existsSync(filePath);
}

/**
 * Check if directory exists
 */
export function dirExists(dirPath: string): boolean {
	return fsSync.existsSync(dirPath);
}

/**
 * List files in directory
 */
export async function listFiles(dirPath: string, extension?: string): Promise<string[]> {
	try {
		const entries = await fs.readdir(dirPath, { withFileTypes: true });
		let files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);

		if (extension) {
			files = files.filter((file) => file.endsWith(extension));
		}

		return files;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			throw new DirectoryNotFoundError(dirPath);
		}
		throw error;
	}
}

/**
 * List directories
 */
export async function listDirectories(dirPath: string): Promise<string[]> {
	try {
		const entries = await fs.readdir(dirPath, { withFileTypes: true });
		return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			throw new DirectoryNotFoundError(dirPath);
		}
		throw error;
	}
}

/**
 * Recursively find files by pattern
 */
export async function findFiles(dirPath: string, pattern: RegExp, maxDepth: number = 10): Promise<string[]> {
	const results: string[] = [];

	async function search(currentPath: string, depth: number): Promise<void> {
		if (depth > maxDepth) return;

		const entries = await fs.readdir(currentPath, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = path.join(currentPath, entry.name);

			if (entry.isDirectory()) {
				await search(fullPath, depth + 1);
			} else if (entry.isFile() && pattern.test(entry.name)) {
				results.push(fullPath);
			}
		}
	}

	if (!dirExists(dirPath)) {
		throw new DirectoryNotFoundError(dirPath);
	}

	await search(dirPath, 0);
	return results;
}

/**
 * Ensure directory exists
 */
export async function ensureDir(dirPath: string): Promise<void> {
	await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Get file stats
 */
export async function getFileStats(filePath: string): Promise<Stats> {
	try {
		return await fs.stat(filePath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			throw new FileNotFoundError(filePath);
		}
		throw error;
	}
}

/**
 * Resolve path relative to AI root directory
 */
export function resolveAIPath(...segments: string[]): string {
	return path.join(getAIRoot(), ...segments);
}

/**
 * Get AI root directory (.ai folder)
 * Finds the outermost .ai directory by walking up the tree
 */
export function getAIRoot(): string {
	const currentFilename = fileURLToPath(import.meta.url);
	const currentDirname = dirname(currentFilename);
	const currentDir = currentDirname;
	const foundAIDirs: string[] = [];

	// Walk up the directory tree and collect all .ai directories
	// Generate array of directory levels to check
	const checkDirs = Array.from({ length: 10 }, (_, i) => {
		if (i === 0) return currentDir;
		const levels = Array(i + 1)
			.fill('..')
			.join('/');
		return path.resolve(currentDirname, levels);
	});

	// Filter to unique directories (stop at filesystem root)
	const uniqueDirs = [...new Set(checkDirs)];

	// Check each directory for .ai folder
	uniqueDirs.forEach((dir) => {
		const aiDir = path.join(dir, '.ai');
		if (fileExists(aiDir) && fsSync.statSync(aiDir).isDirectory()) {
			foundAIDirs.push(aiDir);
		}

		// Also check if current directory is .ai
		const dirName = path.basename(dir);
		if (dirName === '.ai' && fsSync.statSync(dir).isDirectory()) {
			foundAIDirs.push(dir);
		}
	});

	// Return the outermost .ai directory (closest to filesystem root)
	if (foundAIDirs.length > 0) {
		// Sort by path length (shortest = outermost) and return the first one
		return foundAIDirs.sort((a, b) => a.length - b.length)[0]!;
	}

	// Fallback: assume we're in .ai/.bin/dist/cli or similar
	// and the .ai directory is two levels up from dist/cli
	return path.resolve(__dirname, '../../');
}

/**
 * Read and parse JSON file with type safety
 */
export async function readJSON<T extends Record<string, unknown> = Record<string, unknown>>(
	filePath: string
): Promise<T> {
	try {
		const content = await readFile(filePath);
		return JSON.parse(content) as T;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			throw new FileNotFoundError(filePath);
		}
		// Re-throw JSON parsing errors with more context
		if (error instanceof SyntaxError) {
			throw new Error(`Invalid JSON in file ${filePath}: ${error.message}`);
		}
		throw error;
	}
}

/**
 * Write object as JSON to file
 */
export async function writeJSON<T extends Record<string, unknown> = Record<string, unknown>>(
	filePath: string,
	data: T
): Promise<void> {
	const content = JSON.stringify(data, null, 2);
	await writeFile(filePath, content);
}
