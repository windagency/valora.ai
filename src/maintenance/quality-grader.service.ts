import type { DomainGrade } from './maintenance.types';

export class QualityGraderService {
	private readonly grades: Map<string, DomainGrade>;

	constructor(initialGrades: DomainGrade[]) {
		this.grades = new Map(initialGrades.map((g) => [g.domain, { ...g }]));
	}

	getGrade(domain: string): DomainGrade | undefined {
		return this.grades.get(domain);
	}

	getGrades(): DomainGrade[] {
		return [...this.grades.values()];
	}

	updateGrade(domain: string, score: number): void {
		const existing = this.grades.get(domain);
		if (!existing) return;
		this.grades.set(domain, {
			...existing,
			lastUpdated: new Date().toISOString().slice(0, 10),
			score
		});
	}
}
