// @ts-check
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
	_comment:
		'Mutation testing with Stryker. Run with: pnpm test:mutation or pnpm test:mutation:utils',

	// Explicitly load plugins (required for pnpm symlinked node_modules)
	plugins: ['@stryker-mutator/vitest-runner'],

	// .pnpm-store isn't in Stryker's default-ignored list (node_modules, .git,
	// /reports, *.tsbuildinfo, /stryker.log, .stryker-tmp) and churns during
	// normal pnpm operations — a file present when Stryker scans the directory
	// can be pruned before the copy step actually runs, failing the whole run
	// with an ENOENT race. It's never needed inside the sandbox anyway.
	ignorePatterns: ['.pnpm-store'],

	testRunner: 'vitest',
	vitest: {
		// Use a focused config that only runs co-located unit tests (not integration/e2e)
		configFile: 'vitest.mutation.config.ts'
	},

	// Mutate only source files that have co-located unit tests.
	// Modules with unit tests (from `find src -name "*.test.ts"`):
	//   utils(10) services(8) exploration(4) config(3) cli(3) output(2) llm(2)
	//
	// security/executor/plugins added 2026-07-11: these are the three directories the
	// test-suite audit found the worst anti-pattern findings in (audit-sink pollution,
	// implementation-detail testing reaching into private state, a trivially-passing
	// mock-fs symlink check) — mutation testing is the mechanical way to verify fixes in
	// this area actually strengthen the tests, not just read better.
	//
	// Baseline from first run (2026-07-11): plugins/ scored 57.85% overall (clears both
	// low/50 and break/40) — independently corroborated two audit findings:
	// conflict-resolver-config.ts scored 0.00% (11/11 survived — it has no test file at
	// all) and plugin-manifest.schema.ts scored 13.85% (matches the audit's "missing
	// coverage for 5 of its exports" finding).
	//
	// security/ and executor/ full baselines are NOT yet established — both confirmed
	// runnable (dry run passes; a stray-temp-dir issue that briefly blocked security/'s
	// dry run was a one-off local artifact, not a config problem), but security/ alone
	// is ~4900 mutants / ~30min and executor/ (46 source files, more than security/'s 11)
	// is larger still — too long to run inline here. Run both as a dedicated follow-up
	// with the mutation CI job's output as the source of truth once it lands; do not
	// assume `break: 40` is already cleared for either.
	mutate: [
		'src/utils/*.ts',
		'src/services/**/*.ts',
		'src/exploration/**/*.ts',
		'src/config/**/*.ts',
		'src/cli/**/*.ts',
		'src/output/**/*.ts',
		'src/llm/**/*.ts',
		'src/security/**/*.ts',
		'src/executor/**/*.ts',
		'src/plugins/**/*.ts',
		'!src/**/*.test.ts',
		'!src/**/*.spec.ts',
		'!src/**/index.ts',
		'!src/cli/index.ts',
		'!src/mcp/server.ts'
	],

	// Skip static mutants (module-level constant initializations):
	// they require running all tests per mutant and rarely catch real logic bugs
	ignoreStatic: true,

	// Reporters: clear-text in CI, HTML report for local review
	reporters: ['clear-text', 'progress', 'html'],
	htmlReporter: {
		fileName: 'reports/mutation/index.html'
	},

	// Thresholds — warn/fail based on mutation score:
	//   high  (green):  score >= 75%  → good coverage
	//   low   (yellow): score >= 50%  → acceptable, room to improve
	//   break (red):    score <  40%  → fail the build
	//
	// Baseline from first run (2026-03-08): input-validator.ts scored ~50%.
	// Raise thresholds as coverage improves.
	thresholds: {
		high: 75,
		low: 50,
		break: 40
	},

	// Parallelism: run 4 workers concurrently
	concurrency: 4,

	// Incremental mode: cache results between runs for faster re-runs
	incremental: true,
	incrementalFile: 'reports/stryker-incremental.json',

	// Timeout configuration
	timeoutMS: 60000,
	timeoutFactor: 1.5
};
