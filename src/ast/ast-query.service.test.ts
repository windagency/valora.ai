/**
 * AST Query Service Tests
 */

import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ASTIndexService, resetASTIndexService, getASTIndexService } from './ast-index.service';
import { findReferences, generateCodebaseMap, getFileOutline, searchSymbols } from './ast-query.service';

function gitInit(dir: string): void {
	execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
}

function gitAdd(dir: string, pattern: string): void {
	execFileSync('git', ['add', pattern], { cwd: dir, stdio: 'ignore' });
}

describe('AST Query Service', () => {
	let testDir: string;

	beforeEach(async () => {
		resetASTIndexService();
		testDir = join(tmpdir(), `valora-query-test-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });
		gitInit(testDir);

		// Create test files
		writeFileSync(
			join(testDir, 'service.ts'),
			`
export class UserService {
	getUser(id: string) {
		return findById(id);
	}

	createUser(name: string) {
		return { id: '1', name };
	}
}

export interface User {
	id: string;
	name: string;
}

export type UserId = string;

function findById(id: string) {
	return { id, name: 'test' };
}
`
		);

		writeFileSync(
			join(testDir, 'controller.ts'),
			`
import { UserService } from './service';

export class UserController {
	handleGet(id: string) {
		const service = new UserService();
		return service.getUser(id);
	}
}
`
		);

		gitAdd(testDir, '.');

		const svc = getASTIndexService(testDir);
		await svc.buildIndex();
	});

	afterEach(() => {
		resetASTIndexService();
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	describe('searchSymbols', () => {
		it('should find symbols by exact name', () => {
			const results = searchSymbols('UserService');
			expect(results.length).toBeGreaterThanOrEqual(1);
			expect(results[0]!.symbol.name).toBe('UserService');
			expect(results[0]!.matchType).toBe('exact');
		});

		it('should find symbols by prefix', () => {
			const results = searchSymbols('User');
			expect(results.length).toBeGreaterThanOrEqual(1);
		});

		it('should filter by symbol kind', () => {
			const results = searchSymbols('User', { kind: 'interface' });
			const interfaces = results.filter((r) => r.symbol.kind === 'interface');
			expect(interfaces.length).toBeGreaterThanOrEqual(1);
		});

		it('should respect limit parameter', () => {
			const results = searchSymbols('User', { limit: 2 });
			expect(results.length).toBeLessThanOrEqual(2);
		});

		it('should return empty for no matches', () => {
			const results = searchSymbols('zzzNonExistent12345');
			expect(results).toEqual([]);
		});
	});

	describe('getFileOutline', () => {
		it('should return structured outline for a file', () => {
			const outline = getFileOutline('service.ts');
			expect(outline.length).toBeGreaterThanOrEqual(1);

			const classEntry = outline.find((e) => e.name === 'UserService');
			expect(classEntry).toBeDefined();
			expect(classEntry!.kind).toBe('class');
		});

		it('should return empty array for non-indexed file', () => {
			const outline = getFileOutline('nonexistent.ts');
			expect(outline).toEqual([]);
		});
	});

	describe('findReferences', () => {
		it('should find references to a symbol', () => {
			const refs = findReferences('UserService');
			expect(refs.length).toBeGreaterThanOrEqual(1);
		});

		it('should return empty array for unreferenced symbol', () => {
			const refs = findReferences('NonExistentSymbol12345');
			expect(refs).toEqual([]);
		});
	});

	describe('generateCodebaseMap', () => {
		it('should generate a map string', () => {
			const map = generateCodebaseMap();
			expect(map).toContain('Codebase Map');
			expect(typeof map).toBe('string');
		});

		it('should respect token budget', () => {
			const small = generateCodebaseMap(50);
			const large = generateCodebaseMap(5000);
			expect(small.length).toBeLessThanOrEqual(large.length);
		});
	});
});
