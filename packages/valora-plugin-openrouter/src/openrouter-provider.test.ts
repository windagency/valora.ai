import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OpenRouterProvider } from './openrouter-provider.js';
import { OPENROUTER_MODELS } from './models.js';

vi.mock('openai', () => {
	const mockCreate = vi.fn().mockResolvedValue({
		choices: [{ finish_reason: 'stop', message: { content: 'Hello from OpenRouter', tool_calls: undefined } }],
		// Use the literal string here — vi.mock factories are hoisted and cannot access module imports
		model: 'google/gemma-4-31b-it:free',
		usage: { completion_tokens: 5, prompt_tokens: 3, total_tokens: 8 }
	});
	return {
		default: vi.fn().mockImplementation(() => ({
			chat: { completions: { create: mockCreate } }
		}))
	};
});

describe('OpenRouterProvider', () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('name is "openrouter"', () => {
		const provider = new OpenRouterProvider({});
		expect(provider.name).toBe('openrouter');
	});

	it('isConfigured() returns false with empty config and no env var', () => {
		const provider = new OpenRouterProvider({});
		expect(provider.isConfigured()).toBe(false);
	});

	it('isConfigured() returns true when config.apiKey is set', () => {
		const provider = new OpenRouterProvider({ apiKey: 'sk-test-key' });
		expect(provider.isConfigured()).toBe(true);
	});

	it('isConfigured() returns false when config.apiKey is set to empty string', () => {
		const provider = new OpenRouterProvider({ apiKey: '' });
		expect(provider.isConfigured()).toBe(false);
	});

	it('isConfigured() returns true when process.env.OPENROUTER_API_KEY is set', () => {
		vi.stubEnv('OPENROUTER_API_KEY', 'sk-env-key');
		const provider = new OpenRouterProvider({});
		expect(provider.isConfigured()).toBe(true);
	});

	it('isConfigured() returns false when OPENROUTER_API_KEY is set to empty string', () => {
		vi.stubEnv('OPENROUTER_API_KEY', '');
		const provider = new OpenRouterProvider({});
		expect(provider.isConfigured()).toBe(false);
	});

	it('getAlternativeModels() returns array including "google/gemma-4-31b-it:free"', () => {
		const provider = new OpenRouterProvider({});
		expect(provider.getAlternativeModels()).toContain(OPENROUTER_MODELS.GEMMA_4_31B_FREE);
	});

	it('validateModel() always resolves true regardless of model name', async () => {
		const provider = new OpenRouterProvider({ apiKey: 'sk-test' });
		await expect(provider.validateModel('any/model:slug')).resolves.toBe(true);
	});

	it('complete() returns the model response content, finish_reason, model, and usage', async () => {
		const provider = new OpenRouterProvider({ apiKey: 'sk-test-key' });
		const result = await provider.complete({ messages: [{ content: 'Hi', role: 'user' }] });
		expect(result.content).toBe('Hello from OpenRouter');
		expect(result.role).toBe('assistant');
		expect(result.finish_reason).toBe('stop');
		expect(result.model).toBe(OPENROUTER_MODELS.GEMMA_4_31B_FREE);
		expect(result.usage).toEqual({ completion_tokens: 5, prompt_tokens: 3, total_tokens: 8 });
	});

	it('complete() throws when no API key is available', async () => {
		const provider = new OpenRouterProvider({});
		await expect(provider.complete({ messages: [{ content: 'Hi', role: 'user' }] })).rejects.toThrow(
			'OpenRouter API key missing'
		);
	});

	it('uses config.baseUrl as the API endpoint when provided', async () => {
		const OpenAI = (await import('openai')).default;
		const provider = new OpenRouterProvider({ apiKey: 'sk-test', baseUrl: 'https://custom.example.com/v1' });
		await provider.complete({ messages: [{ content: 'Hi', role: 'user' }] });
		expect(vi.mocked(OpenAI)).toHaveBeenCalledWith(
			expect.objectContaining({ baseURL: 'https://custom.example.com/v1' })
		);
	});

	it('complete() succeeds when API key is available in env', async () => {
		vi.stubEnv('OPENROUTER_API_KEY', 'sk-env-key');
		const provider = new OpenRouterProvider({});
		const result = await provider.complete({ messages: [{ content: 'Hi', role: 'user' }] });
		expect(result.content).toBe('Hello from OpenRouter');
	});

	it('complete() maps tool_calls from the response', async () => {
		const OpenAI = (await import('openai')).default;
		vi.mocked(OpenAI).mockImplementationOnce(
			() =>
				({
					chat: {
						completions: {
							create: vi.fn().mockResolvedValue({
								choices: [
									{
										finish_reason: 'tool_calls',
										message: {
											content: null,
											tool_calls: [
												{
													id: 'tc1',
													function: { name: 'myTool', arguments: '{"x":1}' }
												}
											]
										}
									}
								],
								model: OPENROUTER_MODELS.GEMMA_4_31B_FREE,
								usage: { completion_tokens: 0, prompt_tokens: 1, total_tokens: 1 }
							})
						}
					}
				}) as never
		);

		const provider = new OpenRouterProvider({ apiKey: 'sk-test' });
		const result = await provider.complete({
			messages: [{ content: 'call tool', role: 'user' }],
			tools: [{ name: 'myTool', description: 'a tool', parameters: {} }]
		});

		expect(result.tool_calls).toHaveLength(1);
		expect(result.tool_calls?.[0].name).toBe('myTool');
		expect(result.tool_calls?.[0].arguments).toEqual({ x: 1 });
	});

	it('streamComplete() throws when no API key is available', async () => {
		const provider = new OpenRouterProvider({});
		await expect(provider.streamComplete({ messages: [{ content: 'Hi', role: 'user' }] }, () => {})).rejects.toThrow(
			'OpenRouter API key missing'
		);
	});

	it('streamComplete() accumulates chunks and returns final content', async () => {
		const OpenAI = (await import('openai')).default;
		const chunks = [
			{ choices: [{ delta: { content: 'Hello' }, finish_reason: null }] },
			{ choices: [{ delta: { content: ' world' }, finish_reason: 'stop' }] }
		];
		vi.mocked(OpenAI).mockImplementationOnce(
			() =>
				({
					chat: {
						completions: {
							create: vi.fn().mockReturnValue(
								(async function* () {
									for (const chunk of chunks) yield chunk;
								})()
							)
						}
					}
				}) as never
		);

		const provider = new OpenRouterProvider({ apiKey: 'sk-test-key' });
		const collected: string[] = [];

		const result = await provider.streamComplete({ messages: [{ content: 'Hi', role: 'user' }] }, (chunk) =>
			collected.push(chunk)
		);

		expect(collected).toEqual(['Hello', ' world']);
		expect(result.content).toBe('Hello world');
		expect(result.role).toBe('assistant');
	});
});
