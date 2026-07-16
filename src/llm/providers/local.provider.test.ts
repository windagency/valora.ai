import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LLMCompletionOptions } from 'types/llm.types';

const mockCreate = vi.fn();
vi.mock('openai', () => ({
	default: vi.fn().mockImplementation(() => ({
		chat: { completions: { create: mockCreate } }
	}))
}));

import { getProviderRegistry } from 'llm/registry';

import { LocalProvider } from './local.provider';

describe('LocalProvider — descriptor registration', () => {
	it('registers a descriptor with label "Local"', () => {
		expect(getProviderRegistry().getDescriptor('local')?.label).toBe('Local');
	});

	it('registers a descriptor with requiresApiKey: false', () => {
		expect(getProviderRegistry().getDescriptor('local')?.requiresApiKey).toBe(false);
	});

	it('registers a non-empty modelModes list', () => {
		expect(getProviderRegistry().getDescriptor('local')?.modelModes.length ?? 0).toBeGreaterThan(0);
	});
});

describe('LocalProvider', () => {
	let provider: LocalProvider;
	const options: LLMCompletionOptions = {
		messages: [{ content: 'Hello', role: 'user' }],
		model: 'llama3.1'
	};

	beforeEach(() => {
		mockCreate.mockReset();
		provider = new LocalProvider({});
	});

	describe('isConfigured / validateModel', () => {
		it('is always configured — no API key required', () => {
			expect(provider.isConfigured()).toBe(true);
		});

		it('validates any model name, since local model names are fully dynamic', async () => {
			expect(await provider.validateModel('whatever-the-user-has-loaded')).toBe(true);
		});
	});

	describe('complete()', () => {
		it('returns the completion content, finish_reason, model, and usage from a successful response', async () => {
			mockCreate.mockResolvedValueOnce({
				choices: [{ finish_reason: 'stop', message: { content: 'Hi there!', tool_calls: undefined } }],
				model: 'llama3.1',
				usage: { completion_tokens: 5, prompt_tokens: 10, total_tokens: 15 }
			});

			const result = await provider.complete(options);

			expect(result).toEqual({
				content: 'Hi there!',
				finish_reason: 'stop',
				model: 'llama3.1',
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
				model: 'llama3.1',
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
				model: 'llama3.1',
				usage: undefined
			});

			const result = await provider.complete(options);

			expect(result.tool_calls).toEqual([{ arguments: {}, id: 'call_1', name: 'get_weather' }]);
		});

		it('throws a ProviderError when the response has no choices', async () => {
			// Every retry attempt must see the same malformed response — a ProviderError
			// with no explicit recovery override defaults to retriable, so withRetry will
			// call the client again before giving up (see error-handler.ts's withRetry/ProviderError).
			mockCreate.mockResolvedValue({ choices: [], model: 'llama3.1', usage: undefined });

			await expect(provider.complete(options)).rejects.toThrow('Local model server returned no choices in response');
		}, 10000);

		describe('error wrapping', () => {
			it('wraps a connection-refused error with a clear "is your server running" message and disables retry', async () => {
				const error = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:8080'), { code: 'ECONNREFUSED' });
				mockCreate.mockRejectedValue(error);

				await expect(provider.complete(options)).rejects.toThrow(
					'Cannot connect to local model server at http://localhost:8080/v1. Is your server running? Start your local model server.'
				);
			});

			it('wraps a 404 as a "model not found" error and disables retry', async () => {
				const error = new Error('Request failed with status code 404');
				mockCreate.mockRejectedValue(error);

				await expect(provider.complete(options)).rejects.toThrow(
					"Model 'llama3.1' not found on local server at http://localhost:8080/v1. Check your model server's model list."
				);
			});

			it('wraps an unrecognised error as a generic local model server error', async () => {
				const error = new Error('Internal server error (500)');
				mockCreate.mockRejectedValue(error);

				await expect(provider.complete(options)).rejects.toThrow(
					'Local model server error: Internal server error (500)'
				);
			});

			it('wraps a connection-reset/timeout error with a "server timed out" message', async () => {
				const error = Object.assign(new Error('socket hang up ECONNRESET'), { code: 'ECONNRESET' });
				mockCreate.mockRejectedValue(error);

				await expect(provider.complete(options)).rejects.toThrow(
					'Local model server timed out at http://localhost:8080/v1. The model may still be loading or the server is overloaded.'
				);
			}, 10000);
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

		it('wraps a connection-refused error from the stream the same way as complete()', async () => {
			const error = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:8080'), { code: 'ECONNREFUSED' });
			mockCreate.mockRejectedValue(error);

			await expect(provider.streamComplete(options, () => {})).rejects.toThrow(
				'Cannot connect to local model server at http://localhost:8080/v1. Is your server running? Start your local model server.'
			);
		});
	});
});
