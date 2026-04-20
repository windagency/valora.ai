import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { OllamaProvider, resetManagers, setManagers } from './ollama-provider.js';

const mockBinaryManager = { assertInstalled: vi.fn().mockResolvedValue(undefined) };
const mockProcessManager = {
	ensureRunning: vi.fn().mockResolvedValue(undefined),
	stop: vi.fn().mockResolvedValue(undefined)
};
const mockModelManager = { ensureModel: vi.fn().mockResolvedValue(undefined) };

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
		setManagers({
			binary: mockBinaryManager,
			model: mockModelManager,
			process: mockProcessManager
		});
		mockBinaryManager.assertInstalled.mockClear();
		mockProcessManager.ensureRunning.mockClear();
		mockProcessManager.stop.mockClear();
		mockModelManager.ensureModel.mockClear();
	});

	it('isConfigured() always returns true', () => {
		const provider = new OllamaProvider({});
		expect(provider.isConfigured()).toBe(true);
	});

	it('name is "ollama"', () => {
		const provider = new OllamaProvider({});
		expect(provider.name).toBe('ollama');
	});

	it('getAlternativeModels() returns common Ollama models including llama3.1', () => {
		const provider = new OllamaProvider({});
		expect(provider.getAlternativeModels()).toContain('llama3.1');
	});

	it('complete() calls assertInstalled, ensureRunning, and ensureModel before LLM call', async () => {
		const provider = new OllamaProvider({ model: 'llama3.1' });

		await provider.complete({ messages: [{ content: 'Hello', role: 'user' }] });

		expect(mockBinaryManager.assertInstalled).toHaveBeenCalledOnce();
		expect(mockProcessManager.ensureRunning).toHaveBeenCalledOnce();
		expect(mockModelManager.ensureModel).toHaveBeenCalledWith('http://localhost:11434', 'llama3.1');
	});

	it('complete() returns the model response content', async () => {
		const provider = new OllamaProvider({ model: 'llama3.1' });

		const result = await provider.complete({ messages: [{ content: 'Hi', role: 'user' }] });

		expect(result.content).toBe('Hello from Ollama');
		expect(result.role).toBe('assistant');
	});

	afterEach(() => {
		resetManagers();
	});

	it('complete() throws when managers have not been initialised', async () => {
		resetManagers();
		const provider = new OllamaProvider({});

		await expect(provider.complete({ messages: [{ content: 'Hi', role: 'user' }] })).rejects.toThrow(
			'managers not initialised'
		);
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

		const provider = new OllamaProvider({ model: 'llama3.1' });
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
