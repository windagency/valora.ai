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

import { XAIProvider } from './xai.provider';

describe('XAIProvider — descriptor registration', () => {
	it('registers a descriptor with label "xAI"', () => {
		expect(getProviderRegistry().getDescriptor('xai')?.label).toBe('xAI');
	});

	it('registers a descriptor with requiresApiKey: true', () => {
		expect(getProviderRegistry().getDescriptor('xai')?.requiresApiKey).toBe(true);
	});

	it('registers grok-4.3 as the default model', () => {
		expect(getProviderRegistry().getDescriptor('xai')?.defaultModel).toBe('grok-4.3');
	});

	it('exposes the grok-4.3 frontier model in modelModes', () => {
		const models = getProviderRegistry()
			.getDescriptor('xai')
			?.modelModes.map((mm) => mm.model);
		expect(models).toContain('grok-4.3');
	});
});

describe('XAIProvider — configuration', () => {
	it('is configured when an API key is present', () => {
		expect(new XAIProvider({ apiKey: 'test-key' }).isConfigured()).toBe(true);
	});

	it('is not configured without an API key', () => {
		expect(new XAIProvider({}).isConfigured()).toBe(false);
	});

	it('accepts models following the grok-* naming convention', async () => {
		const provider = new XAIProvider({ apiKey: 'test-key' });
		await expect(provider.validateModel('grok-4.3')).resolves.toBe(true);
		await expect(provider.validateModel('grok-some-future-model')).resolves.toBe(true);
		await expect(provider.validateModel('gpt-5')).resolves.toBe(false);
	});
});

describe('XAIProvider', () => {
	let provider: XAIProvider;
	const options: LLMCompletionOptions = {
		messages: [{ content: 'Hello', role: 'user' }],
		model: 'grok-4.3'
	};

	beforeEach(() => {
		mockCreate.mockReset();
		vi.mocked(checkRateLimit).mockClear();
		vi.mocked(getRateLimitStatus).mockClear();
		provider = new XAIProvider({ apiKey: 'test-key' });
	});

	describe('complete()', () => {
		it('returns the completion content, finish_reason, model, and usage from a successful response', async () => {
			mockCreate.mockResolvedValueOnce({
				choices: [{ finish_reason: 'stop', message: { content: 'Hi there!', tool_calls: undefined } }],
				model: 'grok-4.3',
				usage: { completion_tokens: 5, prompt_tokens: 10, total_tokens: 15 }
			});

			const result = await provider.complete(options);

			expect(result).toEqual({
				content: 'Hi there!',
				finish_reason: 'stop',
				model: 'grok-4.3',
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
				model: 'grok-4.3',
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
				model: 'grok-4.3',
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

			await expect(provider.complete(options)).rejects.toThrow(/xAI API rate limit exceeded/);
			expect(mockCreate).not.toHaveBeenCalled();
		});

		it('wraps a repeated "no choices" failure as a generic xAI API error after retries are exhausted', async () => {
			vi.useFakeTimers();
			try {
				mockCreate.mockResolvedValue({ choices: [], model: 'grok-4.3', usage: undefined });

				const pending = provider.complete(options);
				pending.catch(() => {});
				await vi.runAllTimersAsync();

				await expect(pending).rejects.toThrow('xAI API returned no choices in response');
			} finally {
				vi.useRealTimers();
			}
		});

		it('scrubs a credential leaked in an upstream error message before it reaches the thrown ProviderError', async () => {
			const leakedKey = 'sk-xai-fake-key-for-test-abcdefghijklmnopqrstuvwxyz1234567890';
			mockCreate.mockRejectedValue(
				new Error(`upstream 500: {"error": "internal", "leaked_context_key": "${leakedKey}"}`)
			);

			try {
				await provider.complete(options);
				expect.unreachable('complete() should have thrown');
			} catch (error) {
				expect((error as Error).message).not.toContain(leakedKey);
				expect((error as Error).message).toMatch(/xAI API error/);
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

		it('wraps an upstream failure as an xAI streaming error, scrubbing any leaked credential', async () => {
			const leakedKey = 'sk-xai-fake-key-for-test-abcdefghijklmnopqrstuvwxyz1234567890';
			mockCreate.mockRejectedValue(new Error(`socket hang up: ${leakedKey}`));

			try {
				await provider.streamComplete(options, () => {});
				expect.unreachable('streamComplete() should have thrown');
			} catch (error) {
				expect((error as Error).message).not.toContain(leakedKey);
				expect((error as Error).message).toMatch(/xAI streaming error/);
			}
		});
	});
});
