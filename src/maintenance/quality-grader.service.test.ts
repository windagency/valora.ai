import { describe, expect, it } from 'vitest';

import type { DomainGrade } from './maintenance.types';
import { QualityGraderService } from './quality-grader.service';

const makeGrade = (overrides: Partial<DomainGrade> = {}): DomainGrade => ({
	domain: 'cli',
	lastUpdated: '2026-01-01',
	score: 80,
	...overrides
});

describe('QualityGraderService', () => {
	it('returns all grades', () => {
		const svc = new QualityGraderService([makeGrade({ domain: 'cli' }), makeGrade({ domain: 'memory' })]);
		expect(svc.getGrades()).toHaveLength(2);
	});

	it('returns grade by domain', () => {
		const svc = new QualityGraderService([makeGrade({ domain: 'executor', score: 72 })]);
		expect(svc.getGrade('executor')?.score).toBe(72);
	});

	it('returns undefined for unknown domain', () => {
		const svc = new QualityGraderService([]);
		expect(svc.getGrade('unknown')).toBeUndefined();
	});

	it('updates an existing grade', () => {
		const svc = new QualityGraderService([makeGrade({ domain: 'llm', score: 60 })]);
		svc.updateGrade('llm', 85);
		expect(svc.getGrade('llm')?.score).toBe(85);
	});

	it('sets lastUpdated when updating', () => {
		const svc = new QualityGraderService([makeGrade({ domain: 'llm' })]);
		const before = new Date().toISOString().slice(0, 10);
		svc.updateGrade('llm', 90);
		expect(svc.getGrade('llm')?.lastUpdated).toBe(before);
	});
});
