/**
 * AST Tools Service Tests
 */

import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getASTIndexService, resetASTIndexService } from './ast-index.service';
import { ASTToolsService, resetASTToolsService } from './ast-tools.service';

function gitInit(dir: string): void {
	execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
}

function gitAdd(dir: string, pattern: string): void {
	execFileSync('git', ['add', pattern], { cwd: dir, stdio: 'ignore' });
}

describe('ASTToolsService', () => {
	let service: ASTToolsService;
	let testDir: string;

	beforeEach(async () => {
		resetASTIndexService();
		resetASTToolsService();

		testDir = join(tmpdir(), `valora-tools-test-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });
		gitInit(testDir);

		writeFileSync(
			join(testDir, 'example.ts'),
			`
export function greet(name: string): string {
	return 'Hello ' + name;
}

export class Calculator {
	add(a: number, b: number): number {
		return a + b;
	}
}

export interface Config {
	debug: boolean;
}
`
		);
		gitAdd(testDir, '.');

		const indexService = getASTIndexService(testDir);
		await indexService.buildIndex();

		service = new ASTToolsService(testDir);
	});

	afterEach(() => {
		resetASTIndexService();
		resetASTToolsService();
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	describe('executeSymbolSearch', () => {
		it('should find symbols by name', async () => {
			const result = await service.executeSymbolSearch({ query: 'greet' });
			expect(result).toContain('greet');
			expect(result).toContain('function');
		});

		it('should return guidance when query is missing', async () => {
			const result = await service.executeSymbolSearch({});
			expect(result).toContain('requires');
		});

		it('should indicate when no symbols are found', async () => {
			const result = await service.executeSymbolSearch({ query: 'zzNonExistent99' });
			expect(result).toContain('No symbols found');
		});
	});

	describe('executeFileOutline', () => {
		it('should return outline of a file', async () => {
			const result = await service.executeFileOutline({ path: 'example.ts' });
			expect(result).toContain('greet');
			expect(result).toContain('Calculator');
		});

		it('should return guidance when path is missing', async () => {
			const result = await service.executeFileOutline({});
			expect(result).toContain('requires');
		});
	});

	describe('executeFindReferences', () => {
		it('should find references to a symbol', async () => {
			const result = await service.executeFindReferences({ symbol: 'Calculator' });
			// Calculator is referenced in its own body
			expect(typeof result).toBe('string');
		});

		it('should return guidance when symbol is missing', async () => {
			const result = await service.executeFindReferences({});
			expect(result).toContain('requires');
		});
	});

	describe('executeSmartContext', () => {
		it('should extract context for a task', async () => {
			const result = await service.executeSmartContext({
				files: ['example.ts'],
				task: 'Add a multiply method to Calculator'
			});
			expect(result).toContain('Smart context');
		});

		it('should return guidance when task is missing', async () => {
			const result = await service.executeSmartContext({});
			expect(result).toContain('requires');
		});
	});

	describe('executeRequestContext', () => {
		it('should return file content at full level', async () => {
			const result = await service.executeRequestContext({
				level: 'full',
				target: 'example.ts'
			});
			expect(result).toContain('File: example.ts');
		});

		it('should return signatures at signatures level', async () => {
			const result = await service.executeRequestContext({
				level: 'signatures',
				target: 'example.ts'
			});
			expect(typeof result).toBe('string');
		});

		it('should return guidance when target is missing', async () => {
			const result = await service.executeRequestContext({});
			expect(result).toContain('requires');
		});
	});
});
