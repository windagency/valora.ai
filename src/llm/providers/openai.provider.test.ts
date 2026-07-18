import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LLMCompletionOptions } from 'types/llm.types';

const mockCreate = vi.fn();
vi.mock('openai', () => ({
	default: vi.fn().mockImplementation(() => ({
		chat: { completions: { create: mockCreate } }
	}))
}));

// Wrapped with vi.fn(actual) rather than fully mocked: real rate-limiting/circuit-breaker
// behaviour is exercised for every other test, only the one dedicated rate-limit test
// below overrides it — pre-exhausting the real 60-req/min bucket would be slow and brittle.
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

import { OpenAIProvider } from './openai.provider';

describe('OpenAIProvider — descriptor registration', () => {
	it('registers a descriptor with label "OpenAI"', () => {
		expect(getProviderRegistry().getDescriptor('openai')?.label).toBe('OpenAI');
	});

	it('registers a descriptor with requiresApiKey: true', () => {
		expect(getProviderRegistry().getDescriptor('openai')?.requiresApiKey).toBe(true);
	});

	it('registers a non-empty modelModes list', () => {
		expect(getProviderRegistry().getDescriptor('openai')?.modelModes.length ?? 0).toBeGreaterThan(0);
	});
});

describe('OpenAIProvider — configuration', () => {
	it('is configured when an API key is present', () => {
		expect(new OpenAIProvider({ apiKey: 'test-key' }).isConfigured()).toBe(true);
	});

	it('is not configured without an API key', () => {
		expect(new OpenAIProvider({}).isConfigured()).toBe(false);
	});
});

describe('OpenAIProvider — validateModel', () => {
	const provider = new OpenAIProvider({ apiKey: 'test-key' });

	it('accepts models from the known catalog', async () => {
		const [knownModel] =
			getProviderRegistry()
				.getDescriptor('openai')
				?.modelModes.map((mm) => mm.model) ?? [];
		expect(knownModel).toBeDefined();
		await expect(provider.validateModel(knownModel!)).resolves.toBe(true);
	});

	it.each(['gpt-5-super-future', 'o1-preview', 'o3-mini', 'o4-mini-future', 'ft:gpt-5:acme::abc123'])(
		'accepts unlisted models following a recognised naming convention (%s)',
		async (modelName) => {
			await expect(provider.validateModel(modelName)).resolves.toBe(true);
		}
	);

	it('rejects a model matching no known convention', async () => {
		await expect(provider.validateModel('llama-3-70b')).resolves.toBe(false);
	});
});

describe('OpenAIProvider — getAlternativeModels', () => {
	const provider = new OpenAIProvider({ apiKey: 'test-key' });

	it('excludes the given current model from the alternatives list', () => {
		const all = provider.getAlternativeModels();
		const [currentModel] = all;
		expect(currentModel).toBeDefined();

		const alternatives = provider.getAlternativeModels(currentModel);

		expect(alternatives).not.toContain(currentModel);
		expect(alternatives.length).toBe(all.length - 1);
	});

	it('returns the full known model list when no current model is given', () => {
		expect(provider.getAlternativeModels().length).toBeGreaterThan(0);
	});
});

describe('OpenAIProvider', () => {
	let provider: OpenAIProvider;
	const options: LLMCompletionOptions = {
		messages: [{ content: 'Hello', role: 'user' }],
		model: 'gpt-5'
	};

	beforeEach(() => {
		mockCreate.mockReset();
		vi.mocked(checkRateLimit).mockClear();
		vi.mocked(getRateLimitStatus).mockClear();
		provider = new OpenAIProvider({ apiKey: 'test-key' });
	});

	describe('complete()', () => {
		it('returns the completion content, finish_reason, model, and usage from a successful response', async () => {
			mockCreate.mockResolvedValueOnce({
				choices: [{ finish_reason: 'stop', message: { content: 'Hi there!', tool_calls: undefined } }],
				model: 'gpt-5',
				usage: { completion_tokens: 5, prompt_tokens: 10, total_tokens: 15 }
			});

			const result = await provider.complete(options);

			expect(result).toEqual({
				content: 'Hi there!',
				finish_reason: 'stop',
				model: 'gpt-5',
				role: 'assistant',
				tool_calls: undefined,
				usage: { completion_tokens: 5, prompt_tokens: 10, total_tokens: 15 }
			});
		});

		it('omits temperature and top_p for a reasoning model even when the caller sets them', async () => {
			mockCreate.mockResolvedValueOnce({
				choices: [{ finish_reason: 'stop', message: { content: 'Hi', tool_calls: undefined } }],
				model: 'o3',
				usage: { completion_tokens: 5, prompt_tokens: 10, total_tokens: 15 }
			});

			await provider.complete({ ...options, model: 'o3', temperature: 0.7, top_p: 0.9 });

			expect(mockCreate.mock.calls[0][0].temperature).toBeUndefined();
			expect(mockCreate.mock.calls[0][0].top_p).toBeUndefined();
		});

		it('parses tool call arguments from a successful response', async () => {
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
				model: 'gpt-5',
				usage: undefined
			});

			const result = await provider.complete(options);

			expect(result.tool_calls).toEqual([{ arguments: { city: 'Paris' }, id: 'call_1', name: 'get_weather' }]);
		});

		it('extracts cached-token count from prompt_tokens_details into cache_read_input_tokens', async () => {
			mockCreate.mockResolvedValueOnce({
				choices: [{ finish_reason: 'stop', message: { content: 'Hi', tool_calls: undefined } }],
				model: 'gpt-5',
				usage: {
					completion_tokens: 5,
					prompt_tokens: 100,
					prompt_tokens_details: { cached_tokens: 40 },
					total_tokens: 105
				}
			});

			const result = await provider.complete(options);

			expect(result.usage).toEqual({
				cache_read_input_tokens: 40,
				completion_tokens: 5,
				prompt_tokens: 100,
				total_tokens: 105
			});
		});

		it('omits cache_read_input_tokens when no tokens were cached', async () => {
			mockCreate.mockResolvedValueOnce({
				choices: [{ finish_reason: 'stop', message: { content: 'Hi', tool_calls: undefined } }],
				model: 'gpt-5',
				usage: { completion_tokens: 5, prompt_tokens: 100, total_tokens: 105 }
			});

			const result = await provider.complete(options);

			expect(result.usage).toEqual({ completion_tokens: 5, prompt_tokens: 100, total_tokens: 105 });
		});

		it('throws a rate-limit error and never calls the API when rate limited', async () => {
			vi.mocked(checkRateLimit).mockReturnValueOnce(false);
			vi.mocked(getRateLimitStatus).mockReturnValueOnce({
				allowed: false,
				remaining: 0,
				resetTime: Date.now() + 5000
			});

			await expect(provider.complete(options)).rejects.toThrow(/OpenAI API rate limit exceeded/);
			expect(mockCreate).not.toHaveBeenCalled();
		});

		it('wraps a repeated failure as a generic OpenAI API error after retries are exhausted', async () => {
			vi.useFakeTimers();
			try {
				mockCreate.mockResolvedValue({ choices: [], model: 'gpt-5', usage: undefined });

				const pending = provider.complete(options);
				// Swallow the eventual rejection so it isn't reported as unhandled while
				// fake timers advance through the retry backoff delays below.
				pending.catch(() => {});

				await vi.runAllTimersAsync();

				await expect(pending).rejects.toThrow('OpenAI API returned no choices in response');
			} finally {
				vi.useRealTimers();
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

		it('wraps an upstream failure as an OpenAI streaming error', async () => {
			mockCreate.mockRejectedValue(new Error('socket hang up'));

			await expect(provider.streamComplete(options, () => {})).rejects.toThrow(/OpenAI streaming error/);
		});
	});
});
