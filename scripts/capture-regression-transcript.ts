#!/usr/bin/env node
/**
 * Capture a regression transcript for a given scenario.
 *
 * Usage:
 *   pnpm tsx scripts/capture-regression-transcript.ts <scenario-id>
 *
 * The script runs the scenario against the live Anthropic provider,
 * records the full transcript, and appends a baseline entry to
 * data/regression-baselines.json.
 *
 * Requires ANTHROPIC_API_KEY in the environment.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

import type { RegressionBaseline, RegressionScenario } from '../src/regression/regression-runner';

import { AnthropicProvider } from '../src/llm/providers/anthropic.provider';
import { RecordingLLMProvider, type TranscriptEntry } from '../src/llm/providers/recording.provider';

const SCENARIOS_DIR = resolve(import.meta.dirname, '../__tests__/regression/scenarios');
const BASELINES_FILE = resolve(import.meta.dirname, '../data/regression-baselines.json');

async function main(): Promise<void> {
	const scenarioId = process.argv[2];
	if (!scenarioId) {
		console.error('Usage: capture-regression-transcript.ts <scenario-id>');
		process.exit(1);
	}

	const apiKey = process.env['ANTHROPIC_API_KEY'];
	if (!apiKey) {
		console.error('ANTHROPIC_API_KEY environment variable is required');
		process.exit(1);
	}

	const scenarioPath = resolve(SCENARIOS_DIR, `${scenarioId}.json`);
	let scenario: RegressionScenario;
	try {
		scenario = JSON.parse(readFileSync(scenarioPath, 'utf-8')) as RegressionScenario;
	} catch {
		console.error(`Scenario not found: ${scenarioPath}`);
		process.exit(1);
	}

	const provider = new AnthropicProvider({ apiKey });
	const recorder = new RecordingLLMProvider(provider);

	console.log(`Capturing transcript for scenario: ${scenarioId}`);
	const response = await recorder.complete({ messages: scenario.messages });
	console.log(`Response preview: ${response.content.slice(0, 100)}...`);

	const transcript: TranscriptEntry[] = recorder.getTranscript();

	const baselinesJson = JSON.parse(readFileSync(BASELINES_FILE, 'utf-8')) as {
		_comment: string;
		baselines: RegressionBaseline[];
	};

	const existing = baselinesJson.baselines.findIndex((b) => b.scenarioId === scenarioId);
	const entry: RegressionBaseline = {
		capturedAt: new Date().toISOString(),
		model: response.model ?? 'unknown',
		modelVersion: response.model ?? 'unknown',
		scenarioId,
		transcript
	};

	if (existing >= 0) {
		baselinesJson.baselines[existing] = entry;
		console.log(`Updated existing baseline for: ${scenarioId}`);
	} else {
		baselinesJson.baselines.push(entry);
		console.log(`Added new baseline for: ${scenarioId}`);
	}

	writeFileSync(BASELINES_FILE, JSON.stringify(baselinesJson, null, 2) + '\n');
	console.log(`Saved to ${BASELINES_FILE}`);
}

main().catch((err: unknown) => {
	console.error(err);
	process.exit(1);
});
