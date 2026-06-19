import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DocValidator } from '../src/lint/doc-validator.js';

const STALENESS_THRESHOLD_DAYS = 90;
const DEFAULT_DOCS_DIRNAME = 'documentation';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const targetArg = process.argv[2];
const docsDir = targetArg ? path.resolve(targetArg) : path.join(repoRoot, DEFAULT_DOCS_DIRNAME);

const validator = new DocValidator({ stalenessThresholdDays: STALENESS_THRESHOLD_DAYS });

let result;
try {
	result = await validator.validateDirectory(docsDir);
} catch (error) {
	const code = (error as NodeJS.ErrnoException).code;
	if (code === 'ENOENT') {
		console.error(`✗ Documentation directory does not exist: ${docsDir}`);
		console.error(`  Pass an explicit path as the first argument, or create the directory.`);
		process.exit(2);
	}
	throw error;
}

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
