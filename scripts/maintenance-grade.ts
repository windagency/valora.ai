import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { DomainGrade } from '../src/maintenance/maintenance.types.js';

import { QualityGraderService } from '../src/maintenance/quality-grader.service.js';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const gradesFile = path.join(repoRoot, 'docs', 'quality', 'grades.json');

const grades: DomainGrade[] = JSON.parse(fs.readFileSync(gradesFile, 'utf-8')) as DomainGrade[];
const svc = new QualityGraderService(grades);

console.log('\nQuality Grades\n' + '─'.repeat(30));
for (const grade of svc.getGrades().sort((a, b) => b.score - a.score)) {
	const bar = '█'.repeat(Math.round(grade.score / 10)) + '░'.repeat(10 - Math.round(grade.score / 10));
	console.log(`  ${grade.domain.padEnd(12)} ${bar} ${grade.score}/100  (${grade.lastUpdated})`);
}
console.log('');
