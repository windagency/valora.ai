import type { TranscriptEntry } from 'llm/providers/recording.provider';
import type { LLMCompletionResult, LLMMessage } from 'types/llm.types';

export interface OutputShape {
	minLength: number;
	mustContainAny: string[];
}

export interface RegressionBaseline {
	capturedAt: string;
	model: string;
	modelVersion: string;
	scenarioId: string;
	transcript: TranscriptEntry[];
}

export interface RegressionDeviation {
	reason: string;
	scenarioId: string;
	similarity?: number;
}

export interface RegressionRunResult {
	deviations: RegressionDeviation[];
	passed: string[];
	skipped: string[];
}

export interface RegressionScenario {
	description: string;
	expectedOutputShape: OutputShape;
	id: string;
	messages: LLMMessage[];
}

/**
 * Word-level Jaccard similarity between two strings.
 * Used as a soft structural similarity check — not cryptographic.
 */
export function jaccardWordSimilarity(a: string, b: string): number {
	const tokenise = (s: string): Set<string> =>
		new Set(
			s
				.toLowerCase()
				.split(/\s+/)
				.filter((t) => t.length > 0)
		);

	const setA = tokenise(a);
	const setB = tokenise(b);

	const intersection = [...setA].filter((t) => setB.has(t)).length;
	const union = new Set([...setA, ...setB]).size;

	return union === 0 ? 0 : intersection / union;
}

/**
 * Returns true when content satisfies the given output shape constraints.
 */
type LLMCallFn = (messages: LLMMessage[]) => Promise<LLMCompletionResult>;

export function meetsOutputShape(content: string, shape: OutputShape): boolean {
	if (content.length < shape.minLength) return false;
	if (shape.mustContainAny.length > 0) {
		const lower = content.toLowerCase();
		if (!shape.mustContainAny.some((term) => lower.includes(term.toLowerCase()))) return false;
	}
	return true;
}

/**
 * Runs regression scenarios against a provided LLM call function,
 * comparing results to stored baselines.
 */
export class RegressionRunner {
	constructor(
		private readonly baselines: RegressionBaseline[],
		/** Jaccard similarity threshold — deviations reported below this value */
		private readonly similarityThreshold: number = 0.3
	) {}

	async run(scenarios: RegressionScenario[], llmCall: LLMCallFn): Promise<RegressionRunResult> {
		const passed: string[] = [];
		const skipped: string[] = [];
		const deviations: RegressionDeviation[] = [];

		for (const scenario of scenarios) {
			const baseline = this.baselines.find((b) => b.scenarioId === scenario.id);

			if (!baseline) {
				skipped.push(scenario.id);
				continue;
			}

			const result = await llmCall(scenario.messages);

			if (!meetsOutputShape(result.content, scenario.expectedOutputShape)) {
				deviations.push({
					reason: `Output shape check failed: content does not meet minLength or mustContainAny constraints`,
					scenarioId: scenario.id
				});
				continue;
			}

			const baselineContent = baseline.transcript.map((e) => e.response.content).join(' ');
			const similarity = jaccardWordSimilarity(result.content, baselineContent);

			if (similarity < this.similarityThreshold) {
				deviations.push({
					reason: `Similarity ${similarity.toFixed(3)} is below threshold ${this.similarityThreshold}`,
					scenarioId: scenario.id,
					similarity
				});
				continue;
			}

			passed.push(scenario.id);
		}

		return { deviations, passed, skipped };
	}
}
