import { describe, expect, it } from 'vitest';

import type { LLMCompletionOptions, LLMCompletionResult } from 'types/llm.types';

import { BaseLLMProvider } from 'llm/provider.interface';

import { RecordingLLMProvider, ReplayLLMProvider } from './recording.provider';

const makeResult = (content: string, model = 'test-model'): LLMCompletionResult => ({
	content,
	model,
	role: 'assistant'
});

const makeOptions = (prompt: string): LLMCompletionOptions => ({
	messages: [{ content: prompt, role: 'user' }]
});

class FakeProvider extends BaseLLMProvider {
	name = 'fake';
	private readonly responses: LLMCompletionResult[];
	private callIndex = 0;

	constructor(...responses: LLMCompletionResult[]) {
		super({});
		this.responses = responses;
	}

	async complete(): Promise<LLMCompletionResult> {
		return this.responses[this.callIndex++]!;
	}

	async streamComplete(_opts: LLMCompletionOptions, onChunk: (c: string) => void): Promise<LLMCompletionResult> {
		const result = await this.complete(_opts);
		onChunk(result.content);
		return result;
	}

	override isConfigured(): boolean {
		return true;
	}
}

describe('RecordingLLMProvider', () => {
	it('delegates complete() to the wrapped provider', async () => {
		const inner = new FakeProvider(makeResult('hello'));
		const recorder = new RecordingLLMProvider(inner);

		const result = await recorder.complete(makeOptions('hi'));
		expect(result.content).toBe('hello');
	});

	it('records each call as a transcript entry', async () => {
		const inner = new FakeProvider(makeResult('answer1'), makeResult('answer2'));
		const recorder = new RecordingLLMProvider(inner);

		await recorder.complete(makeOptions('q1'));
		await recorder.complete(makeOptions('q2'));

		const transcript = recorder.getTranscript();
		expect(transcript).toHaveLength(2);
		expect(transcript[0]!.response.content).toBe('answer1');
		expect(transcript[1]!.response.content).toBe('answer2');
	});

	it('stores the request options in each transcript entry', async () => {
		const inner = new FakeProvider(makeResult('response'));
		const recorder = new RecordingLLMProvider(inner);

		const opts = makeOptions('test prompt');
		await recorder.complete(opts);

		const [entry] = recorder.getTranscript();
		expect(entry!.request.messages[0]!.content).toBe('test prompt');
	});

	it('exposes the wrapped provider name', () => {
		const inner = new FakeProvider();
		const recorder = new RecordingLLMProvider(inner);
		expect(recorder.name).toBe('fake');
	});

	it('getTranscript returns a copy — mutations do not affect internal state', async () => {
		const inner = new FakeProvider(makeResult('r'));
		const recorder = new RecordingLLMProvider(inner);
		await recorder.complete(makeOptions('q'));

		const t1 = recorder.getTranscript();
		t1.splice(0);

		expect(recorder.getTranscript()).toHaveLength(1);
	});
});

describe('ReplayLLMProvider', () => {
	it('replays recorded responses in order', async () => {
		const transcript = [
			{ request: makeOptions('q1'), response: makeResult('a1') },
			{ request: makeOptions('q2'), response: makeResult('a2') }
		];
		const replay = new ReplayLLMProvider(transcript);

		const r1 = await replay.complete(makeOptions('q1'));
		const r2 = await replay.complete(makeOptions('q2'));

		expect(r1.content).toBe('a1');
		expect(r2.content).toBe('a2');
	});

	it('throws when transcript is exhausted', async () => {
		const transcript = [{ request: makeOptions('q'), response: makeResult('a') }];
		const replay = new ReplayLLMProvider(transcript);

		await replay.complete(makeOptions('q'));
		await expect(replay.complete(makeOptions('extra'))).rejects.toThrow(/exhausted/i);
	});

	it('is always considered configured', () => {
		expect(new ReplayLLMProvider([]).isConfigured()).toBe(true);
	});
});
