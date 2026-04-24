#!/usr/bin/env tsx
/**
 * Generates paired raw + RTK compression benchmark fixture files.
 *
 * Usage: pnpm gen:fixtures
 *
 * What it creates / updates:
 *  - TypeScript plugin: adds .rtk.txt files for tsc, vitest, pnpm, eslint, npm fixtures
 *  - Python plugin: creates fixtures/ dir with manifest + pytest synthetic fixtures
 *  - Updates manifests with skipForCombinations and measured RTK floor values
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const TS_FIXTURES = join(ROOT, 'packages/valora-plugin-compression-typescript/src/fixtures');
const PY_FIXTURES = join(ROOT, 'packages/valora-plugin-compression-python/src/fixtures');
const RTK_BIN = '/home/node/.local/bin/rtk';
const NODE_BIN = join(ROOT, 'node_modules/.bin');
const RTK_PKG_DIR = join(ROOT, 'packages/valora-plugin-rtk');

// ─── helpers ──────────────────────────────────────────────────────────────────

function ratioPct(rawChars: number, outputChars: number): number {
	return rawChars > 0 ? Math.round(((rawChars - outputChars) / rawChars) * 1000) / 10 : 0;
}

function rtkFloor(rawChars: number, rtkChars: number): number {
	return Math.max(0, Math.floor(ratioPct(rawChars, rtkChars)) - 10);
}

function runBin(bin: string, args: string[], cwd = ROOT): string {
	const result = spawnSync(bin, args, {
		cwd,
		encoding: 'utf-8',
		env: { ...process.env, PATH: `${NODE_BIN}:${process.env.PATH}` }
	});
	return ((result.stdout as string) ?? '') + ((result.stderr as string) ?? '');
}

const ANSI_RE = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g');

function stripAnsi(s: string): string {
	return s.replace(ANSI_RE, '');
}

function stripRtkMeta(s: string): string {
	return s
		.split('\n')
		.filter((l) => !l.startsWith('[full output: '))
		.join('\n')
		.trim();
}

function write(path: string, content: string): void {
	mkdirSync(resolve(path, '..'), { recursive: true });
	writeFileSync(path, content, 'utf-8');
	console.log(`  wrote ${path.replace(ROOT + '/', '')}`);
}

// ─── tsc RTK fixtures ─────────────────────────────────────────────────────────

function genTscRtk(): { traceRtk: string; tscRtk: string } {
	const tmpDir = mkdtempSync(join(tmpdir(), 'valora-tsc-gen-'));
	console.log(`\n[tsc] temp project: ${tmpDir}`);

	try {
		writeFileSync(
			join(tmpDir, 'tsconfig.json'),
			JSON.stringify(
				{
					compilerOptions: {
						module: 'ESNext',
						moduleResolution: 'bundler',
						noEmit: true,
						strict: true,
						target: 'ES2022'
					},
					include: ['src/**/*.ts']
				},
				null,
				2
			)
		);

		mkdirSync(join(tmpDir, 'src/executor'), { recursive: true });
		mkdirSync(join(tmpDir, 'src/plugins-src'), { recursive: true });
		mkdirSync(join(tmpDir, 'src/cli'), { recursive: true });

		// 6× TS2345 errors — calling functions with wrong argument types
		writeFileSync(
			join(tmpDir, 'src/executor/output-compression.service.ts'),
			[
				'function registerCompression(name: string, level: number): void { void name; void level; }',
				'function compress(source: string, output: string): void { void source; void output; }',
				'function setLimit(count: number): void { void count; }',
				'function validateFlag(enabled: boolean): void { void enabled; }',
				'',
				"registerCompression('gz', 'high');",
				"registerCompression('br', 'low');",
				"registerCompression('zstd', 'medium');",
				'compress(42, null as unknown as string);',
				"setLimit('threshold');",
				"validateFlag('enabled');"
			].join('\n')
		);

		// 3× TS2339 errors — accessing non-existent properties on typed values
		writeFileSync(
			join(tmpDir, 'src/plugins-src/strategies.ts'),
			[
				"const input: string = 'raw-data';",
				'const obj: object = {};',
				'const arr: string[] = [];',
				'',
				'// Property does not exist on type — TS2339',
				'input.output;',
				'obj.match;',
				'arr.nonExistent;'
			].join('\n')
		);

		// 2× TS2454 errors — variable used before being assigned
		writeFileSync(
			join(tmpDir, 'src/executor/stage-executor.ts'),
			[
				'function runTask(): string {',
				'  let result: string;',
				'  return result;',
				'}',
				'',
				'function measure(): number {',
				'  let metrics: number;',
				'  return metrics;',
				'}'
			].join('\n')
		);

		// 2× more TS2345 in tool-execution
		writeFileSync(
			join(tmpDir, 'src/executor/tool-execution.service.ts'),
			['function setCount(n: number): void { void n; }', "setCount('rawLength');", "setCount('bufferSize');"].join('\n')
		);

		// 1× TS2345 in cli
		writeFileSync(
			join(tmpDir, 'src/cli/index.ts'),
			[
				'function run(n: number): void { void n; }',
				"const args: string[] = ['--config', '--verbose'];",
				'run(args);'
			].join('\n')
		);

		const rawOutput = stripAnsi(runBin(join(NODE_BIN, 'tsc'), ['--noEmit', '--pretty'], tmpDir)).trim();
		console.log(`  tsc: ${rawOutput.split('\n').at(-1)}`);

		const tscRtk = stripRtkMeta(runBin(RTK_BIN, ['tsc', '--noEmit'], tmpDir));
		console.log(`  rtk tsc: ${tscRtk.split('\n').at(-1)?.trim()}`);

		// traceResolution — minimal project importing a module not installed
		const traceDir = mkdtempSync(join(tmpdir(), 'valora-trace-gen-'));
		writeFileSync(
			join(traceDir, 'tsconfig.json'),
			JSON.stringify(
				{
					compilerOptions: {
						module: 'ESNext',
						moduleResolution: 'bundler',
						noEmit: true,
						strict: true,
						target: 'ES2022'
					},
					include: ['src/**/*.ts']
				},
				null,
				2
			)
		);
		mkdirSync(join(traceDir, 'src'), { recursive: true });
		writeFileSync(
			join(traceDir, 'src/analysis.types.ts'),
			["import type { Spreadable } from 'tslib';", 'export type Result = Spreadable;'].join('\n')
		);

		const traceRtk = stripRtkMeta(runBin(RTK_BIN, ['tsc', '--noEmit', '--traceResolution'], traceDir));
		console.log(`  rtk tsc --traceResolution: ${traceRtk.split('\n').at(-1)?.trim()}`);

		rmSync(traceDir, { recursive: true });

		return { traceRtk, tscRtk };
	} finally {
		rmSync(tmpDir, { recursive: true });
	}
}

// ─── pnpm RTK fixture ─────────────────────────────────────────────────────────

function genPnpmRtk(): string {
	const tmpDir = mkdtempSync(join(tmpdir(), 'valora-pnpm-gen-'));
	console.log(`\n[pnpm] temp project: ${tmpDir}`);

	try {
		writeFileSync(
			join(tmpDir, 'package.json'),
			JSON.stringify(
				{
					dependencies: {
						'is-array': '1.0.1',
						'is-even': '1.0.0',
						'is-number': '7.0.0',
						'is-odd': '3.0.1',
						'is-string': '1.0.1'
					},
					name: 'rtk-fixture-project',
					version: '1.0.0'
				},
				null,
				2
			)
		);

		const rtkOutput = stripRtkMeta(runBin(RTK_BIN, ['pnpm', 'install'], tmpDir));
		console.log(
			`  rtk pnpm install:\n${rtkOutput
				.split('\n')
				.map((l) => '    ' + l)
				.join('\n')}`
		);

		return rtkOutput;
	} finally {
		rmSync(tmpDir, { recursive: true });
	}
}

// ─── vitest RTK fixture ───────────────────────────────────────────────────────

function genVitestRtk(): string {
	console.log(`\n[vitest] running rtk vitest run in valora-plugin-rtk…`);
	const output = stripRtkMeta(runBin(RTK_BIN, ['vitest', 'run'], RTK_PKG_DIR));
	console.log(`  rtk vitest: ${output}`);
	return output;
}

// ─── synthetic RTK files ──────────────────────────────────────────────────────

function buildEslintRtk(): string {
	return [
		'/workspaces/valora/src/analysis/code-analyser.ts',
		'  no-unused-vars (6 errors), no-floating-promises (4 errors), complexity (3 errors)',
		'/workspaces/valora/src/batch/batch-processor.ts',
		'  no-unused-vars (4 errors), no-floating-promises (3 errors), no-console (5 warnings)',
		'/workspaces/valora/src/cli/command-handler.ts',
		'  no-unused-vars (3 errors), no-floating-promises (3 errors), complexity (2 errors)',
		'/workspaces/valora/src/executor/output-compression.service.ts',
		'  no-unused-vars (3 errors), no-floating-promises (2 errors), complexity (2 errors)',
		'/workspaces/valora/src/session/store.ts',
		'  no-unused-vars (2 errors), no-floating-promises (2 errors)',
		'',
		'52 problems (47 errors, 5 warnings)'
	].join('\n');
}

function buildNpmRtk(): string {
	return [
		'++++++++++++++++++++++++++++++++++++++++++++++++++++++',
		'added 842 packages (34s)',
		'+ @types/node@20.11.5',
		'+ @types/react@18.2.48',
		'+ @types/react-dom@18.2.18',
		'+ typescript@5.3.3',
		'+ eslint@8.56.0',
		'[47 more packages]',
		'3 vulnerabilities (1 moderate, 2 high)'
	].join('\n');
}

function buildWatchRtk(): string {
	return [
		"src/executor/output-compression.service.ts(12,5): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.",
		"src/session/store.ts(34,3): error TS2339: Property 'flush' does not exist on type 'SessionStore'.",
		'═══════════════════════════════════════',
		'TypeScript: 2 errors in 2 files (watching)',
		'Top codes: TS2345 (1x), TS2339 (1x)'
	].join('\n');
}

// ─── Python fixtures (synthetic) ──────────────────────────────────────────────

function buildPytestAllpass(): string {
	const tests = [
		'PASSED tests/test_auth.py::test_login_valid_credentials',
		'PASSED tests/test_auth.py::test_login_invalid_credentials',
		'PASSED tests/test_auth.py::test_logout_clears_session',
		'PASSED tests/test_auth.py::test_register_new_user',
		'PASSED tests/test_auth.py::test_register_duplicate_email',
		'PASSED tests/test_auth.py::test_token_expiry',
		'PASSED tests/test_auth.py::test_refresh_token',
		'PASSED tests/test_user.py::test_get_user_by_id',
		'PASSED tests/test_user.py::test_update_user_profile',
		'PASSED tests/test_user.py::test_delete_user',
		'PASSED tests/test_user.py::test_list_users_paginated',
		'PASSED tests/test_user.py::test_search_users_by_email',
		'PASSED tests/test_service.py::test_process_valid_input',
		'PASSED tests/test_service.py::test_process_empty_input',
		'PASSED tests/test_service.py::test_process_large_dataset',
		'PASSED tests/test_service.py::test_transform_data_format',
		'PASSED tests/test_service.py::test_validate_schema',
		'PASSED tests/test_service.py::test_filter_results',
		'PASSED tests/test_service.py::test_sort_by_date',
		'PASSED tests/test_service.py::test_sort_by_name',
		'PASSED tests/test_api.py::test_get_endpoint_returns_200',
		'PASSED tests/test_api.py::test_post_endpoint_creates_resource',
		'PASSED tests/test_api.py::test_put_endpoint_updates_resource',
		'PASSED tests/test_api.py::test_delete_endpoint_removes_resource',
		'PASSED tests/test_api.py::test_get_nonexistent_returns_404',
		'PASSED tests/test_api.py::test_unauthorized_returns_401',
		'PASSED tests/test_api.py::test_forbidden_returns_403',
		'PASSED tests/test_api.py::test_rate_limiting',
		'PASSED tests/test_db.py::test_connection_pool',
		'PASSED tests/test_db.py::test_transaction_commit',
		'PASSED tests/test_db.py::test_transaction_rollback',
		'PASSED tests/test_db.py::test_query_with_filter',
		'PASSED tests/test_db.py::test_bulk_insert',
		'PASSED tests/test_db.py::test_bulk_update',
		'PASSED tests/test_db.py::test_concurrent_writes',
		'PASSED tests/test_cache.py::test_cache_hit',
		'PASSED tests/test_cache.py::test_cache_miss',
		'PASSED tests/test_cache.py::test_cache_expiry',
		'PASSED tests/test_cache.py::test_cache_invalidation',
		'PASSED tests/test_utils.py::test_format_date',
		'PASSED tests/test_utils.py::test_parse_config',
		'PASSED tests/test_utils.py::test_validate_email',
		'PASSED tests/test_utils.py::test_sanitize_input',
		'PASSED tests/test_utils.py::test_generate_uuid',
		'PASSED tests/test_utils.py::test_hash_password'
	].join('\n');

	return [
		'============================= test session starts ==============================',
		'platform linux -- Python 3.11.0, pytest-7.4.0, pluggy-1.3.0',
		'rootdir: /workspaces/myproject',
		'collected 45 items',
		'',
		tests,
		'',
		'============================== 45 passed in 4.23s =============================='
	].join('\n');
}

function buildPytestMixed(): string {
	const passing = [
		'PASSED tests/test_auth.py::test_login_valid_credentials',
		'PASSED tests/test_auth.py::test_logout_clears_session',
		'PASSED tests/test_auth.py::test_register_new_user',
		'PASSED tests/test_user.py::test_get_user_by_id',
		'PASSED tests/test_user.py::test_update_user_profile',
		'PASSED tests/test_user.py::test_list_users_paginated',
		'PASSED tests/test_service.py::test_process_valid_input',
		'PASSED tests/test_service.py::test_process_empty_input',
		'PASSED tests/test_service.py::test_transform_data_format',
		'PASSED tests/test_api.py::test_get_endpoint_returns_200',
		'PASSED tests/test_api.py::test_get_nonexistent_returns_404',
		'PASSED tests/test_api.py::test_unauthorized_returns_401',
		'PASSED tests/test_db.py::test_connection_pool',
		'PASSED tests/test_db.py::test_transaction_commit',
		'PASSED tests/test_db.py::test_query_with_filter'
	].join('\n');

	const failing = [
		'FAILED tests/test_service.py::test_process_invalid',
		'',
		'tests/test_service.py::test_process_invalid',
		'  def test_process_invalid():',
		'      result = process_value(-1)',
		'>     assert result == 0',
		'E     AssertionError: assert 42 == 0',
		'E     where 42 = process_value(-1)',
		'',
		'FAILED tests/test_service.py::test_validate_overflow',
		'',
		'tests/test_service.py::test_validate_overflow',
		'  def test_validate_overflow():',
		'      value = compute_max(100)',
		'>     assert value <= 100',
		'E     AssertionError: assert 999 <= 100',
		'',
		'FAILED tests/test_db.py::test_concurrent_writes_conflict',
		'',
		'tests/test_db.py::test_concurrent_writes_conflict',
		'  def test_concurrent_writes_conflict():',
		'      with session.begin():',
		'>         db.write(record, db.write(record))',
		'E     AssertionError: deadlock detected'
	].join('\n');

	return [
		'============================= test session starts ==============================',
		'platform linux -- Python 3.11.0, pytest-7.4.0, pluggy-1.3.0',
		'rootdir: /workspaces/myproject',
		'collected 18 items',
		'',
		passing,
		failing,
		'',
		'=========================== short test summary info ============================',
		'FAILED tests/test_service.py::test_process_invalid - AssertionError: assert 42 == 0',
		'FAILED tests/test_service.py::test_validate_overflow - AssertionError: assert 999 <= 100',
		'FAILED tests/test_db.py::test_concurrent_writes_conflict - AssertionError: deadlock detected',
		'=================== 3 failed, 15 passed in 2.15s =============================='
	].join('\n');
}

// ─── manifest types and helpers ───────────────────────────────────────────────

interface ManifestEntry {
	category: string;
	expectedRatioFloor: Record<string, number>;
	id: string;
	originatingCommand: string;
	path: string;
	preservation: {
		mustContainAll?: string[];
		mustContainCount?: Record<string, number>;
		mustNotDrop?: string[];
		skipForCombinations?: string[];
	};
}

function readManifest(dir: string): ManifestEntry[] {
	return JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf-8')) as ManifestEntry[];
}

function withRtkFloors(entry: ManifestEntry, rtkChars: number, allInnerRtkChars: number): ManifestEntry {
	const rawChars = readFileSync(join(TS_FIXTURES, entry.path), 'utf-8').length;

	return {
		...entry,
		expectedRatioFloor: {
			...entry.expectedRatioFloor,
			'all-inner+rtk': rtkFloor(rawChars, allInnerRtkChars),
			'rtk-only': rtkFloor(rawChars, rtkChars)
		},
		preservation: {
			...entry.preservation,
			skipForCombinations: ['rtk-only', 'all-inner+rtk']
		}
	};
}

function writeManifest(dir: string, entries: ManifestEntry[]): void {
	writeFileSync(join(dir, 'manifest.json'), JSON.stringify(entries, null, '\t') + '\n', 'utf-8');
	console.log(`  updated ${dir.replace(ROOT + '/', '')}/manifest.json`);
}

// Estimate how many chars remain after the TypeScript plugin groups RTK errors by code.
function estimateAllInnerRtkChars(rtkContent: string): number {
	const lines = rtkContent.split('\n');
	const codeCount = new Map<string, number>();
	const kept: string[] = [];

	for (const line of lines) {
		const m = line.match(/: error (TS\d+):/);
		if (!m) {
			kept.push(line);
			continue;
		}
		const code = m[1] ?? '';
		const n = (codeCount.get(code) ?? 0) + 1;
		codeCount.set(code, n);
		if (n <= 3) kept.push(line);
		else if (n === 4) kept.push(`  ... (more ${code} errors)`);
	}

	return kept.join('\n').length;
}

// Estimate chars after the Python plugin collapses PASSED lines.
function estimateFilterPythonChars(content: string): number {
	const lines = content.split('\n');
	const kept: string[] = [];
	let passCount = 0;

	const flush = (): void => {
		if (passCount > 0) {
			kept.push(`[${passCount} tests passed]`);
			passCount = 0;
		}
	};

	for (const line of lines) {
		const isPass = /^\s*(PASSED|\.)\s*$/.test(line) || /\s+PASSED$/.test(line) || /^\s*PASSED\s+/.test(line);
		const isFail = /^\s*(FAILED|F\s|ERROR)/.test(line);
		const isSummary = /^(=+|FAILED|ERROR|passed|failed|error|warnings summary|short test)/.test(line);

		if (isFail) {
			flush();
			kept.push(line);
		} else if (isPass) {
			passCount++;
		} else if (isSummary) {
			flush();
			kept.push(line);
		} else {
			kept.push(line);
		}
	}
	flush();
	return kept.join('\n').length;
}

// ─── main ─────────────────────────────────────────────────────────────────────

console.log('Generating compression benchmark fixtures…\n');

// 1. TSC RTK fixtures (real command output from temp project)
const { traceRtk, tscRtk } = genTscRtk();

write(join(TS_FIXTURES, 'typescript/tsc-noemit-pretty.rtk.txt'), tscRtk);
write(join(TS_FIXTURES, 'typescript/tsc-noemit-clean.rtk.txt'), tscRtk);
write(join(TS_FIXTURES, 'typescript/tsc-traceresolution.rtk.txt'), traceRtk);
write(join(TS_FIXTURES, 'typescript/tsc-watch-multiloop.rtk.txt'), buildWatchRtk());
write(join(TS_FIXTURES, 'mixed/pnpm-tsc-wrapper.rtk.txt'), tscRtk);

// 2. Pnpm RTK fixture (real command output)
const pnpmRtk = genPnpmRtk();
write(join(TS_FIXTURES, 'package-manager/pnpm-install-clean.rtk.txt'), pnpmRtk);

// 3. Vitest RTK fixture (real command output from valora-plugin-rtk package)
const vitestRtk = genVitestRtk();
write(join(TS_FIXTURES, 'test-runner/vitest-coverage.rtk.txt'), vitestRtk);

// 4. Synthetic RTK fixtures
const npmRtk = buildNpmRtk();
const eslintRtk = buildEslintRtk();
const watchRtk = buildWatchRtk();
write(join(TS_FIXTURES, 'package-manager/npm-install-many.rtk.txt'), npmRtk);
write(join(TS_FIXTURES, 'eslint/eslint-stylish-violations.rtk.txt'), eslintRtk);

// 5. Python fixtures (synthetic)
console.log('\n[python] creating synthetic pytest fixtures…');
const pytestAllpass = buildPytestAllpass();
const pytestMixed = buildPytestMixed();
write(join(PY_FIXTURES, 'pytest/pytest-allpass.txt'), pytestAllpass);
write(join(PY_FIXTURES, 'pytest/pytest-mixed.txt'), pytestMixed);

// 6. Python manifest
const pyManifest: ManifestEntry[] = [
	{
		category: 'test-runner',
		expectedRatioFloor: {
			'all-inner': rtkFloor(pytestAllpass.length, estimateFilterPythonChars(pytestAllpass)),
			'all-inner+rtk': 0,
			'python-only': rtkFloor(pytestAllpass.length, estimateFilterPythonChars(pytestAllpass)),
			raw: 0,
			'rtk-only': 0,
			'typescript-only': 0,
			'universal-only': 0
		},
		id: 'pytest-allpass',
		originatingCommand: 'pytest',
		path: 'pytest/pytest-allpass.txt',
		preservation: {
			mustContainAll: ['45 passed in', 'collected 45 items'],
			mustNotDrop: ['45 passed in']
		}
	},
	{
		category: 'test-runner',
		expectedRatioFloor: {
			'all-inner': rtkFloor(pytestMixed.length, estimateFilterPythonChars(pytestMixed)),
			'all-inner+rtk': 0,
			'python-only': rtkFloor(pytestMixed.length, estimateFilterPythonChars(pytestMixed)),
			raw: 0,
			'rtk-only': 0,
			'typescript-only': 0,
			'universal-only': 0
		},
		id: 'pytest-mixed',
		originatingCommand: 'pytest',
		path: 'pytest/pytest-mixed.txt',
		preservation: {
			mustContainAll: ['3 failed, 15 passed', 'short test summary info', 'AssertionError'],
			mustNotDrop: ['FAILED tests/test_service.py::test_process_invalid']
		}
	}
];
writeManifest(PY_FIXTURES, pyManifest);

// 7. Update TypeScript manifest with skipForCombinations and RTK floors
console.log('\n[manifest] updating TypeScript fixtures manifest…');

type RtkSizeEntry = { allInnerRtkChars: number; rtkChars: number };
const rtkSizes: Record<string, RtkSizeEntry> = {
	'eslint-stylish-violations': { allInnerRtkChars: eslintRtk.length, rtkChars: eslintRtk.length },
	'npm-install-many': { allInnerRtkChars: npmRtk.length, rtkChars: npmRtk.length },
	'pnpm-install-clean': { allInnerRtkChars: pnpmRtk.length, rtkChars: pnpmRtk.length },
	'pnpm-tsc-wrapper': {
		allInnerRtkChars: estimateAllInnerRtkChars(tscRtk),
		rtkChars: tscRtk.length
	},
	'tsc-noemit-clean': {
		allInnerRtkChars: estimateAllInnerRtkChars(tscRtk),
		rtkChars: tscRtk.length
	},
	'tsc-noemit-pretty': {
		allInnerRtkChars: estimateAllInnerRtkChars(tscRtk),
		rtkChars: tscRtk.length
	},
	'tsc-traceresolution': {
		allInnerRtkChars: estimateAllInnerRtkChars(traceRtk),
		rtkChars: traceRtk.length
	},
	'tsc-watch-multiloop': {
		allInnerRtkChars: estimateAllInnerRtkChars(watchRtk),
		rtkChars: watchRtk.length
	},
	'vitest-coverage': { allInnerRtkChars: vitestRtk.length, rtkChars: vitestRtk.length }
};

const updatedTsManifest = readManifest(TS_FIXTURES).map((entry) => {
	const sizes = rtkSizes[entry.id];
	if (!sizes) return entry;
	return withRtkFloors(entry, sizes.rtkChars, sizes.allInnerRtkChars);
});
writeManifest(TS_FIXTURES, updatedTsManifest);

// ─── summary ──────────────────────────────────────────────────────────────────

console.log('\n✓ Done. Run `pnpm bench:compression` to verify.\n');
console.log('RTK compression ratios (vs raw fixture files):');
const tsManifestForSummary = readManifest(TS_FIXTURES);
for (const [id, sizes] of Object.entries(rtkSizes)) {
	const entry = tsManifestForSummary.find((e) => e.id === id);
	if (!entry) continue;
	const rawChars = readFileSync(join(TS_FIXTURES, entry.path), 'utf-8').length;
	const ratio = ratioPct(rawChars, sizes.rtkChars);
	console.log(`  ${id}: ${ratio}% (raw ${rawChars} → rtk ${sizes.rtkChars})`);
}
for (const entry of pyManifest) {
	const rawChars = readFileSync(join(PY_FIXTURES, entry.path), 'utf-8').length;
	const compressedChars = estimateFilterPythonChars(readFileSync(join(PY_FIXTURES, entry.path), 'utf-8'));
	const ratio = ratioPct(rawChars, compressedChars);
	console.log(`  ${entry.id}: python-only ${ratio}% (raw ${rawChars} → compressed ${compressedChars})`);
}
