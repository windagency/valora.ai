#!/usr/bin/env tsx
/**
 * Standalone compression benchmark runner.
 *
 * Usage:
 *   pnpm bench:compression           # run, print summary to stdout
 *   WRITE_BENCHMARK_REPORT=true pnpm bench:compression   # also write JSON+MD reports
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBenchmark } from 'tests/benchmarks/compression/lib/runner';

const SCRIPT_DIR = resolve(fileURLToPath(import.meta.url), '..');
const FIXTURES_DIR = resolve(SCRIPT_DIR, '../tests/fixtures/compression');
const REPORTS_DIR = resolve(SCRIPT_DIR, '../tests/benchmarks/compression/reports');

const report = await runBenchmark({ fixturesDir: FIXTURES_DIR });

// ── Tabular summary ───────────────────────────────────────────────────────────

console.log(`\n# Compression Benchmark  ${report.timestamp}\n`);

for (const fixture of report.fixtures) {
	console.log(`## ${fixture.fixture.id}  (${fixture.fixture.category})`);
	console.log(`   command: ${fixture.fixture.originatingCommand}`);
	console.log(`   raw chars: ${fixture.rawChars}\n`);

	const pad = (s: string, n: number) => s.padEnd(n);
	const padL = (s: string, n: number) => s.padStart(n);

	const header = `   ${pad('combination', 22)} ${padL('out chars', 10)} ${padL('ratio%', 7)} ${padL('saved tkns', 11)} ${pad('pres', 5)} status`;
	const sep = `   ${'-'.repeat(22)} ${'-'.repeat(10)} ${'-'.repeat(7)} ${'-'.repeat(11)} ${'-'.repeat(5)} ------`;
	console.log(header);
	console.log(sep);

	for (const row of fixture.rows) {
		if (row.status === 'unavailable') {
			console.log(
				`   ${pad(row.combination, 22)} ${'—'.padStart(10)} ${'—'.padStart(7)} ${'—'.padStart(11)} ${'—'.padStart(5)} unavailable`
			);
		} else {
			const pres = row.preserved ? '✓' : '✗';
			console.log(
				`   ${pad(row.combination, 22)} ${padL(String(row.outputChars), 10)} ${padL(String(row.ratioPct) + '%', 7)} ${padL(String(row.estimatedSavedTokens), 11)} ${padL(pres, 5)} ok`
			);
		}
	}
	console.log();
}

// ── Report files (opt-in) ─────────────────────────────────────────────────────

if (process.env['WRITE_BENCHMARK_REPORT'] === 'true') {
	const timestamp = report.timestamp.replace(/[:.]/g, '-');
	const dir = join(REPORTS_DIR, timestamp);
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, 'report.json'), JSON.stringify(report, null, 2), 'utf-8');
	await writeFile(join(REPORTS_DIR, 'latest.json'), JSON.stringify(report, null, 2), 'utf-8');

	const md = buildMarkdown(report);
	await writeFile(join(dir, 'report.md'), md, 'utf-8');

	console.log(`Reports written to: ${dir}`);
}

function buildMarkdown(r: typeof report): string {
	const lines: string[] = [`# Compression Benchmark Report`, ``, `Generated: ${r.timestamp}`, ``];

	for (const fixture of r.fixtures) {
		lines.push(`## Fixture: \`${fixture.fixture.id}\` (${fixture.fixture.category})`);
		lines.push(``);
		lines.push(`**Command:** \`${fixture.fixture.originatingCommand}\` | **Raw chars:** ${fixture.rawChars}`);
		lines.push(``);
		lines.push(`| Combination | Output chars | Ratio % | Saved tokens | Preserved | Status |`);
		lines.push(`|---|---:|---:|---:|:---:|---|`);

		for (const row of fixture.rows) {
			if (row.status === 'unavailable') {
				lines.push(`| ${row.combination} | — | — | — | — | unavailable |`);
			} else {
				const preserved = row.preserved ? '✓' : '✗';
				lines.push(
					`| ${row.combination} | ${row.outputChars} | ${row.ratioPct}% | ${row.estimatedSavedTokens} | ${preserved} | ok |`
				);
			}
		}
		lines.push(``);
	}

	return lines.join('\n');
}
