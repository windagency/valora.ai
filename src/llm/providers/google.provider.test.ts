import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LLMCompletionOptions } from 'types/llm.types';

const mockGenerateContent = vi.fn();
const mockGenerateContentStream = vi.fn();
const mockGetGenerativeModel = vi.fn(() => ({
	generateContent: mockGenerateContent,
	generateContentStream: mockGenerateContentStream
}));

vi.mock('@google/generative-ai', () => ({
	GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
		getGenerativeModel: mockGetGenerativeModel
	}))
}));

import { getProviderRegistry } from 'llm/registry';

import { GoogleProvider } from './google.provider';

describe('GoogleProvider — descriptor registration', () => {
	it('registers a descriptor with label "Google"', () => {
		expect(getProviderRegistry().getDescriptor('google')?.label).toBe('Google');
	});

	it('registers a descriptor with requiresApiKey: true', () => {
		expect(getProviderRegistry().getDescriptor('google')?.requiresApiKey).toBe(true);
	});

	it('registers a non-empty modelModes list', () => {
		expect(getProviderRegistry().getDescriptor('google')?.modelModes.length ?? 0).toBeGreaterThan(0);
	});
});

describe('GoogleProvider — configuration', () => {
	it('is configured when an API key is present', () => {
		expect(new GoogleProvider({ apiKey: 'test-key' }).isConfigured()).toBe(true);
	});

	it('is not configured without an API key', () => {
		expect(new GoogleProvider({}).isConfigured()).toBe(false);
	});

	it('does not support batch — Vertex AI batch requires @google-cloud/aiplatform', () => {
		expect(new GoogleProvider({ apiKey: 'test-key' }).supportsBatch()).toBe(false);
	});
});

describe('GoogleProvider — validateModel', () => {
	const provider = new GoogleProvider({ apiKey: 'test-key' });

	it('accepts models from the known catalog', async () => {
		const [knownModel] =
			getProviderRegistry()
				.getDescriptor('google')
				?.modelModes.map((mm) => mm.model) ?? [];
		expect(knownModel).toBeDefined();
		await expect(provider.validateModel(knownModel!)).resolves.toBe(true);
	});

	it.each(['gemini-3.5-future', 'gemma-3-future'])(
		'accepts unlisted models following the gemini-*/gemma-* convention (%s)',
		async (modelName) => {
			await expect(provider.validateModel(modelName)).resolves.toBe(true);
		}
	);

	it('rejects a model matching no known convention', async () => {
		await expect(provider.validateModel('llama-3-70b')).resolves.toBe(false);
	});
});

describe('GoogleProvider — getAlternativeModels', () => {
	const provider = new GoogleProvider({ apiKey: 'test-key' });

	it('excludes the given current model from the alternatives list', () => {
		const all = provider.getAlternativeModels();
		const [currentModel] = all;
		expect(currentModel).toBeDefined();

		const alternatives = provider.getAlternativeModels(currentModel);

		expect(alternatives).not.toContain(currentModel);
		expect(alternatives.length).toBe(all.length - 1);
	});
});

describe('GoogleProvider', () => {
	let provider: GoogleProvider;
	const options: LLMCompletionOptions = {
		messages: [
			{ content: 'You are a helpful assistant.', role: 'system' },
			{ content: 'Hello', role: 'user' }
		],
		model: 'gemini-2.5-pro'
	};

	beforeEach(() => {
		mockGenerateContent.mockReset();
		mockGenerateContentStream.mockReset();
		mockGetGenerativeModel.mockClear();
		provider = new GoogleProvider({ apiKey: 'test-key' });
	});

	describe('complete()', () => {
		it('returns the completion content, finish_reason, and usage from a successful response', async () => {
			mockGenerateContent.mockResolvedValueOnce({
				response: {
					candidates: [{ finishReason: 'STOP' }],
					text: () => 'Hi there!',
					usageMetadata: { candidatesTokenCount: 5, promptTokenCount: 10, totalTokenCount: 15 }
				}
			});

			const result = await provider.complete(options);

			expect(result).toEqual({
				content: 'Hi there!',
				finish_reason: 'STOP',
				role: 'assistant',
				usage: { completion_tokens: 5, prompt_tokens: 10, total_tokens: 15 }
			});
		});

		it('separates system messages into systemInstruction and maps user/assistant roles for contents', async () => {
			mockGenerateContent.mockResolvedValueOnce({
				response: { candidates: [{ finishReason: 'STOP' }], text: () => 'ok', usageMetadata: undefined }
			});

			await provider.complete({
				messages: [
					{ content: 'System prompt', role: 'system' },
					{ content: 'User turn', role: 'user' },
					{ content: 'Assistant turn', role: 'assistant' }
				]
			});

			expect(mockGenerateContent).toHaveBeenCalledWith(
				expect.objectContaining({
					contents: [
						{ parts: [{ text: 'User turn' }], role: 'user' },
						{ parts: [{ text: 'Assistant turn' }], role: 'model' }
					],
					systemInstruction: 'System prompt'
				})
			);
		});

		it('extracts cachedContentTokenCount into cache_read_input_tokens when present', async () => {
			mockGenerateContent.mockResolvedValueOnce({
				response: {
					candidates: [{ finishReason: 'STOP' }],
					text: () => 'Hi',
					usageMetadata: {
						cachedContentTokenCount: 40,
						candidatesTokenCount: 5,
						promptTokenCount: 100,
						totalTokenCount: 105
					}
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

		it('wraps a model-not-found error with a clear, model-specific message', async () => {
			mockGenerateContent.mockRejectedValue(new Error('models/gemini-9000 is not found for API version v1'));

			await expect(provider.complete(options)).rejects.toThrow(
				"The model 'gemini-9000' is not available or not supported by the Google API"
			);
		});

		it('wraps an unrecognised error as a generic Google API error', async () => {
			mockGenerateContent.mockRejectedValue(new Error('upstream 500'));

			await expect(provider.complete(options)).rejects.toThrow('Google API error: upstream 500');
		});
	});

	describe('streamComplete()', () => {
		async function* fakeStream(chunks: string[]) {
			for (const text of chunks) {
				yield { text: () => text };
			}
		}

		it('accumulates streamed content, calls onChunk for each piece, and returns the final result', async () => {
			mockGenerateContentStream.mockResolvedValueOnce({
				response: Promise.resolve({
					usageMetadata: { candidatesTokenCount: 2, promptTokenCount: 3, totalTokenCount: 5 }
				}),
				stream: fakeStream(['Hel', 'lo!'])
			});
			const chunks: string[] = [];

			const result = await provider.streamComplete(options, (chunk) => chunks.push(chunk));

			expect(chunks).toEqual(['Hel', 'lo!']);
			expect(result).toEqual({
				content: 'Hello!',
				role: 'assistant',
				usage: { completion_tokens: 2, prompt_tokens: 3, total_tokens: 5 }
			});
		});

		it('wraps an upstream failure as a Google streaming error', async () => {
			mockGenerateContentStream.mockRejectedValue(new Error('socket hang up'));

			await expect(provider.streamComplete(options, () => {})).rejects.toThrow(
				'Google streaming error: socket hang up'
			);
		});
	});
});
