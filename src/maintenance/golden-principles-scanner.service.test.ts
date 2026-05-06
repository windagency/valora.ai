import { describe, expect, it } from 'vitest';

import type { GoldenPrinciple } from './maintenance.types';
import { GoldenPrinciplesScannerService } from './golden-principles-scanner.service';

const GP_NO_ANY: GoldenPrinciple = {
	description: 'No (x as any) assertions in production code',
	id: 'GP-004',
	pattern: ' as any',
	remedy: 'Replace `as any` with a typed assertion or a proper interface'
};

describe('GoldenPrinciplesScannerService', () => {
	it('finds no violations in clean code', () => {
		const svc = new GoldenPrinciplesScannerService([GP_NO_ANY]);
		const violations = svc.scanCode('const x: string = getValue();', 'src/foo.ts');
		expect(violations).toHaveLength(0);
	});

	it('finds a violation matching a pattern', () => {
		const svc = new GoldenPrinciplesScannerService([GP_NO_ANY]);
		const violations = svc.scanCode('const x = getValue() as any;', 'src/foo.ts');
		expect(violations).toHaveLength(1);
		expect(violations[0]?.principleId).toBe('GP-004');
		expect(violations[0]?.file).toBe('src/foo.ts');
	});

	it('reports remedy message', () => {
		const svc = new GoldenPrinciplesScannerService([GP_NO_ANY]);
		const violations = svc.scanCode('doSomething(x as any)', 'src/bar.ts');
		expect(violations[0]?.remedy).toBe(GP_NO_ANY.remedy);
	});

	it('checks multiple principles', () => {
		const gp1: GoldenPrinciple = { description: 'test1', id: 'GP-001', pattern: 'badPattern1', remedy: 'fix1' };
		const gp2: GoldenPrinciple = { description: 'test2', id: 'GP-002', pattern: 'badPattern2', remedy: 'fix2' };
		const svc = new GoldenPrinciplesScannerService([gp1, gp2]);
		const violations = svc.scanCode('has badPattern1 and badPattern2', 'src/test.ts');
		expect(violations).toHaveLength(2);
	});
});
