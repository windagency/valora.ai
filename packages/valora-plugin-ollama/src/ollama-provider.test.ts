import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OllamaManagers } from './ollama-provider.js';
import { OllamaProvider } from './ollama-provider.js';

const mockBinaryManager = { assertInstalled: vi.fn().mockResolvedValue(undefined) };
const mockProcessManager = {
	ensureRunning: vi.fn().mockResolvedValue(undefined),
	stop: vi.fn().mockResolvedValue(undefined)
};
const mockModelManager = { ensureModel: vi.fn().mockResolvedValue(undefined) };

const doubles: OllamaManagers = {
	binary: mockBinaryManager,
	model: mockModelManager,
	process: mockProcessManager
};

vi.mock('openai', () => {
	const mockCreate = vi.fn().mockResolvedValue({
		choices: [{ finish_reason: 'stop', message: { content: 'Hello from Ollama', tool_calls: undefined } }],
		model: 'llama3.1',
		usage: { completion_tokens: 5, prompt_tokens: 3, total_tokens: 8 }
	});
	return {
		default: vi.fn().mockImplementation(() => ({
			chat: { completions: { create: mockCreate } }
		}))
	};
});

describe('OllamaProvider', () => {
	beforeEach(() => {
		mockBinaryManager.assertInstalled.mockClear();
		mockProcessManager.ensureRunning.mockClear();
		mockProcessManager.stop.mockClear();
		mockModelManager.ensureModel.mockClear();
	});

	it('isConfigured() always returns true', () => {
		const provider = new OllamaProvider({}, doubles);
		expect(provider.isConfigured()).toBe(true);
	});

	it('name is "ollama"', () => {
		const provider = new OllamaProvider({}, doubles);
		expect(provider.name).toBe('ollama');
	});

	it('getAlternativeModels() returns common Ollama models including llama3.1', () => {
		const provider = new OllamaProvider({}, doubles);
		expect(provider.getAlternativeModels()).toContain('llama3.1');
	});

	it('complete() calls assertInstalled, ensureRunning, and ensureModel before LLM call', async () => {
		const provider = new OllamaProvider({ model: 'llama3.1' }, doubles);

		await provider.complete({ messages: [{ content: 'Hello', role: 'user' }] });

		expect(mockBinaryManager.assertInstalled).toHaveBeenCalledOnce();
		expect(mockProcessManager.ensureRunning).toHaveBeenCalledOnce();
		expect(mockModelManager.ensureModel).toHaveBeenCalledWith('http://localhost:11434', 'llama3.1');
	});

	it('complete() returns the model response content', async () => {
		const provider = new OllamaProvider({ model: 'llama3.1' }, doubles);

		const result = await provider.complete({ messages: [{ content: 'Hi', role: 'user' }] });

		expect(result.content).toBe('Hello from Ollama');
		expect(result.role).toBe('assistant');
	});

	describe('config fallbacks', () => {
		it('uses default model when config.model is not a string', async () => {
			const provider = new OllamaProvider({ model: 99 }, doubles);

			await provider.complete({ messages: [{ content: 'Hi', role: 'user' }] });

			expect(mockModelManager.ensureModel).toHaveBeenCalledWith(expect.any(String), 'llama3.1');
		});

		it('uses default host when config.ollama_host is not a string', async () => {
			const provider = new OllamaProvider({ ollama_host: false }, doubles);

			await provider.complete({ messages: [{ content: 'Hi', role: 'user' }] });

			expect(mockProcessManager.ensureRunning).toHaveBeenCalledWith('http://localhost:11434');
		});
	});

	it('streamComplete() calls ensureReady and streams content', async () => {
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

		const provider = new OllamaProvider({ model: 'llama3.1' }, doubles);
		const collected: string[] = [];

		const result = await provider.streamComplete({ messages: [{ content: 'Hi', role: 'user' }] }, (chunk) =>
			collected.push(chunk)
		);

		expect(collected).toEqual(['Hello', ' world']);
		expect(result.content).toBe('Hello world');
		expect(result.role).toBe('assistant');
		expect(mockBinaryManager.assertInstalled).toHaveBeenCalledOnce();
	});
});
