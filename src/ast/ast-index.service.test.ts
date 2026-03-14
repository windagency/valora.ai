/**
 * AST Index Service Tests
 */

import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ASTIndexService, resetASTIndexService } from './ast-index.service';

function gitInit(dir: string): void {
	execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
}

function gitAdd(dir: string, file: string): void {
	execFileSync('git', ['add', file], { cwd: dir, stdio: 'ignore' });
}

describe('ASTIndexService', () => {
	let service: ASTIndexService;
	let testDir: string;

	beforeEach(() => {
		resetASTIndexService();
		testDir = join(tmpdir(), `valora-ast-test-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });
		gitInit(testDir);
		service = new ASTIndexService(testDir);
	});

	afterEach(() => {
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	it('should start with empty index', () => {
		expect(service.isBuilt()).toBe(false);
		expect(service.isBuilding()).toBe(false);
		expect(service.getStats().fileCount).toBe(0);
		expect(service.getStats().symbolCount).toBe(0);
	});

	it('should build an index from source files', async () => {
		writeFileSync(
			join(testDir, 'test.ts'),
			`
export function hello(): string {
	return 'hello';
}

export class Greeter {
	greet(): string {
		return 'hi';
	}
}

export interface Config {
	name: string;
}

export type ID = string;

export const MAX_SIZE = 100;
`
		);
		gitAdd(testDir, 'test.ts');

		const index = await service.buildIndex();

		expect(service.isBuilt()).toBe(true);
		expect(service.getStats().fileCount).toBeGreaterThanOrEqual(1);
		expect(index.files['test.ts']).toBeDefined();
		expect(index.files['test.ts']!.language).toBe('typescript');
	});

	it('should look up symbols by name', async () => {
		writeFileSync(
			join(testDir, 'funcs.ts'),
			`
export function doSomething() { return 1; }
export function doAnother() { return 2; }
`
		);
		gitAdd(testDir, 'funcs.ts');

		await service.buildIndex();

		const results = service.lookupByName('doSomething');
		expect(results.length).toBeGreaterThanOrEqual(1);
		expect(results[0]!.name).toBe('doSomething');
		expect(results[0]!.kind).toBe('function');
	});

	it('should look up symbols by file', async () => {
		writeFileSync(
			join(testDir, 'myfile.ts'),
			`
export class MyService {
	run(): void {}
}
`
		);
		gitAdd(testDir, 'myfile.ts');

		await service.buildIndex();

		const results = service.lookupByFile('myfile.ts');
		expect(results.length).toBeGreaterThanOrEqual(1);
		expect(results.some((s) => s.name === 'MyService')).toBe(true);
	});

	it('should persist and load index', async () => {
		writeFileSync(
			join(testDir, 'persist.ts'),
			`
export const VALUE = 42;
`
		);
		gitAdd(testDir, 'persist.ts');

		await service.buildIndex();
		const stats1 = service.getStats();

		// Create a new instance and load
		const service2 = new ASTIndexService(testDir);
		const loaded = service2.loadIndex();

		expect(loaded).toBe(true);
		expect(service2.getStats().fileCount).toBe(stats1.fileCount);
		expect(service2.getStats().symbolCount).toBe(stats1.symbolCount);
	});

	it('should perform incremental updates', async () => {
		writeFileSync(
			join(testDir, 'inc.ts'),
			`
export function original() { return 1; }
`
		);
		gitAdd(testDir, 'inc.ts');

		await service.buildIndex();

		// Modify the file
		writeFileSync(
			join(testDir, 'inc.ts'),
			`
export function original() { return 1; }
export function added() { return 2; }
`
		);

		const updated = await service.incrementalUpdate(['inc.ts']);
		expect(updated).toBe(1);

		const results = service.lookupByName('added');
		expect(results.length).toBeGreaterThanOrEqual(1);
	});

	it('should handle deleted files in incremental update', async () => {
		writeFileSync(join(testDir, 'todelete.ts'), `export const X = 1;`);
		gitAdd(testDir, 'todelete.ts');

		await service.buildIndex();
		expect(service.getFile('todelete.ts')).toBeDefined();

		// Delete the file
		rmSync(join(testDir, 'todelete.ts'));

		const updated = await service.incrementalUpdate(['todelete.ts']);
		expect(updated).toBe(1);
		expect(service.getFile('todelete.ts')).toBeUndefined();
	});

	it('should clear the index', async () => {
		writeFileSync(join(testDir, 'clear.ts'), `export const Y = 2;`);
		gitAdd(testDir, 'clear.ts');

		await service.buildIndex();
		expect(service.isBuilt()).toBe(true);

		service.clearIndex();
		expect(service.isBuilt()).toBe(false);
		expect(service.getStats().fileCount).toBe(0);
	});
});
