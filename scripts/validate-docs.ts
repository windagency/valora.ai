import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DocValidator } from '../src/lint/doc-validator.js';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const docsDir = path.join(repoRoot, 'docs');
const STALENESS_THRESHOLD_DAYS = 90;

const validator = new DocValidator({ stalenessThresholdDays: STALENESS_THRESHOLD_DAYS });
const result = await validator.validateDirectory(docsDir);

if (result.errors.length === 0) {
	console.log(`✓ ${result.scannedFiles} docs scanned — all healthy`);
	process.exit(0);
}

console.error(`\n✗ ${result.errors.length} issue(s) across ${result.scannedFiles} docs:\n`);

for (const error of result.errors) {
	console.error(`  [${error.kind.toUpperCase()}] ${error.file}`);
	console.error(`    Problem : ${error.message}`);
	console.error(`    Remedy  : ${error.remedy}\n`);
}

process.exit(1);
