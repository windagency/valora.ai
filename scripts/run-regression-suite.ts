#!/usr/bin/env node
/**
 * Run the regression suite against the live LLM provider.
 *
 * Usage:
 *   pnpm regression
 *
 * Exits non-zero when any scenario deviates from its baseline.
 * Deviations are also appended to .valora/drift-alerts.jsonl for
 * dashboard display.
 *
 * Requires ANTHROPIC_API_KEY in the environment.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

import { AnthropicProvider } from '../src/llm/providers/anthropic.provider';
import {
	type RegressionBaseline,
	RegressionRunner,
	type RegressionScenario
} from '../src/regression/regression-runner';

const ROOT = resolve(import.meta.dirname, '..');
const SCENARIOS_DIR = resolve(ROOT, '__tests__/regression/scenarios');
const BASELINES_FILE = resolve(ROOT, 'data/regression-baselines.json');
const DRIFT_ALERTS_DIR = resolve(ROOT, '.valora');
const DRIFT_ALERTS_FILE = resolve(DRIFT_ALERTS_DIR, 'drift-alerts.jsonl');

function loadBaselines(): RegressionBaseline[] {
	const data = JSON.parse(readFileSync(BASELINES_FILE, 'utf-8')) as {
		baselines: RegressionBaseline[];
	};
	return data.baselines;
}

function loadScenarios(): RegressionScenario[] {
	const { readdirSync } = require('fs') as typeof import('fs');
	return readdirSync(SCENARIOS_DIR)
		.filter((f: string) => f.endsWith('.json'))
		.map((f: string) => JSON.parse(readFileSync(resolve(SCENARIOS_DIR, f), 'utf-8')) as RegressionScenario);
}

async function main(): Promise<void> {
	const apiKey = process.env['ANTHROPIC_API_KEY'];
	if (!apiKey) {
		console.error('ANTHROPIC_API_KEY environment variable is required');
		process.exit(1);
	}

	const scenarios = loadScenarios();
	const baselines = loadBaselines();

	if (baselines.length === 0) {
		console.warn('No baselines found. Run capture-regression-transcript.ts first.');
		console.log('Skipping all scenarios (no baselines).');
		process.exit(0);
	}

	const provider = new AnthropicProvider({ apiKey });
	const runner = new RegressionRunner(baselines, 0.3);

	const results = await runner.run(scenarios, async (messages) => {
		return provider.complete({ messages });
	});

	console.log(`\nRegression suite results:`);
	console.log(`  Passed:   ${results.passed.length}`);
	console.log(`  Skipped:  ${results.skipped.length} (no baseline)`);
	console.log(`  Drifted:  ${results.deviations.length}`);

	if (results.deviations.length > 0) {
		console.log('\nDeviations:');
		for (const d of results.deviations) {
			console.error(`  ✗ ${d.scenarioId}: ${d.reason}`);
		}

		// Append to drift-alerts.jsonl
		if (!existsSync(DRIFT_ALERTS_DIR)) {
			mkdirSync(DRIFT_ALERTS_DIR, { recursive: true });
		}
		const alertLines = results.deviations
			.map((d) =>
				JSON.stringify({
					detectedAt: new Date().toISOString(),
					reason: d.reason,
					scenarioId: d.scenarioId,
					similarity: d.similarity ?? null
				})
			)
			.join('\n');
		writeFileSync(DRIFT_ALERTS_FILE, alertLines + '\n', { flag: 'a' });
		console.log(`\nDrift alerts appended to ${DRIFT_ALERTS_FILE}`);

		process.exit(1);
	}

	console.log('\nAll scenarios passed.');
}

main().catch((err: unknown) => {
	console.error(err);
	process.exit(1);
});
