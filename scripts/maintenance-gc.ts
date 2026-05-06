import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { GoldenPrinciple } from '../src/maintenance/maintenance.types.js';

import { GoldenPrinciplesScannerService } from '../src/maintenance/golden-principles-scanner.service.js';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const principlesFile = path.join(repoRoot, 'docs', 'quality', 'golden-principles.json');
const srcDir = path.join(repoRoot, 'src');

const principles: GoldenPrinciple[] = JSON.parse(fs.readFileSync(principlesFile, 'utf-8')) as GoldenPrinciple[];
const svc = new GoldenPrinciplesScannerService(principles);

function walkTs(dir: string): string[] {
	const results: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory() && !entry.name.startsWith('__') && entry.name !== 'node_modules') {
			results.push(...walkTs(full));
		} else if (
			entry.isFile() &&
			entry.name.endsWith('.ts') &&
			!entry.name.endsWith('.test.ts') &&
			!entry.name.endsWith('.spec.ts')
		) {
			results.push(full);
		}
	}
	return results;
}

const files = walkTs(srcDir);
let totalViolations = 0;

for (const file of files) {
	const code = fs.readFileSync(file, 'utf-8');
	const rel = path.relative(repoRoot, file);
	const violations = svc.scanCode(code, rel);
	for (const v of violations) {
		console.error(`[${v.principleId}] ${v.file}`);
		console.error(`  Remedy: ${v.remedy}`);
		totalViolations++;
	}
}

if (totalViolations === 0) {
	console.log('✓ No golden principle violations found');
	process.exit(0);
} else {
	console.error(`\n✗ ${totalViolations} golden principle violation(s) found`);
	process.exit(1);
}
