import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DocValidator } from '../src/lint/doc-validator.js';
import { DocGardenerService } from '../src/maintenance/doc-gardener.service.js';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const docsDir = path.join(repoRoot, 'docs');
const STALENESS_THRESHOLD_DAYS = 90;

const validator = new DocValidator({ stalenessThresholdDays: STALENESS_THRESHOLD_DAYS });
const svc = new DocGardenerService(validator);
const report = await svc.garden(docsDir);

let issues = 0;

if (report.stale.length > 0) {
	console.error(`\nStale / missing frontmatter (${report.stale.length}):`);
	for (const e of report.stale) {
		console.error(`  [STALE] ${e.file}`);
		console.error(`    ${e.message}`);
		console.error(`    Remedy: ${e.remedy}`);
		issues++;
	}
}

if (report.broken.length > 0) {
	console.error(`\nBroken links (${report.broken.length}):`);
	for (const e of report.broken) {
		console.error(`  [BROKEN] ${e.file}`);
		console.error(`    ${e.message}`);
		console.error(`    Remedy: ${e.remedy}`);
		issues++;
	}
}

if (issues === 0) {
	console.log(`✓ ${report.scannedFiles} docs scanned — garden healthy`);
	process.exit(0);
} else {
	console.error(`\n✗ ${issues} issue(s) across ${report.scannedFiles} docs`);
	process.exit(1);
}
