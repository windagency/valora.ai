import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LLMCompletionOptions } from 'types/llm.types';

const mockCreate = vi.fn();
vi.mock('openai', () => ({
	default: vi.fn().mockImplementation(() => ({
		chat: { completions: { create: mockCreate } }
	}))
}));

// Wrapped with vi.fn(actual) rather than fully mocked: real rate-limiting behaviour is
// exercised for every other test, only the dedicated rate-limit test overrides it.
vi.mock('utils/rate-limiter', async (importOriginal) => {
	const actual = await importOriginal<typeof import('utils/rate-limiter')>();
	return {
		...actual,
		checkRateLimit: vi.fn(actual.checkRateLimit),
		getRateLimitStatus: vi.fn(actual.getRateLimitStatus)
	};
});

import { getProviderRegistry } from 'llm/registry';
import { checkRateLimit, getRateLimitStatus } from 'utils/rate-limiter';

import { MoonshotProvider } from './moonshot.provider';

describe('MoonshotProvider — descriptor registration', () => {
	it('registers a descriptor with label "Moonshot"', () => {
		expect(getProviderRegistry().getDescriptor('moonshot')?.label).toBe('Moonshot');
	});

	it('registers a descriptor with requiresApiKey: true', () => {
		expect(getProviderRegistry().getDescriptor('moonshot')?.requiresApiKey).toBe(true);
	});

	it('registers kimi-k2.6 as the default model', () => {
		expect(getProviderRegistry().getDescriptor('moonshot')?.defaultModel).toBe('kimi-k2.6');
	});

	it('exposes the kimi-k2.6 and kimi-k2.7-code models in modelModes', () => {
		const models = getProviderRegistry()
			.getDescriptor('moonshot')
			?.modelModes.map((mm) => mm.model);
		expect(models).toContain('kimi-k2.6');
		expect(models).toContain('kimi-k2.7-code');
	});
});

describe('MoonshotProvider — configuration', () => {
	it('is configured when an API key is present', () => {
		expect(new MoonshotProvider({ apiKey: 'test-key' }).isConfigured()).toBe(true);
	});

	it('is not configured without an API key', () => {
		expect(new MoonshotProvider({}).isConfigured()).toBe(false);
	});

	it('accepts models following the kimi-* / moonshot-* naming conventions', async () => {
		const provider = new MoonshotProvider({ apiKey: 'test-key' });
		await expect(provider.validateModel('kimi-k2.6')).resolves.toBe(true);
		await expect(provider.validateModel('moonshot-v1-128k')).resolves.toBe(true);
		await expect(provider.validateModel('gpt-5')).resolves.toBe(false);
	});
});

describe('MoonshotProvider', () => {
	let provider: MoonshotProvider;
	const options: LLMCompletionOptions = {
		messages: [{ content: 'Hello', role: 'user' }],
		model: 'kimi-k2.6'
	};

	beforeEach(() => {
		mockCreate.mockReset();
		vi.mocked(checkRateLimit).mockClear();
		vi.mocked(getRateLimitStatus).mockClear();
		provider = new MoonshotProvider({ apiKey: 'test-key' });
	});

	describe('complete()', () => {
		it('returns the completion content, finish_reason, model, and usage from a successful response', async () => {
			mockCreate.mockResolvedValueOnce({
				choices: [{ finish_reason: 'stop', message: { content: 'Hi there!', tool_calls: undefined } }],
				model: 'kimi-k2.6',
				usage: { completion_tokens: 5, prompt_tokens: 10, total_tokens: 15 }
			});

			const result = await provider.complete(options);

			expect(result).toEqual({
				content: 'Hi there!',
				finish_reason: 'stop',
				model: 'kimi-k2.6',
				role: 'assistant',
				tool_calls: undefined,
				usage: { completion_tokens: 5, prompt_tokens: 10, total_tokens: 15 }
			});
		});

		it('parses valid tool call arguments', async () => {
			mockCreate.mockResolvedValueOnce({
				choices: [
					{
						finish_reason: 'tool_calls',
						message: {
							content: null,
							tool_calls: [{ function: { arguments: '{"city":"Paris"}', name: 'get_weather' }, id: 'call_1' }]
						}
					}
				],
				model: 'kimi-k2.6',
				usage: undefined
			});

			const result = await provider.complete(options);

			expect(result.tool_calls).toEqual([{ arguments: { city: 'Paris' }, id: 'call_1', name: 'get_weather' }]);
		});

		it('falls back to empty args when tool call arguments are malformed JSON, without throwing', async () => {
			mockCreate.mockResolvedValueOnce({
				choices: [
					{
						finish_reason: 'tool_calls',
						message: {
							content: null,
							tool_calls: [{ function: { arguments: '{not valid json', name: 'get_weather' }, id: 'call_1' }]
						}
					}
				],
				model: 'kimi-k2.6',
				usage: undefined
			});

			const result = await provider.complete(options);

			expect(result.tool_calls).toEqual([{ arguments: {}, id: 'call_1', name: 'get_weather' }]);
		});

		it('throws a rate-limit error and never calls the API when rate limited', async () => {
			vi.mocked(checkRateLimit).mockReturnValueOnce(false);
			vi.mocked(getRateLimitStatus).mockReturnValueOnce({
				allowed: false,
				remaining: 0,
				resetTime: Date.now() + 5000
			});

			await expect(provider.complete(options)).rejects.toThrow(/Moonshot API rate limit exceeded/);
			expect(mockCreate).not.toHaveBeenCalled();
		});

		it('wraps a repeated "no choices" failure as a generic Moonshot API error after retries are exhausted', async () => {
			vi.useFakeTimers();
			try {
				mockCreate.mockResolvedValue({ choices: [], model: 'kimi-k2.6', usage: undefined });

				const pending = provider.complete(options);
				pending.catch(() => {});
				await vi.runAllTimersAsync();

				await expect(pending).rejects.toThrow('Moonshot API returned no choices in response');
			} finally {
				vi.useRealTimers();
			}
		});

		it('scrubs a credential leaked in an upstream error message before it reaches the thrown ProviderError', async () => {
			const leakedKey = 'sk-moonshot-fake-key-for-test-abcdefghijklmnopqrstuvwxyz1234567890';
			mockCreate.mockRejectedValue(
				new Error(`upstream 500: {"error": "internal", "leaked_context_key": "${leakedKey}"}`)
			);

			await expect(provider.complete(options)).rejects.toThrow(/Moonshot API error/);
			try {
				await provider.complete(options);
				expect.unreachable('complete() should have thrown');
			} catch (error) {
				expect((error as Error).message).not.toContain(leakedKey);
			}
		});
	});

	describe('streamComplete()', () => {
		async function* fakeStream(chunks: Array<{ content?: string; finish_reason?: string; usage?: unknown }>) {
			for (const c of chunks) {
				yield {
					choices: [{ delta: { content: c.content }, finish_reason: c.finish_reason }],
					usage: c.usage
				};
			}
		}

		it('accumulates streamed content, calls onChunk for each piece, and returns the final result', async () => {
			mockCreate.mockResolvedValueOnce(
				fakeStream([
					{ content: 'Hel' },
					{ content: 'lo!', finish_reason: 'stop', usage: { completion_tokens: 2, prompt_tokens: 3, total_tokens: 5 } }
				])
			);
			const chunks: string[] = [];

			const result = await provider.streamComplete(options, (chunk) => chunks.push(chunk));

			expect(chunks).toEqual(['Hel', 'lo!']);
			expect(result).toEqual({
				content: 'Hello!',
				finish_reason: 'stop',
				role: 'assistant',
				usage: { completion_tokens: 2, prompt_tokens: 3, total_tokens: 5 }
			});
		});

		it('wraps an upstream failure as a Moonshot streaming error, scrubbing any leaked credential', async () => {
			const leakedKey = 'sk-moonshot-fake-key-for-test-abcdefghijklmnopqrstuvwxyz1234567890';
			mockCreate.mockRejectedValue(new Error(`socket hang up: ${leakedKey}`));

			await expect(provider.streamComplete(options, () => {})).rejects.toThrow(/Moonshot streaming error/);
			try {
				await provider.streamComplete(options, () => {});
				expect.unreachable('streamComplete() should have thrown');
			} catch (error) {
				expect((error as Error).message).not.toContain(leakedKey);
			}
		});
	});
});
