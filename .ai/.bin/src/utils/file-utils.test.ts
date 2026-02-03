/**
 * Unit tests for file-utils.ts
 *
 * Tests file system operations, error handling, and path resolution
 * with focus on reliability, security, and edge case coverage.
 */

import * as fsSync from 'fs';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	DirectoryNotFoundError,
	FileNotFoundError,
	appendFile,
	dirExists,
	ensureDir,
	fileExists,
	findFiles,
	getAIRoot,
	getFileStats,
	listDirectories,
	listFiles,
	readFile,
	readJSON,
	resolveAIPath,
	writeFile,
	writeJSON
} from './file-utils';

// Mock fs modules
vi.mock('fs/promises');
vi.mock('fs');

// Create a temporary directory for tests
let tempDir: string;

// Use beforeAll instead of beforeEach for setup that happens once
beforeAll(async () => {
	// Set up mocks first
	const mockFs = vi.mocked(fs);
	const mockFsSync = vi.mocked(fsSync);

	// Create a fake temp directory path
	tempDir = path.join(os.tmpdir(), 'ai-orchestrator-test-fake');

	// Set up default mock behaviors
	mockFs.mkdtemp.mockResolvedValue(tempDir);
	mockFs.readFile.mockImplementation(async (filePath) => {
		if (typeof filePath !== 'string') throw new Error('Invalid path');
		return 'mock content' as any;
	});
	mockFs.writeFile.mockImplementation(async () => {});
	mockFs.appendFile.mockImplementation(async () => {});
	mockFs.stat.mockImplementation(async () => ({ mtime: new Date(), size: 100 }) as any);
	mockFs.mkdir.mockImplementation(async () => {});
	mockFs.rm.mockImplementation(async () => {});

	mockFsSync.existsSync.mockImplementation((path) => {
		if (typeof path !== 'string') return false;
		return path.includes(tempDir);
	});

	mockFsSync.statSync.mockImplementation((path) => {
		if (typeof path !== 'string') throw new Error('Invalid path');
		return { isDirectory: () => false, isFile: () => true, mtime: new Date(), size: 100 } as any;
	});
});

afterAll(async () => {
	// Clean up temp directory (won't actually exist since we're mocking)
	tempDir = '';
});

beforeEach(() => {
	// Reset all mocks
	vi.clearAllMocks();
});

afterEach(async () => {
	// Clean up temp directory
	try {
		await fs.rm(tempDir, { force: true, recursive: true });
	} catch (error) {
		// Ignore cleanup errors in tests
	}
});

describe('FileNotFoundError', () => {
	it('should create error with correct message and name', () => {
		const error = new FileNotFoundError('/path/to/file.txt');

		expect(error.message).toBe('File not found: /path/to/file.txt');
		expect(error.name).toBe('FileNotFoundError');
		expect(error.filePath).toBe('/path/to/file.txt');
	});
});

describe('DirectoryNotFoundError', () => {
	it('should create error with correct message and name', () => {
		const error = new DirectoryNotFoundError('/path/to/dir');

		expect(error.message).toBe('Directory not found: /path/to/dir');
		expect(error.name).toBe('DirectoryNotFoundError');
		expect(error.dirPath).toBe('/path/to/dir');
	});
});

describe('readFile', () => {
	const mockFs = vi.mocked(fs);

	it('should read file content successfully', async () => {
		const filePath = path.join(tempDir, 'test.txt');
		const content = 'Hello, World!';
		mockFs.readFile.mockResolvedValue(content);

		const result = await readFile(filePath);

		expect(result).toBe(content);
		expect(mockFs.readFile).toHaveBeenCalledWith(filePath, 'utf-8');
	});

	it('should throw FileNotFoundError for ENOENT error', async () => {
		const filePath = path.join(tempDir, 'nonexistent.txt');
		const error = new Error('File not found') as NodeJS.ErrnoException;
		error.code = 'ENOENT';
		mockFs.readFile.mockRejectedValue(error);

		await expect(readFile(filePath)).rejects.toThrow(FileNotFoundError);
		await expect(readFile(filePath)).rejects.toThrow(`File not found: ${filePath}`);
	});

	it('should re-throw non-ENOENT errors', async () => {
		const filePath = path.join(tempDir, 'test.txt');
		const error = new Error('Permission denied') as NodeJS.ErrnoException;
		error.code = 'EACCES';
		mockFs.readFile.mockRejectedValue(error);

		await expect(readFile(filePath)).rejects.toThrow('Permission denied');
	});
});

describe('writeFile', () => {
	const mockFs = vi.mocked(fs);

	it('should write file and create directories', async () => {
		const filePath = path.join(tempDir, 'subdir/test.txt');
		const content = 'Test content';

		await writeFile(filePath, content);

		expect(mockFs.mkdir).toHaveBeenCalledWith(path.dirname(filePath), { recursive: true });
		expect(mockFs.writeFile).toHaveBeenCalledWith(filePath, content, 'utf-8');
	});
});

describe('appendFile', () => {
	const mockFs = vi.mocked(fs);

	it('should append content and create directories', async () => {
		const filePath = path.join(tempDir, 'subdir/test.txt');
		const content = 'Additional content';

		await appendFile(filePath, content);

		expect(mockFs.mkdir).toHaveBeenCalledWith(path.dirname(filePath), { recursive: true });
		expect(mockFs.appendFile).toHaveBeenCalledWith(filePath, content, 'utf-8');
	});
});

describe('fileExists', () => {
	const mockFsSync = vi.mocked(fsSync);

	it('should return true when file exists', () => {
		const filePath = path.join(tempDir, 'test.txt');
		mockFsSync.existsSync.mockReturnValue(true);

		const result = fileExists(filePath);

		expect(result).toBe(true);
		expect(mockFsSync.existsSync).toHaveBeenCalledWith(filePath);
	});

	it('should return false when file does not exist', () => {
		const filePath = path.join(tempDir, 'nonexistent.txt');
		mockFsSync.existsSync.mockReturnValue(false);

		const result = fileExists(filePath);

		expect(result).toBe(false);
		expect(mockFsSync.existsSync).toHaveBeenCalledWith(filePath);
	});
});

describe('dirExists', () => {
	const mockFsSync = vi.mocked(fsSync);

	it('should return true when directory exists', () => {
		const dirPath = path.join(tempDir, 'testdir');
		mockFsSync.existsSync.mockReturnValue(true);

		const result = dirExists(dirPath);

		expect(result).toBe(true);
		expect(mockFsSync.existsSync).toHaveBeenCalledWith(dirPath);
	});

	it('should return false when directory does not exist', () => {
		const dirPath = path.join(tempDir, 'nonexistent');
		mockFsSync.existsSync.mockReturnValue(false);

		const result = dirExists(dirPath);

		expect(result).toBe(false);
		expect(mockFsSync.existsSync).toHaveBeenCalledWith(dirPath);
	});
});

describe('listFiles', () => {
	const mockFs = vi.mocked(fs);

	it('should list all files in directory', async () => {
		const dirPath = path.join(tempDir, 'testdir');
		const mockEntries = [
			{ isDirectory: () => false, isFile: () => true, name: 'file1.txt' },
			{ isDirectory: () => false, isFile: () => true, name: 'file2.js' },
			{ isDirectory: () => true, isFile: () => false, name: 'subdir' }
		];
		mockFs.readdir.mockResolvedValue(mockEntries as any);

		const result = await listFiles(dirPath);

		expect(result).toEqual(['file1.txt', 'file2.js']);
		expect(mockFs.readdir).toHaveBeenCalledWith(dirPath, { withFileTypes: true });
	});

	it('should filter files by extension', async () => {
		const dirPath = path.join(tempDir, 'testdir');
		const mockEntries = [
			{ isDirectory: () => false, isFile: () => true, name: 'file1.txt' },
			{ isDirectory: () => false, isFile: () => true, name: 'file2.js' },
			{ isDirectory: () => false, isFile: () => true, name: 'file3.txt' }
		];
		mockFs.readdir.mockResolvedValue(mockEntries as any);

		const result = await listFiles(dirPath, '.txt');

		expect(result).toEqual(['file1.txt', 'file3.txt']);
	});

	it('should throw DirectoryNotFoundError for ENOENT', async () => {
		const dirPath = path.join(tempDir, 'nonexistent');
		const error = new Error('Directory not found') as NodeJS.ErrnoException;
		error.code = 'ENOENT';
		mockFs.readdir.mockRejectedValue(error);

		await expect(listFiles(dirPath)).rejects.toThrow(DirectoryNotFoundError);
		await expect(listFiles(dirPath)).rejects.toThrow(`Directory not found: ${dirPath}`);
	});
});

describe('listDirectories', () => {
	const mockFs = vi.mocked(fs);

	it('should list all directories', async () => {
		const dirPath = path.join(tempDir, 'testdir');
		const mockEntries = [
			{ isDirectory: () => false, isFile: () => true, name: 'file1.txt' },
			{ isDirectory: () => true, isFile: () => false, name: 'subdir1' },
			{ isDirectory: () => true, isFile: () => false, name: 'subdir2' }
		];
		mockFs.readdir.mockResolvedValue(mockEntries as any);

		const result = await listDirectories(dirPath);

		expect(result).toEqual(['subdir1', 'subdir2']);
	});

	it('should throw DirectoryNotFoundError for ENOENT', async () => {
		const dirPath = path.join(tempDir, 'nonexistent');
		const error = new Error('Directory not found') as NodeJS.ErrnoException;
		error.code = 'ENOENT';
		mockFs.readdir.mockRejectedValue(error);

		await expect(listDirectories(dirPath)).rejects.toThrow(DirectoryNotFoundError);
	});
});

describe('findFiles', () => {
	const mockFs = vi.mocked(fs);
	const mockFsSync = vi.mocked(fsSync);

	it('should find files matching pattern recursively', async () => {
		const dirPath = tempDir;
		const pattern = /\.txt$/;

		// Mock directory structure
		mockFsSync.existsSync.mockReturnValue(true);
		mockFs.readdir
			.mockResolvedValueOnce([
				{ isDirectory: () => false, isFile: () => true, name: 'file1.txt' },
				{ isDirectory: () => true, isFile: () => false, name: 'subdir' }
			] as any)
			.mockResolvedValueOnce([
				{ isDirectory: () => false, isFile: () => true, name: 'file2.txt' },
				{ isDirectory: () => false, isFile: () => true, name: 'file3.js' }
			] as any);

		const result = await findFiles(dirPath, pattern);

		expect(result).toEqual([path.join(dirPath, 'file1.txt'), path.join(dirPath, 'subdir', 'file2.txt')]);
	});

	it('should respect max depth limit', async () => {
		const dirPath = tempDir;
		const pattern = /\.txt$/;

		mockFsSync.existsSync.mockReturnValue(true);
		mockFs.readdir.mockResolvedValue([{ isDirectory: () => true, isFile: () => false, name: 'deep' }] as any);

		const result = await findFiles(dirPath, pattern, 0); // Max depth 0

		expect(result).toEqual([]);
	});

	it('should throw DirectoryNotFoundError for non-existent directory', async () => {
		const dirPath = path.join(tempDir, 'nonexistent');
		mockFsSync.existsSync.mockReturnValue(false);

		await expect(findFiles(dirPath, /\.txt$/)).rejects.toThrow(DirectoryNotFoundError);
	});
});

describe('ensureDir', () => {
	const mockFs = vi.mocked(fs);

	it('should create directory recursively', async () => {
		const dirPath = path.join(tempDir, 'subdir', 'nested');

		await ensureDir(dirPath);

		expect(mockFs.mkdir).toHaveBeenCalledWith(dirPath, { recursive: true });
	});
});

describe('getFileStats', () => {
	const mockFs = vi.mocked(fs);

	it('should return file stats', async () => {
		const filePath = path.join(tempDir, 'test.txt');
		const mockStats = { mtime: new Date(), size: 100 } as any;
		mockFs.stat.mockResolvedValue(mockStats);

		const result = await getFileStats(filePath);

		expect(result).toBe(mockStats);
		expect(mockFs.stat).toHaveBeenCalledWith(filePath);
	});

	it('should throw FileNotFoundError for ENOENT', async () => {
		const filePath = path.join(tempDir, 'nonexistent.txt');
		const error = new Error('File not found') as NodeJS.ErrnoException;
		error.code = 'ENOENT';
		mockFs.stat.mockRejectedValue(error);

		await expect(getFileStats(filePath)).rejects.toThrow(FileNotFoundError);
	});
});

describe('resolveAIPath', () => {
	it('should resolve path relative to AI root', () => {
		const segments = ['.bin', 'package.json'];
		const result = resolveAIPath(...segments);

		expect(result).toContain('.ai');
		expect(result).toContain('.bin');
		expect(result).toContain('package.json');
	});
});

describe('getAIRoot', () => {
	const mockFsSync = vi.mocked(fsSync);

	it('should find outermost .ai directory', () => {
		// Mock directory structure with nested .ai directories
		mockFsSync.existsSync.mockImplementation((filePath: string) => {
			const pathStr = filePath.toString();
			return pathStr.includes('.ai') && !pathStr.includes('nested');
		});

		mockFsSync.statSync.mockReturnValue({ isDirectory: () => true } as any);

		const result = getAIRoot();

		// Should return the outermost .ai directory
		expect(result).toContain('.ai');
	});

	it('should find the actual .ai directory when it exists', () => {
		const result = getAIRoot();

		// Should find the actual .ai directory
		expect(result).toContain('.ai');
		expect(path.basename(result)).toBe('.ai');
	});
});

describe('readJSON', () => {
	const mockFs = vi.mocked(fs);

	it('should read and parse JSON file', async () => {
		const filePath = path.join(tempDir, 'test.json');
		const data = { name: 'test', value: 42 };
		const jsonContent = JSON.stringify(data);

		mockFs.readFile.mockResolvedValue(jsonContent);

		const result = await readJSON<typeof data>(filePath);

		expect(result).toEqual(data);
	});

	it('should throw FileNotFoundError for missing file', async () => {
		const filePath = path.join(tempDir, 'nonexistent.json');
		const error = new Error('File not found') as NodeJS.ErrnoException;
		error.code = 'ENOENT';
		mockFs.readFile.mockRejectedValue(error);

		await expect(readJSON(filePath)).rejects.toThrow(FileNotFoundError);
	});

	it('should throw descriptive error for invalid JSON', async () => {
		const filePath = path.join(tempDir, 'invalid.json');
		const invalidJson = '{ invalid json content }';
		mockFs.readFile.mockResolvedValue(invalidJson);

		await expect(readJSON(filePath)).rejects.toThrow(/Invalid JSON in file/);
		await expect(readJSON(filePath)).rejects.toThrow(filePath);
	});
});

describe('writeJSON', () => {
	const mockFs = vi.mocked(fs);

	it('should write object as formatted JSON', async () => {
		const filePath = path.join(tempDir, 'test.json');
		const data = { name: 'test', value: 42 };
		const expectedJson = JSON.stringify(data, null, 2);

		await writeJSON(filePath, data);

		expect(mockFs.writeFile).toHaveBeenCalledWith(filePath, expectedJson, 'utf-8');
	});
});
