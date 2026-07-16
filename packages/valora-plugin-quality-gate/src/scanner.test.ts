import * as fs from 'node:fs';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { scan } from './scanner.js';
import type { AuditConfig } from './scanner.types.js';

const FIXTURES = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../__tests__/fixtures');

const baseConfig: AuditConfig = {
	concerns: ['error-boundary', 'retry', 'circuit-breaker', 'timeout', 'logging', 'metrics'],
	densityFloor: 1.0,
	depth: 2,
	exclude: [],
	threshold: 3
};

describe('scan — clean fixture', () => {
	it('returns totalViolations 0 and empty siblingGroups when no violations exist', async () => {
		const report = await scan(path.join(FIXTURES, 'clean'), baseConfig);
		expect(report.summary.totalViolations).toBe(0);
		expect(report.siblingGroups).toHaveLength(0);
	});
});

describe('scan — violations fixture', () => {
	it('detects a sibling group under infrastructure/', async () => {
		const report = await scan(path.join(FIXTURES, 'violations'), baseConfig);
		const group = report.siblingGroups.find((g) => g.parentPath.endsWith('infrastructure'));
		expect(group?.parentPath).toBe('infrastructure');
	});

	it('flags concern patterns present in N >= threshold siblings', async () => {
		const report = await scan(path.join(FIXTURES, 'violations'), baseConfig);
		const group = report.siblingGroups.find((g) => g.parentPath.endsWith('infrastructure'));
		expect(group!.violations.length).toBeGreaterThan(0);
	});

	it('flags the shared nats import across all four siblings', async () => {
		const report = await scan(path.join(FIXTURES, 'violations'), baseConfig);
		const group = report.siblingGroups.find((g) => g.parentPath.endsWith('infrastructure'));
		const importViolation = group?.violations.find((v) => v.concern === 'import');
		expect(importViolation?.affectedSiblings.slice().sort()).toEqual(['discord', 'llm', 'telegram', 'tts']);
		expect(importViolation!.affectedSiblings.length).toBeGreaterThanOrEqual(3);
	});

	it('assigns high severity when N >= threshold + 2', async () => {
		// threshold=2, 4 siblings → N(4) >= threshold+2(4) → high
		const report = await scan(path.join(FIXTURES, 'violations'), { ...baseConfig, threshold: 2 });
		const group = report.siblingGroups.find((g) => g.parentPath.endsWith('infrastructure'));
		expect(group?.violations.some((v) => v.severity === 'high')).toBe(true);
	});

	it('assigns medium severity when N === threshold + 1', async () => {
		// threshold=3, 4 siblings → N(4) === threshold+1(4) → medium
		const report = await scan(path.join(FIXTURES, 'violations'), { ...baseConfig, threshold: 3 });
		const group = report.siblingGroups.find((g) => g.parentPath.endsWith('infrastructure'));
		expect(group?.violations.some((v) => v.severity === 'medium')).toBe(true);
	});

	it('sets suggestedExtractionPath to {parentPath}/shared/{concern} for every violation', async () => {
		const report = await scan(path.join(FIXTURES, 'violations'), baseConfig);
		const group = report.siblingGroups.find((g) => g.parentPath.endsWith('infrastructure'));
		for (const v of group?.violations ?? []) {
			expect(v.suggestedExtractionPath).toBe(`${group!.parentPath}/shared/${v.concern}`);
		}
	});

	it('respects the exclude list and skips matching siblings', async () => {
		const report = await scan(path.join(FIXTURES, 'violations'), {
			...baseConfig,
			exclude: ['telegram', 'discord', 'llm', 'tts']
		});
		expect(report.summary.totalViolations).toBe(0);
	});
});

describe('scan — IO resilience', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync('/tmp/valora-audit-test-');
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { force: true, recursive: true });
	});

	it('adds a warning for an unreadable sibling directory and continues', async () => {
		if (process.getuid?.() === 0) return; // root bypasses chmod — skip

		const infraDir = path.join(tmpDir, 'infra');
		fs.mkdirSync(path.join(infraDir, 'a'), { recursive: true });
		fs.mkdirSync(path.join(infraDir, 'b'), { recursive: true });
		fs.mkdirSync(path.join(infraDir, 'c'), { recursive: true });
		fs.writeFileSync(path.join(infraDir, 'a', 'a.ts'), 'const x = 1;');
		fs.writeFileSync(path.join(infraDir, 'c', 'c.ts'), 'const z = 1;');
		fs.chmodSync(path.join(infraDir, 'b'), 0o000);

		const report = await scan(tmpDir, { ...baseConfig, depth: 1 });
		expect(report.warnings.length).toBeGreaterThan(0);

		fs.chmodSync(path.join(infraDir, 'b'), 0o755);
	});

	it('sets summary.note when no sibling groups are found at the configured depth', async () => {
		// empty dir → no siblings → no parent groups
		const report = await scan(tmpDir, { ...baseConfig, depth: 1 });
		expect(report.summary.totalViolations).toBe(0);
		expect(report.summary.note).toBe(`No sibling groups with violations found within depth 1 from ${tmpDir}`);
	});
});
