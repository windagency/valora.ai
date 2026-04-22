import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FixtureManifestEntry } from './runner';
import { runBenchmark } from './runner';

let tmp: string;

beforeEach(async () => {
	tmp = await mkdtemp(join(tmpdir(), 'compression-bench-'));
});

afterEach(async () => {
	await rm(tmp, { recursive: true, force: true });
});

async function writeFixture(relativePath: string, content: string): Promise<void> {
	const full = join(tmp, relativePath);
	await mkdir(dirname(full), { recursive: true });
	await writeFile(full, content, 'utf-8');
}

async function writeManifest(entries: FixtureManifestEntry[]): Promise<void> {
	await writeFile(join(tmp, 'manifest.json'), JSON.stringify(entries), 'utf-8');
}

const LONG = 'x'.repeat(600);

const SAMPLE_ENTRY: FixtureManifestEntry = {
	category: 'test',
	expectedRatioFloor: {},
	id: 'sample',
	originatingCommand: 'echo x',
	path: 'sample.txt',
	preservation: {}
};

describe('runBenchmark', () => {
	it('returns an empty fixtures list when the manifest is empty', async () => {
		await writeManifest([]);
		const report = await runBenchmark({ fixturesDirs: [tmp] });
		expect(report.fixtures).toHaveLength(0);
	});

	it('includes a timestamp in the report', async () => {
		await writeManifest([]);
		const report = await runBenchmark({ fixturesDirs: [tmp] });
		expect(report.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it('emits a row for each expected combination', async () => {
		await writeFixture('sample.txt', LONG);
		await writeManifest([SAMPLE_ENTRY]);

		const report = await runBenchmark({ fixturesDirs: [tmp] });
		const names = report.fixtures[0]!.rows.map((r) => r.combination);

		expect(names).toContain('raw');
		expect(names).toContain('universal-only');
		expect(names).toContain('typescript-only');
		expect(names).toContain('python-only');
		expect(names).toContain('all-inner');
	});

	it('marks RTK rows as unavailable when no .rtk.txt sibling exists', async () => {
		await writeFixture('sample.txt', LONG);
		await writeManifest([SAMPLE_ENTRY]);

		const report = await runBenchmark({ fixturesDirs: [tmp] });
		const rtkRows = report.fixtures[0]!.rows.filter((r) => r.combination.includes('rtk'));

		expect(rtkRows.length).toBeGreaterThan(0);
		rtkRows.forEach((r) => expect(r.status).toBe('unavailable'));
	});

	it('uses the .rtk.txt sibling when it exists', async () => {
		const rtkContent = 'rtk compressed output'.padEnd(600, ' ');
		await writeFixture('sample.txt', LONG);
		await writeFixture('sample.rtk.txt', rtkContent);
		await writeManifest([SAMPLE_ENTRY]);

		const report = await runBenchmark({ fixturesDirs: [tmp] });
		const rtkOnly = report.fixtures[0]!.rows.find((r) => r.combination === 'rtk-only');

		expect(rtkOnly?.status).toBe('ok');
		expect(rtkOnly?.outputChars).toBe(rtkContent.length);
	});

	it('raw row always has ratioPct of 0 and 0 saved tokens', async () => {
		await writeFixture('sample.txt', LONG);
		await writeManifest([SAMPLE_ENTRY]);

		const report = await runBenchmark({ fixturesDirs: [tmp] });
		const raw = report.fixtures[0]!.rows.find((r) => r.combination === 'raw')!;

		expect(raw.ratioPct).toBe(0);
		expect(raw.estimatedSavedTokens).toBe(0);
		expect(raw.status).toBe('ok');
	});

	it('sets preserved:false when mustContainAll requirement is not met', async () => {
		const content = 'some output without the required string'.padEnd(600, 'x');
		await writeFixture('sample.txt', content);
		await writeManifest([
			{
				...SAMPLE_ENTRY,
				preservation: { mustContainAll: ['REQUIRED_MARKER_XYZ'] }
			}
		]);

		const report = await runBenchmark({ fixturesDirs: [tmp] });
		report.fixtures[0]!.rows.filter((r) => r.status === 'ok').forEach((r) => expect(r.preserved).toBe(false));
	});

	it('sets preserved:false when mustNotDrop requirement is not met after compression', async () => {
		// Vitest all-pass pattern: '✓' lines are folded by the test-runner strategy,
		// so if we demand a specific pass line is preserved, it will be missing.
		const content = '✓ suite one\n✓ suite two\n✓ suite three\n'.padEnd(600, ' ');
		await writeFixture('sample.txt', content);
		await writeManifest([
			{
				...SAMPLE_ENTRY,
				originatingCommand: 'vitest run',
				preservation: { mustNotDrop: ['✓ suite one'] }
			}
		]);

		const report = await runBenchmark({ fixturesDirs: [tmp] });
		// The all-inner row runs filterTestRunner which folds '✓' lines
		const allInner = report.fixtures[0]!.rows.find((r) => r.combination === 'all-inner')!;
		expect(allInner.preserved).toBe(false);
	});

	it('sets preserved:true when all preservation rules pass', async () => {
		const content = 'Found 3 errors in 2 files.\nerror TS2345: argument mismatch\n'.padEnd(600, ' ');
		await writeFixture('sample.txt', content);
		await writeManifest([
			{
				...SAMPLE_ENTRY,
				originatingCommand: 'tsc --noEmit',
				preservation: {
					mustContainAll: ['Found 3 errors'],
					mustNotDrop: ['error TS2345']
				}
			}
		]);

		const report = await runBenchmark({ fixturesDirs: [tmp] });
		report.fixtures[0]!.rows.filter((r) => r.status === 'ok').forEach((r) => expect(r.preserved).toBe(true));
	});

	it('sets preserved:false when mustContainCount threshold is not met', async () => {
		const content = 'error TS2345: one occurrence\n'.padEnd(600, 'x');
		await writeFixture('sample.txt', content);
		await writeManifest([
			{
				...SAMPLE_ENTRY,
				originatingCommand: 'tsc --noEmit',
				preservation: { mustContainCount: { 'error TS2345': 5 } }
			}
		]);

		const report = await runBenchmark({ fixturesDirs: [tmp] });
		report.fixtures[0]!.rows.filter((r) => r.status === 'ok').forEach((r) => expect(r.preserved).toBe(false));
	});

	it('reports rawChars equal to the original fixture byte length', async () => {
		const content = 'hello world\n'.padEnd(700, 'a');
		await writeFixture('sample.txt', content);
		await writeManifest([SAMPLE_ENTRY]);

		const report = await runBenchmark({ fixturesDirs: [tmp] });
		expect(report.fixtures[0]!.rawChars).toBe(content.length);
	});

	it('estimatedSavedTokens is ceil((rawChars - outputChars) / 4)', async () => {
		await writeFixture('sample.txt', LONG);
		await writeManifest([SAMPLE_ENTRY]);

		const report = await runBenchmark({ fixturesDirs: [tmp] });
		for (const row of report.fixtures[0]!.rows.filter((r) => r.status === 'ok')) {
			const rawChars = report.fixtures[0]!.rawChars;
			const expected = Math.ceil(Math.max(0, rawChars - row.outputChars) / 4);
			expect(row.estimatedSavedTokens).toBe(expected);
		}
	});
});
