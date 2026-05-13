import { describe, expect, it, vi } from 'vitest';

import type {
	LLMProviderContract as LLMProvider,
	PluginEmbeddingRequest as EmbeddingRequest,
	PluginEmbeddingResult as EmbeddingResult,
	PluginLLMCompletionOptions as LLMCompletionOptions,
	PluginLLMCompletionResult as LLMCompletionResult
} from '@windagency/valora-plugin-api';

import { EmbedderNotSupportedError, LlmProviderEmbedder } from './llm-provider-embedder';

function buildProvider(overrides: Partial<LLMProvider> = {}): LLMProvider {
	return {
		complete: vi.fn(async () => ({ content: '', model: '', role: 'assistant' as const }) as LLMCompletionResult),
		getAlternativeModels: () => [],
		isConfigured: () => true,
		name: 'stub-provider',
		streamComplete: vi.fn(async (_o: LLMCompletionOptions, _cb: (chunk: string) => void) => ({
			content: '',
			model: '',
			role: 'assistant' as const
		})),
		validateModel: vi.fn(async () => true),
		...overrides
	};
}

describe('LlmProviderEmbedder', () => {
	it('forwards the embed request to the wrapped LLMProvider when embed is supported', async () => {
		const result: EmbeddingResult = { dim: 3, model: 'm', vectors: [[1, 2, 3]] };
		const embed = vi.fn(async (_req: EmbeddingRequest) => result);
		const provider = buildProvider({ embed });
		const adapter = new LlmProviderEmbedder(provider);

		const got = await adapter.embed({ input: ['hello'], model: 'm' });

		expect(got).toBe(result);
		expect(embed).toHaveBeenCalledOnce();
	});

	it('throws EmbedderNotSupportedError when the provider does not implement embed', async () => {
		const provider = buildProvider({ embed: undefined, name: 'no-embed-provider' });
		const adapter = new LlmProviderEmbedder(provider);

		await expect(adapter.embed({ input: ['x'] })).rejects.toBeInstanceOf(EmbedderNotSupportedError);
		await expect(adapter.embed({ input: ['x'] })).rejects.toThrow(/no-embed-provider/);
	});

	it('propagates errors from the underlying provider unchanged', async () => {
		const cause = new Error('rate limited');
		const provider = buildProvider({
			embed: vi.fn(async () => {
				throw cause;
			})
		});
		const adapter = new LlmProviderEmbedder(provider);

		await expect(adapter.embed({ input: ['x'] })).rejects.toBe(cause);
	});
});
