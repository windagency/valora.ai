import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import type { BenchmarkReport } from './lib/runner';
import { runBenchmark } from './lib/runner';

const FIXTURES_DIRS = [
	resolve(import.meta.dirname, '../../../packages/valora-plugin-compression-universal/src/fixtures'),
	resolve(import.meta.dirname, '../../../packages/valora-plugin-compression-typescript/src/fixtures'),
	resolve(import.meta.dirname, '../../../packages/valora-plugin-compression-python/src/fixtures')
];
const REPORTS_DIR = resolve(import.meta.dirname, 'reports');

let report: BenchmarkReport;

// Run the benchmark once and cache the result for all assertions.
async function getReport(): Promise<BenchmarkReport> {
	if (!report) {
		report = await runBenchmark({ fixturesDirs: FIXTURES_DIRS });
	}
	return report;
}

describe('compression benchmark', () => {
	describe('preservation: essential content survives compression', () => {
		it('all fixture rows marked ok have preserved:true', async () => {
			const r = await getReport();
			const violations: string[] = [];

			for (const fixture of r.fixtures) {
				for (const row of fixture.rows) {
					if (row.status === 'ok' && !row.preserved) {
						violations.push(`${fixture.fixture.id} / ${row.combination}`);
					}
				}
			}

			expect(violations, `Preservation failures:\n${violations.join('\n')}`).toHaveLength(0);
		});
	});

	describe('ratio floors: no regression below committed minimums', () => {
		it('each fixture/combination meets its expectedRatioFloor', async () => {
			const r = await getReport();
			const violations: string[] = [];

			for (const fixture of r.fixtures) {
				const floors = fixture.fixture.expectedRatioFloor;
				for (const row of fixture.rows) {
					if (row.status !== 'ok') continue;
					const floor = floors[row.combination] ?? 0;
					if (row.ratioPct < floor) {
						violations.push(`${fixture.fixture.id}/${row.combination}: ${row.ratioPct}% < floor ${floor}%`);
					}
				}
			}

			expect(violations, `Ratio floor violations:\n${violations.join('\n')}`).toHaveLength(0);
		});
	});

	afterAll(async () => {
		if (process.env['WRITE_BENCHMARK_REPORT'] !== 'true') return;

		const r = await getReport();
		const timestamp = r.timestamp.replace(/[:.]/g, '-');
		const dir = join(REPORTS_DIR, timestamp);
		await mkdir(dir, { recursive: true });
		await writeFile(join(dir, 'report.json'), JSON.stringify(r, null, 2), 'utf-8');
		await writeFile(join(REPORTS_DIR, 'latest.json'), JSON.stringify(r, null, 2), 'utf-8');

		const md = buildMarkdown(r);
		await writeFile(join(dir, 'report.md'), md, 'utf-8');
	});
});

function buildMarkdown(r: BenchmarkReport): string {
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
