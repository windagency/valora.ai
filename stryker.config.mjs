// @ts-check
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
	_comment:
		'Mutation testing with Stryker. Run with: pnpm test:mutation or pnpm test:mutation:utils',

	// Explicitly load plugins (required for pnpm symlinked node_modules)
	plugins: ['@stryker-mutator/vitest-runner'],

	testRunner: 'vitest',
	vitest: {
		// Use a focused config that only runs co-located unit tests (not integration/e2e)
		configFile: 'vitest.mutation.config.ts'
	},

	// Mutate only source files that have co-located unit tests.
	// Modules with unit tests (from `find src -name "*.test.ts"`):
	//   utils(10) services(8) exploration(4) config(3) cli(3) output(2) llm(2)
	mutate: [
		'src/utils/*.ts',
		'src/services/**/*.ts',
		'src/exploration/**/*.ts',
		'src/config/**/*.ts',
		'src/cli/**/*.ts',
		'src/output/**/*.ts',
		'src/llm/**/*.ts',
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
