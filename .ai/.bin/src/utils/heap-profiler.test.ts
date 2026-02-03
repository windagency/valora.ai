/**
 * Unit tests for heap-profiler.ts
 */

import * as fs from 'fs';
import * as v8 from 'v8';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HeapProfiler, createHeapSnapshot, getHeapProfiler } from './heap-profiler';

// Mock dependencies
vi.mock('v8', () => ({
	writeHeapSnapshot: vi.fn()
}));

vi.mock('fs', () => ({
	existsSync: vi.fn(),
	mkdirSync: vi.fn()
}));

vi.mock('nanoid', () => ({
	nanoid: () => '123456'
}));

// Mock logger
vi.mock('output/logger', () => ({
	getLogger: () => ({
		error: vi.fn(),
		info: vi.fn()
	})
}));

describe('HeapProfiler', () => {
	let heapProfiler: HeapProfiler;
	const mockWriteHeapSnapshot = v8.writeHeapSnapshot as unknown as ReturnType<typeof vi.fn>;
	const mockExistsSync = fs.existsSync as unknown as ReturnType<typeof vi.fn>;
	const mockMkdirSync = fs.mkdirSync as unknown as ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();
		heapProfiler = new HeapProfiler();
	});

	it('should create a heap snapshot', () => {
		mockExistsSync.mockReturnValue(true);
		mockWriteHeapSnapshot.mockReturnValue('/path/to/snapshot.heapsnapshot');

		const result = heapProfiler.createHeapSnapshot({
			directory: '/tmp',
			prefix: 'test'
		});

		expect(mockExistsSync).toHaveBeenCalledWith('/tmp');
		expect(mockWriteHeapSnapshot).toHaveBeenCalled();
		expect(result).toBe('/path/to/snapshot.heapsnapshot');
	});

	it('should create directory if it does not exist', () => {
		mockExistsSync.mockReturnValue(false);
		mockWriteHeapSnapshot.mockReturnValue('/path/to/snapshot.heapsnapshot');

		heapProfiler.createHeapSnapshot({
			directory: '/new/dir'
		});

		expect(mockMkdirSync).toHaveBeenCalledWith('/new/dir', { recursive: true });
	});

	it('should use default options if none provided', () => {
		mockExistsSync.mockReturnValue(true);

		heapProfiler.createHeapSnapshot();

		expect(mockExistsSync).toHaveBeenCalledWith('./heap-dumps');
	});

	it('should handle writeHeapSnapshot returning undefined (older Node versions)', () => {
		mockExistsSync.mockReturnValue(true);
		mockWriteHeapSnapshot.mockReturnValue(undefined);

		const result = heapProfiler.createHeapSnapshot({
			directory: '/tmp',
			prefix: 'test'
		});

		// It should return the calculated path if v8 returns undefined
		expect(result).toContain('/tmp/test-');
		expect(result).toContain('.heapsnapshot');
	});

	it('should throw error if directory creation fails', () => {
		mockExistsSync.mockReturnValue(false);
		mockMkdirSync.mockImplementation(() => {
			throw new Error('Permission denied');
		});

		expect(() => {
			heapProfiler.createHeapSnapshot({ directory: '/root/protected' });
		}).toThrow('Permission denied');
	});

	it('should throw error if snapshot creation fails', () => {
		mockExistsSync.mockReturnValue(true);
		mockWriteHeapSnapshot.mockImplementation(() => {
			throw new Error('Heap dump failed');
		});

		expect(() => {
			heapProfiler.createHeapSnapshot();
		}).toThrow('Heap dump failed');
	});
});

describe('getHeapProfiler', () => {
	it('should return a singleton instance', () => {
		const instance1 = getHeapProfiler();
		const instance2 = getHeapProfiler();

		expect(instance1).toBe(instance2);
		expect(instance1).toBeInstanceOf(HeapProfiler);
	});
});

describe('createHeapSnapshot helper', () => {
	const mockWriteHeapSnapshot = v8.writeHeapSnapshot as unknown as ReturnType<typeof vi.fn>;
	const mockExistsSync = fs.existsSync as unknown as ReturnType<typeof vi.fn>;

	it('should call getHeapProfiler().createHeapSnapshot', () => {
		const spy = vi.spyOn(HeapProfiler.prototype, 'createHeapSnapshot');
		mockWriteHeapSnapshot.mockReturnValue('path');
		mockExistsSync.mockReturnValue(true);

		createHeapSnapshot();

		expect(spy).toHaveBeenCalled();
	});
});
