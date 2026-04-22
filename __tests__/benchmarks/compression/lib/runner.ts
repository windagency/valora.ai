import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
	compressTerminalOutput,
	registerStrategy,
	resetCompressionStats,
	resetRegistry
} from 'executor/output-compression.service';

import { type PluginId, registerPlugins } from './register-plugins';

export interface BenchmarkReport {
	fixtures: FixtureResult[];
	timestamp: string;
}

export interface CompressionRow {
	combination: string;
	estimatedSavedTokens: number;
	outputChars: number;
	preserved: boolean;
	ratioPct: number;
	status: RowStatus;
}

export interface FixtureManifestEntry {
	category: string;
	expectedRatioFloor: Record<string, number>;
	id: string;
	originatingCommand: string;
	path: string;
	preservation: {
		mustContainAll?: string[];
		mustContainCount?: Record<string, number>;
		mustNotDrop?: string[];
		/** Combinations exempt from the preservation check (e.g. RTK reformats output entirely). */
		skipForCombinations?: string[];
	};
}

export interface FixtureResult {
	fixture: FixtureManifestEntry;
	rawChars: number;
	rows: CompressionRow[];
}

export type RowStatus = 'ok' | 'unavailable';

export interface RunnerOptions {
	fixturesDirs: string[];
}

interface Combination {
	name: string;
	plugins: Set<PluginId>;
	usesInner: boolean;
	usesRtk: boolean;
}

const COMBINATIONS: Combination[] = [
	{ name: 'raw', plugins: new Set<PluginId>(), usesInner: false, usesRtk: false },
	{ name: 'universal-only', plugins: new Set<PluginId>(['universal']), usesInner: true, usesRtk: false },
	{ name: 'typescript-only', plugins: new Set<PluginId>(['typescript']), usesInner: true, usesRtk: false },
	{ name: 'python-only', plugins: new Set<PluginId>(['python']), usesInner: true, usesRtk: false },
	{
		name: 'all-inner',
		plugins: new Set<PluginId>(['python', 'typescript', 'universal']),
		usesInner: true,
		usesRtk: false
	},
	{ name: 'rtk-only', plugins: new Set<PluginId>(), usesInner: false, usesRtk: true },
	{
		name: 'all-inner+rtk',
		plugins: new Set<PluginId>(['python', 'typescript', 'universal']),
		usesInner: true,
		usesRtk: true
	}
];

export async function runBenchmark(options: RunnerOptions): Promise<BenchmarkReport> {
	const { fixturesDirs } = options;
	const fixtureResults: FixtureResult[] = [];

	for (const fixturesDir of fixturesDirs) {
		const manifest: FixtureManifestEntry[] = JSON.parse(
			await readFile(join(fixturesDir, 'manifest.json'), 'utf-8')
		) as FixtureManifestEntry[];

		for (const entry of manifest) {
			const content = await readFile(join(fixturesDir, entry.path), 'utf-8');
			const rtkContent = await tryReadRtkFixture(fixturesDir, entry.path);
			fixtureResults.push(processFixture(entry, content, rtkContent));
		}
	}

	resetRegistry();

	return { fixtures: fixtureResults, timestamp: new Date().toISOString() };
}

function buildRow(
	combo: Combination,
	entry: FixtureManifestEntry,
	rawChars: number,
	content: string,
	rtkContent: null | string
): CompressionRow {
	if (combo.usesRtk && rtkContent === null) {
		return {
			combination: combo.name,
			estimatedSavedTokens: 0,
			outputChars: 0,
			preserved: false,
			ratioPct: 0,
			status: 'unavailable'
		};
	}

	resetRegistry();
	resetCompressionStats();
	if (combo.usesInner) registerPlugins(combo.plugins, registerStrategy);

	const output = resolveOutput(combo, entry.originatingCommand, content, rtkContent!);
	const ratioPct = rawChars > 0 ? Math.round(((rawChars - output.length) / rawChars) * 1000) / 10 : 0;
	const estimatedSavedTokens = Math.ceil(Math.max(0, rawChars - output.length) / 4);
	const skipPreservation = entry.preservation.skipForCombinations?.includes(combo.name) ?? false;
	const preserved = skipPreservation || checkPreservation(entry.preservation, output);

	return {
		combination: combo.name,
		estimatedSavedTokens,
		outputChars: output.length,
		preserved,
		ratioPct,
		status: 'ok'
	};
}

function checkPreservation(rules: FixtureManifestEntry['preservation'], output: string): boolean {
	if (rules.mustContainAll?.some((m) => !output.includes(m))) return false;
	if (rules.mustNotDrop?.some((m) => !output.includes(m))) return false;
	if (rules.mustContainCount) {
		for (const [marker, minCount] of Object.entries(rules.mustContainCount)) {
			if (countOccurrences(output, marker) < minCount) return false;
		}
	}
	return true;
}

function countOccurrences(text: string, marker: string): number {
	let count = 0;
	let idx = 0;
	while ((idx = text.indexOf(marker, idx)) !== -1) {
		count++;
		idx++;
	}
	return count;
}

function processFixture(entry: FixtureManifestEntry, content: string, rtkContent: null | string): FixtureResult {
	const rawChars = content.length;
	const rows = COMBINATIONS.map((combo) => buildRow(combo, entry, rawChars, content, rtkContent));
	return { fixture: entry, rawChars, rows };
}

function resolveOutput(combo: Combination, command: string, content: string, rtkContent: string): string {
	if (!combo.usesInner && !combo.usesRtk) return content;
	if (combo.usesRtk && !combo.usesInner) return rtkContent;
	return compressTerminalOutput(command, combo.usesRtk ? rtkContent : content);
}

async function tryReadRtkFixture(fixturesDir: string, fixturePath: string): Promise<null | string> {
	const rtkPath = join(fixturesDir, fixturePath.replace(/\.txt$/, '.rtk.txt'));
	try {
		return await readFile(rtkPath, 'utf-8');
	} catch {
		return null;
	}
}
