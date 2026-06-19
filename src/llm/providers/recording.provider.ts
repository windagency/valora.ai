/**
 * Recording and replay LLM providers for regression testing.
 *
 * RecordingLLMProvider wraps any real provider and captures every request/response
 * pair into an in-memory transcript.  ReplayLLMProvider takes a saved transcript
 * and returns the recorded responses in order — no network calls needed.
 *
 * These are test-only implementations and must not be registered with the
 * production provider registry.
 */

import type { LLMCompletionOptions, LLMCompletionResult } from 'types/llm.types';

import { BaseLLMProvider } from 'llm/provider.interface';

export interface TranscriptEntry {
	request: LLMCompletionOptions;
	response: LLMCompletionResult;
}

/**
 * Wraps a real LLMProvider and records every complete() call.
 * After execution, retrieve the transcript with getTranscript().
 */
export class RecordingLLMProvider extends BaseLLMProvider {
	get name(): string {
		return this.inner.name;
	}

	private readonly transcript: TranscriptEntry[] = [];

	constructor(private readonly inner: BaseLLMProvider) {
		super({});
	}

	async complete(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
		const response = await this.inner.complete(options);
		this.transcript.push({ request: options, response });
		return response;
	}

	override getAlternativeModels(currentModel?: string): string[] {
		return this.inner.getAlternativeModels(currentModel);
	}

	override isConfigured(): boolean {
		return this.inner.isConfigured();
	}

	async streamComplete(options: LLMCompletionOptions, onChunk: (chunk: string) => void): Promise<LLMCompletionResult> {
		const response = await this.inner.streamComplete(options, onChunk);
		this.transcript.push({ request: options, response });
		return response;
	}

	override async validateModel(modelName: string): Promise<boolean> {
		return this.inner.validateModel(modelName);
	}

	/** Returns a shallow copy of the recorded transcript. */
	getTranscript(): TranscriptEntry[] {
		return [...this.transcript];
	}
}

/**
 * Replays a pre-recorded transcript in order.
 * Throws when the transcript is exhausted — a signal that the scenario
 * made more LLM calls than the baseline captured.
 */
export class ReplayLLMProvider extends BaseLLMProvider {
	name = 'replay';
	private callIndex = 0;

	constructor(private readonly transcript: TranscriptEntry[]) {
		super({});
	}

	complete(_options: LLMCompletionOptions): Promise<LLMCompletionResult> {
		if (this.callIndex >= this.transcript.length) {
			return Promise.reject(
				new Error(
					`ReplayLLMProvider transcript exhausted after ${this.transcript.length} call(s). ` +
						`The scenario made more LLM calls than the baseline captured.`
				)
			);
		}
		return Promise.resolve(this.transcript[this.callIndex++]!.response);
	}

	override getAlternativeModels(): string[] {
		return [];
	}

	override isConfigured(): boolean {
		return true;
	}

	async streamComplete(options: LLMCompletionOptions, onChunk: (chunk: string) => void): Promise<LLMCompletionResult> {
		const result = await this.complete(options);
		onChunk(result.content);
		return result;
	}

	override validateModel(): Promise<boolean> {
		return Promise.resolve(true);
	}
}
