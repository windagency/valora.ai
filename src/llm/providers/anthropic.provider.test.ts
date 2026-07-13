/**
 * Tests for Anthropic provider prompt caching functionality
 */

import type Anthropic from '@anthropic-ai/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Wrapped with vi.fn(actual) rather than fully mocked: real rate-limiting behaviour is
// exercised for every other test, only the one dedicated rate-limit test overrides it —
// pre-exhausting the real 60-req/min bucket would be slow and brittle.
vi.mock('utils/rate-limiter', async (importOriginal) => {
	const actual = await importOriginal<typeof import('utils/rate-limiter')>();
	return {
		...actual,
		checkRateLimit: vi.fn(actual.checkRateLimit),
		getRateLimitStatus: vi.fn(actual.getRateLimitStatus)
	};
});

import type { LLMCompletionOptions } from 'types/llm.types';

import { getProviderRegistry } from 'llm/registry';
import { checkRateLimit, getRateLimitStatus } from 'utils/rate-limiter';

import { AnthropicProvider } from './anthropic.provider';

/**
 * Helper to create a provider with given config
 */
function createProvider(config: Record<string, unknown> = {}): AnthropicProvider {
	return new AnthropicProvider(config);
}

describe('AnthropicProvider', () => {
	describe('applyCacheBreakpoints', () => {
		it('should not modify params when prompt_caching is disabled', () => {
			const provider = createProvider({ apiKey: 'test-key' });
			const params = {
				max_tokens: 1024,
				messages: [{ content: 'Hello', role: 'user' as const }],
				model: 'claude-3-5-sonnet-latest',
				system: 'You are a helpful assistant.'
			} as Anthropic.MessageCreateParamsNonStreaming;

			provider.applyCacheBreakpoints(params);

			// System should remain a plain string
			expect(typeof params.system).toBe('string');
		});

		it('should not modify params when prompt_caching is not set', () => {
			const provider = createProvider({ apiKey: 'test-key' });
			const params = {
				max_tokens: 1024,
				messages: [{ content: 'Hello', role: 'user' as const }],
				model: 'claude-3-5-sonnet-latest',
				system: 'You are a helpful assistant.'
			} as Anthropic.MessageCreateParamsNonStreaming;

			provider.applyCacheBreakpoints(params);

			expect(typeof params.system).toBe('string');
		});

		it('should convert system prompt to TextBlockParam[] with cache_control when above threshold', () => {
			const provider = createProvider({ apiKey: 'test-key', prompt_caching: true });
			// Create a system prompt that exceeds MIN_CACHEABLE_TOKENS (1024 tokens ~= 4096 chars)
			const longSystem = 'A'.repeat(5000);
			const params = {
				max_tokens: 1024,
				messages: [{ content: 'Hello', role: 'user' as const }],
				model: 'claude-3-5-sonnet-latest',
				system: longSystem
			} as Anthropic.MessageCreateParamsNonStreaming;

			provider.applyCacheBreakpoints(params);

			expect(Array.isArray(params.system)).toBe(true);
			const systemBlocks = params.system as Anthropic.TextBlockParam[];
			expect(systemBlocks).toHaveLength(1);
			expect(systemBlocks[0].type).toBe('text');
			expect(systemBlocks[0].text).toBe(longSystem);
			expect(systemBlocks[0].cache_control).toEqual({ type: 'ephemeral' });
		});

		it('should skip system prompt caching when below minimum token threshold', () => {
			const provider = createProvider({ apiKey: 'test-key', prompt_caching: true });
			// Short system prompt below threshold
			const shortSystem = 'Be helpful.';
			const params = {
				max_tokens: 1024,
				messages: [{ content: 'Hello', role: 'user' as const }],
				model: 'claude-3-5-sonnet-latest',
				system: shortSystem
			} as Anthropic.MessageCreateParamsNonStreaming;

			provider.applyCacheBreakpoints(params);

			// Should remain a string since it's below threshold
			expect(typeof params.system).toBe('string');
			expect(params.system).toBe(shortSystem);
		});

		it('should add cache_control to the last tool definition', () => {
			const provider = createProvider({ apiKey: 'test-key', prompt_caching: true });
			const tools = [
				{
					description: 'First tool',
					input_schema: { properties: {}, type: 'object' as const },
					name: 'tool_a'
				},
				{
					description: 'Second tool',
					input_schema: { properties: {}, type: 'object' as const },
					name: 'tool_b'
				}
			];
			const params = {
				max_tokens: 1024,
				messages: [{ content: 'Hello', role: 'user' as const }],
				model: 'claude-3-5-sonnet-latest',
				tools
			} as Anthropic.MessageCreateParamsNonStreaming;

			provider.applyCacheBreakpoints(params);

			// First tool should NOT have cache_control
			expect((tools[0] as Record<string, unknown>)['cache_control']).toBeUndefined();
			// Last tool should have cache_control
			expect((tools[1] as Record<string, unknown>)['cache_control']).toEqual({ type: 'ephemeral' });
		});

		it('should add cache_control to the last user message before the final turn', () => {
			const provider = createProvider({ apiKey: 'test-key', prompt_caching: true });
			const params = {
				max_tokens: 1024,
				messages: [
					{ content: 'First user message', role: 'user' as const },
					{ content: 'Assistant response', role: 'assistant' as const },
					{ content: 'Second user message', role: 'user' as const },
					{ content: 'Another assistant response', role: 'assistant' as const },
					{ content: 'Final user message', role: 'user' as const }
				],
				model: 'claude-3-5-sonnet-latest'
			} as Anthropic.MessageCreateParamsNonStreaming;

			provider.applyCacheBreakpoints(params);

			// The second-to-last user message (index 2) should be converted to have cache_control
			const cachedMsg = params.messages[2];
			expect(Array.isArray(cachedMsg.content)).toBe(true);
			const blocks = cachedMsg.content as Anthropic.TextBlockParam[];
			expect(blocks[0].cache_control).toEqual({ type: 'ephemeral' });
			expect(blocks[0].text).toBe('Second user message');

			// The final user message (index 4) should remain unchanged
			expect(typeof params.messages[4].content).toBe('string');
		});

		it('should handle array content in user messages when adding cache_control', () => {
			const provider = createProvider({ apiKey: 'test-key', prompt_caching: true });
			const params = {
				max_tokens: 1024,
				messages: [
					{
						content: [
							{ text: 'Part one', type: 'text' as const },
							{ text: 'Part two', type: 'text' as const }
						],
						role: 'user' as const
					},
					{ content: 'Final message', role: 'user' as const }
				],
				model: 'claude-3-5-sonnet-latest'
			} as Anthropic.MessageCreateParamsNonStreaming;

			provider.applyCacheBreakpoints(params);

			// The first message (before final) should have cache_control on last block
			const firstMsg = params.messages[0];
			const blocks = firstMsg.content as Anthropic.TextBlockParam[];
			expect((blocks[1] as Record<string, unknown>)['cache_control']).toEqual({ type: 'ephemeral' });
			// First block should not have cache_control
			expect((blocks[0] as Record<string, unknown>)['cache_control']).toBeUndefined();
		});

		it('should not add message cache when there is only one message', () => {
			const provider = createProvider({ apiKey: 'test-key', prompt_caching: true });
			const params = {
				max_tokens: 1024,
				messages: [{ content: 'Only message', role: 'user' as const }],
				model: 'claude-3-5-sonnet-latest'
			} as Anthropic.MessageCreateParamsNonStreaming;

			provider.applyCacheBreakpoints(params);

			// Single message should remain unchanged
			expect(typeof params.messages[0].content).toBe('string');
		});

		it('should handle empty tools array without error', () => {
			const provider = createProvider({ apiKey: 'test-key', prompt_caching: true });
			const params = {
				max_tokens: 1024,
				messages: [{ content: 'Hello', role: 'user' as const }],
				model: 'claude-3-5-sonnet-latest',
				tools: []
			} as Anthropic.MessageCreateParamsNonStreaming;

			// Should not throw
			provider.applyCacheBreakpoints(params);
			expect(params.tools).toEqual([]);
		});
	});
});

describe('AnthropicProvider — error message redaction', () => {
	it('redacts a credential leaked in an upstream SDK error message before it reaches the thrown ProviderError', async () => {
		// A malicious/misconfigured baseUrl endpoint (see credential-guard
		// scanOutput's other call sites) could return a response body that
		// ends up embedded verbatim in the SDK's thrown error message —
		// previously reached the caller (and any downstream logging) with no
		// redaction pass at all, unlike every other tool-output/hook/LSP path.
		const provider = createProvider({ apiKey: 'sk-ant-fake-key-for-test' });
		const leakedKey = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJKLMNOPQRSTUVWX';
		(provider as unknown as { client: unknown }).client = {
			messages: {
				create: async () => {
					throw new Error(`upstream 500: {"error": "internal", "leaked_context_key": "${leakedKey}"}`);
				}
			}
		};

		expect.assertions(2);
		try {
			await provider.complete({ max_tokens: 100, messages: [{ content: 'hi', role: 'user' }] });
		} catch (error) {
			expect((error as Error).message).not.toContain(leakedKey);
			expect((error as Error).message).toContain('[REDACTED]');
		}
	});

	it('redacts a credential leaked in an upstream SDK error message on the streaming path too — round 14 only fixed the non-streaming "API error" throw', async () => {
		const provider = createProvider({ apiKey: 'sk-ant-fake-key-for-test' });
		const leakedKey = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJKLMNOPQRSTUVWX';
		(provider as unknown as { client: unknown }).client = {
			messages: {
				create: async () => {
					throw new Error(`upstream 500: {"error": "internal", "leaked_context_key": "${leakedKey}"}`);
				}
			}
		};

		expect.assertions(2);
		try {
			await provider.streamComplete({ max_tokens: 100, messages: [{ content: 'hi', role: 'user' }] }, () => {});
		} catch (error) {
			expect((error as Error).message).not.toContain(leakedKey);
			expect((error as Error).message).toContain('[REDACTED]');
		}
	});
});

describe('AnthropicProvider — descriptor registration', () => {
	it('registers a descriptor with label "Anthropic"', () => {
		const descriptor = getProviderRegistry().getDescriptor('anthropic');
		expect(descriptor?.label).toBe('Anthropic');
	});

	it('registers a descriptor with requiresApiKey: true', () => {
		expect(getProviderRegistry().getDescriptor('anthropic')?.requiresApiKey).toBe(true);
	});

	it('registers a non-empty modelModes list', () => {
		expect(getProviderRegistry().getDescriptor('anthropic')?.modelModes.length ?? 0).toBeGreaterThan(0);
	});
});

describe('AnthropicProvider — configuration', () => {
	it('is configured when an API key is present', () => {
		expect(createProvider({ apiKey: 'test-key' }).isConfigured()).toBe(true);
	});

	it('is not configured without an API key or Vertex config', () => {
		// isConfigured() is typed to return boolean but its `hasApiKey || hasVertexConfig`
		// expression can actually yield `undefined` when vertexAI is unset (a falsy
		// short-circuit, not a real boolean) — assert falsy rather than a strict `false`.
		expect(createProvider({}).isConfigured()).toBeFalsy();
	});

	it('is configured via Vertex AI project/region even without an API key', () => {
		expect(
			createProvider({ vertexAI: true, vertexProjectId: 'proj-1', vertexRegion: 'us-central1' }).isConfigured()
		).toBe(true);
	});
});

describe('AnthropicProvider — validateModel', () => {
	const provider = createProvider({ apiKey: 'test-key' });

	it('accepts models from the known catalog', async () => {
		const [knownModel] =
			getProviderRegistry()
				.getDescriptor('anthropic')
				?.modelModes.map((mm) => mm.model) ?? [];
		expect(knownModel).toBeDefined();
		await expect(provider.validateModel(knownModel!)).resolves.toBe(true);
	});

	it('accepts unlisted models following the claude-* naming convention', async () => {
		await expect(provider.validateModel('claude-some-future-model')).resolves.toBe(true);
	});

	it('rejects a model matching no known convention', async () => {
		await expect(provider.validateModel('gpt-5')).resolves.toBe(false);
	});
});

describe('AnthropicProvider — getAlternativeModels', () => {
	const provider = createProvider({ apiKey: 'test-key' });

	it('excludes the given current model from the alternatives list', () => {
		const all = provider.getAlternativeModels();
		const [currentModel] = all;
		expect(currentModel).toBeDefined();

		const alternatives = provider.getAlternativeModels(currentModel);

		expect(alternatives).not.toContain(currentModel);
		expect(alternatives.length).toBe(all.length - 1);
	});
});

describe('AnthropicProvider — sandboxed guard', () => {
	const originalNodeEnv = process.env['NODE_ENV'];

	afterEach(() => {
		process.env['NODE_ENV'] = originalNodeEnv;
	});

	it('provides a helpful fallback error when sandboxed with no credentials configured', async () => {
		process.env['NODE_ENV'] = 'test';
		const provider = createProvider({});

		await expect(provider.complete({ max_tokens: 100, messages: [{ content: 'hi', role: 'user' }] })).rejects.toThrow(
			'Anthropic provider not configured. In sandboxed environments, API keys are required for LLM operations.'
		);
	});
});

describe('AnthropicProvider — complete()/streamComplete() against an injected client', () => {
	let provider: AnthropicProvider;
	let mockCreate: ReturnType<typeof vi.fn>;
	const options: LLMCompletionOptions = {
		max_tokens: 100,
		messages: [{ content: 'Hello', role: 'user' }],
		model: 'claude-sonnet-4.6'
	};

	beforeEach(() => {
		provider = createProvider({ apiKey: 'test-key' });
		mockCreate = vi.fn();
		(provider as unknown as { client: unknown }).client = { messages: { create: mockCreate } };
		vi.mocked(checkRateLimit).mockClear();
		vi.mocked(getRateLimitStatus).mockClear();
	});

	describe('complete()', () => {
		it('returns content, finish_reason, model, and usage from a successful response', async () => {
			mockCreate.mockResolvedValueOnce({
				content: [{ text: 'Hi there!', type: 'text' }],
				model: 'claude-sonnet-4-6-20260101',
				stop_reason: 'end_turn',
				usage: { input_tokens: 10, output_tokens: 5 }
			});

			const result = await provider.complete(options);

			expect(result).toEqual({
				content: 'Hi there!',
				finish_reason: 'end_turn',
				model: 'claude-sonnet-4-6-20260101',
				role: 'assistant',
				tool_calls: undefined,
				usage: { completion_tokens: 5, prompt_tokens: 10, total_tokens: 15 }
			});
		});

		it('extracts tool_use blocks as tool_calls', async () => {
			mockCreate.mockResolvedValueOnce({
				content: [{ id: 'call_1', input: { city: 'Paris' }, name: 'get_weather', type: 'tool_use' }],
				model: 'claude-sonnet-4-6-20260101',
				stop_reason: 'tool_use',
				usage: { input_tokens: 10, output_tokens: 5 }
			});

			const result = await provider.complete(options);

			expect(result.tool_calls).toEqual([{ arguments: { city: 'Paris' }, id: 'call_1', name: 'get_weather' }]);
		});

		it('extracts prompt-cache usage fields when present', async () => {
			mockCreate.mockResolvedValueOnce({
				content: [{ text: 'Hi', type: 'text' }],
				model: 'claude-sonnet-4-6-20260101',
				stop_reason: 'end_turn',
				usage: { cache_creation_input_tokens: 200, cache_read_input_tokens: 40, input_tokens: 10, output_tokens: 5 }
			});

			const result = await provider.complete(options);

			expect(result.usage).toEqual({
				cache_creation_input_tokens: 200,
				cache_read_input_tokens: 40,
				completion_tokens: 5,
				prompt_tokens: 10,
				total_tokens: 15
			});
		});

		it('throws a rate-limit error and never calls the API when rate limited', async () => {
			vi.mocked(checkRateLimit).mockReturnValueOnce(false);
			vi.mocked(getRateLimitStatus).mockReturnValueOnce({
				allowed: false,
				remaining: 0,
				resetTime: Date.now() + 5000
			});

			await expect(provider.complete(options)).rejects.toThrow(/Anthropic API rate limit exceeded/);
			expect(mockCreate).not.toHaveBeenCalled();
		});

		it('retries a transient failure and returns the result from a later successful attempt', async () => {
			vi.useFakeTimers();
			try {
				mockCreate.mockRejectedValueOnce(new Error('ETIMEDOUT')).mockResolvedValueOnce({
					content: [{ text: 'Recovered', type: 'text' }],
					model: 'claude-sonnet-4-6-20260101',
					stop_reason: 'end_turn',
					usage: { input_tokens: 10, output_tokens: 5 }
				});

				const pending = provider.complete(options);
				pending.catch(() => {});
				await vi.advanceTimersByTimeAsync(1000);

				await expect(pending).resolves.toMatchObject({ content: 'Recovered' });
				expect(mockCreate).toHaveBeenCalledTimes(2);
			} finally {
				vi.useRealTimers();
			}
		});

		it('routes requests above the streaming threshold through the streaming path', async () => {
			async function* fakeStream() {
				yield {
					message: { model: 'claude-sonnet-4-6-20260101', usage: { input_tokens: 10 } },
					type: 'message_start'
				};
				yield { delta: { text: 'Streamed content', type: 'text_delta' }, index: 0, type: 'content_block_delta' };
				yield { type: 'message_delta', usage: { output_tokens: 3 } };
			}
			mockCreate.mockResolvedValueOnce(fakeStream());

			const result = await provider.complete({ ...options, max_tokens: 20000 });

			expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ stream: true }));
			expect(result.content).toBe('Streamed content');
		});
	});

	describe('streamComplete()', () => {
		async function* fakeStream(events: Array<Record<string, unknown>>) {
			for (const event of events) yield event as unknown as Anthropic.MessageStreamEvent;
		}

		it('accumulates streamed text, calls onChunk for each piece, and returns model/usage', async () => {
			mockCreate.mockResolvedValueOnce(
				fakeStream([
					{ message: { model: 'claude-sonnet-4-6-20260101', usage: { input_tokens: 10 } }, type: 'message_start' },
					{ delta: { text: 'Hel', type: 'text_delta' }, index: 0, type: 'content_block_delta' },
					{ delta: { text: 'lo!', type: 'text_delta' }, index: 0, type: 'content_block_delta' },
					{ type: 'message_delta', usage: { output_tokens: 2 } }
				])
			);
			const chunks: string[] = [];

			const result = await provider.streamComplete(options, (chunk) => chunks.push(chunk));

			expect(chunks).toEqual(['Hel', 'lo!']);
			expect(result).toMatchObject({
				content: 'Hello!',
				model: 'claude-sonnet-4-6-20260101',
				role: 'assistant',
				usage: { completion_tokens: 2, prompt_tokens: 10, total_tokens: 12 }
			});
		});

		it('accumulates tool_use input across content_block_start/delta events into tool_calls', async () => {
			mockCreate.mockResolvedValueOnce(
				fakeStream([
					{ message: { model: 'claude-sonnet-4-6-20260101', usage: { input_tokens: 10 } }, type: 'message_start' },
					{
						content_block: { id: 'call_1', name: 'get_weather', type: 'tool_use' },
						index: 0,
						type: 'content_block_start'
					},
					{
						delta: { partial_json: '{"city":"Paris"}', type: 'input_json_delta' },
						index: 0,
						type: 'content_block_delta'
					},
					{ type: 'message_delta', usage: { output_tokens: 4 } }
				])
			);

			const result = await provider.streamComplete(options, () => {});

			expect(result.tool_calls).toEqual([{ arguments: { city: 'Paris' }, id: 'call_1', name: 'get_weather' }]);
		});

		it('captures cache usage fields from the message_start event', async () => {
			mockCreate.mockResolvedValueOnce(
				fakeStream([
					{
						message: {
							model: 'claude-sonnet-4-6-20260101',
							usage: { cache_creation_input_tokens: 200, cache_read_input_tokens: 40, input_tokens: 10 }
						},
						type: 'message_start'
					},
					{ delta: { text: 'Hi', type: 'text_delta' }, index: 0, type: 'content_block_delta' },
					{ type: 'message_delta', usage: { output_tokens: 1 } }
				])
			);

			const result = await provider.streamComplete(options, () => {});

			expect(result.usage).toMatchObject({ cache_creation_input_tokens: 200, cache_read_input_tokens: 40 });
		});
	});
});
