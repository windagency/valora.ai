/**
 * AST Context Service Tests
 */

import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { getASTIndexService, resetASTIndexService } from './ast-index.service';

import {
	ContextDeduplicator,
	extractSmartContext,
	getContextDeduplicator,
	resetContextDeduplicator
} from './ast-context.service';

function gitInit(dir: string): void {
	execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
}

function gitAdd(dir: string, file: string): void {
	execFileSync('git', ['add', file], { cwd: dir, stdio: 'ignore' });
}

describe('ContextDeduplicator', () => {
	let dedup: ContextDeduplicator;

	beforeEach(() => {
		resetContextDeduplicator();
		dedup = getContextDeduplicator();
	});

	afterEach(() => {
		resetContextDeduplicator();
	});

	it('should record and check symbol sent status', () => {
		dedup.recordSymbolSent('sym1', 'context', 2);

		const result = dedup.wasSymbolSent('sym1', 2);
		expect(result).not.toBeNull();
		expect(result!.stage).toBe('context');
		expect(result!.level).toBe(2);
	});

	it('should return null for unsent symbols', () => {
		const result = dedup.wasSymbolSent('unknown', 1);
		expect(result).toBeNull();
	});

	it('should check minimum level correctly', () => {
		dedup.recordSymbolSent('sym1', 'context', 1);

		// Level 1 was sent, asking for level 1 should match
		expect(dedup.wasSymbolSent('sym1', 1)).not.toBeNull();

		// Level 1 was sent, asking for level 2 should not match
		expect(dedup.wasSymbolSent('sym1', 2)).toBeNull();
	});

	it('should record and check file sent status', () => {
		dedup.recordFileSent('src/foo.ts', 'plan', 3);

		const result = dedup.wasFileSent('src/foo.ts', 2);
		expect(result).not.toBeNull();
		expect(result!.stage).toBe('plan');
	});

	it('should return null for unsent files', () => {
		const result = dedup.wasFileSent('unknown.ts', 0);
		expect(result).toBeNull();
	});

	it('should reset state', () => {
		dedup.recordSymbolSent('sym1', 'context', 2);
		dedup.recordFileSent('file.ts', 'context', 1);

		dedup.reset();

		expect(dedup.wasSymbolSent('sym1', 0)).toBeNull();
		expect(dedup.wasFileSent('file.ts', 0)).toBeNull();
	});

	it('should return singleton instance', () => {
		const instance1 = getContextDeduplicator();
		const instance2 = getContextDeduplicator();
		expect(instance1).toBe(instance2);
	});
});

describe('extractSmartContext', () => {
	let testDir: string;

	beforeEach(() => {
		resetASTIndexService();
		testDir = join(tmpdir(), `valora-ast-context-test-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });
		gitInit(testDir);
	});

	afterEach(() => {
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true });
		}
		resetASTIndexService();
	});

	it('includes exported focal-file symbols at level 2 (full body with line numbers)', async () => {
		writeFileSync(
			join(testDir, 'focal.ts'),
			`
export function doTheThing(): string {
	return 'done';
}

function privateHelper(): void {}
`
		);
		gitAdd(testDir, 'focal.ts');
		const indexService = getASTIndexService(testDir);
		await indexService.buildIndex();

		const result = extractSmartContext({ files: ['focal.ts'], task: 'update doTheThing' });

		expect(result.content).toContain('// File: focal.ts');
		expect(result.content).toContain('doTheThing');
		expect(result.content).not.toContain('privateHelper');
		expect(result.includedFiles).toEqual([{ filePath: 'focal.ts', level: 2, tokenEstimate: expect.any(Number) }]);
		expect(result.tokenEstimate).toBeGreaterThan(0);
	});

	it('includes a non-exported symbol when its name is explicitly mentioned in the task text', async () => {
		writeFileSync(
			join(testDir, 'focal.ts'),
			`
function InternalHelper(): void {}
`
		);
		gitAdd(testDir, 'focal.ts');
		const indexService = getASTIndexService(testDir);
		await indexService.buildIndex();

		const result = extractSmartContext({ files: ['focal.ts'], task: 'Fix a bug in InternalHelper' });

		expect(result.focalSymbols).toContain('InternalHelper');
		expect(result.content).toContain('InternalHelper');
	});

	it("includes an imported dependency file's exported symbols at level 1 (signature only), excluding non-exported ones", async () => {
		writeFileSync(
			join(testDir, 'utils.ts'),
			`export function helper(): string {\n\treturn 'help';\n}\n\nfunction hidden(): void {}\n`
		);
		writeFileSync(
			join(testDir, 'focal.ts'),
			`import { helper } from './utils';\n\nexport function useHelper(): string {\n\treturn helper();\n}\n`
		);
		gitAdd(testDir, 'utils.ts');
		gitAdd(testDir, 'focal.ts');
		const indexService = getASTIndexService(testDir);
		await indexService.buildIndex();

		const result = extractSmartContext({ files: ['focal.ts'], task: 'use the helper' });

		expect(result.content).toContain('utils.ts (signatures only)');
		expect(result.content).toContain('helper');
		expect(result.content).not.toContain('hidden');
		expect(result.includedFiles).toContainEqual({ filePath: 'utils.ts', level: 1, tokenEstimate: expect.any(Number) });
	});

	it('respects the token budget — a near-zero budget includes no content', async () => {
		writeFileSync(join(testDir, 'focal.ts'), `export function doTheThing(): string {\n\treturn 'done';\n}\n`);
		gitAdd(testDir, 'focal.ts');
		const indexService = getASTIndexService(testDir);
		await indexService.buildIndex();

		const result = extractSmartContext({ budget: 0, files: ['focal.ts'], task: 'anything' });

		expect(result.content).toBe('');
		expect(result.includedFiles).toEqual([]);
		expect(result.tokenEstimate).toBe(0);
	});

	it('KNOWN GAP: getDependencyFiles() matches dependencies by substring, not resolved import path — an unrelated file whose path merely contains the import specifier text is incorrectly pulled in as a dependency', async () => {
		// focal.ts imports './utils', whose real target is utils.ts. But
		// getDependencyFiles() does `indexedFilePath.includes(imp.source.replace(/^\.\//, ''))`
		// — a bare substring check — so an unrelated file like "myutils-other.ts", which
		// merely contains the substring "utils", is ALSO treated as a real dependency.
		writeFileSync(join(testDir, 'utils.ts'), `export function helper(): string {\n\treturn 'help';\n}\n`);
		writeFileSync(join(testDir, 'myutils-other.ts'), `export function unrelatedExport(): void {}\n`);
		writeFileSync(
			join(testDir, 'focal.ts'),
			`import { helper } from './utils';\n\nexport function useHelper(): string {\n\treturn helper();\n}\n`
		);
		gitAdd(testDir, 'utils.ts');
		gitAdd(testDir, 'myutils-other.ts');
		gitAdd(testDir, 'focal.ts');
		const indexService = getASTIndexService(testDir);
		await indexService.buildIndex();

		const result = extractSmartContext({ files: ['focal.ts'], task: 'use the helper' });

		// Documenting current (buggy) behaviour rather than fixing it here: proper import
		// resolution would need real module-path resolution (relative segments, extensions,
		// index files), which is a larger change than this coverage pass should make
		// unreviewed.
		expect(result.content).toContain('unrelatedExport');
		expect(result.includedFiles.some((f) => f.filePath === 'myutils-other.ts')).toBe(true);
	});
});
