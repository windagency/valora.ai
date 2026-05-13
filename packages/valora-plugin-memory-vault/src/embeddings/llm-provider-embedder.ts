import type { LLMProviderContract as LLMProvider } from '@windagency/valora-plugin-api';

import type { EmbedderPort, EmbeddingRequest, EmbeddingResult } from './embedder.port.js';

/**
 * Thrown when the wrapped {@link LLMProvider} does not implement the optional
 * `embed?()` method. ADR-013 §4 mandates graceful degradation: callers should
 * detect this error and fall back to the lexical recall path rather than fail
 * the entire pipeline.
 */
export class EmbedderNotSupportedError extends Error {
	constructor(providerName: string) {
		super(`LLM provider '${providerName}' does not implement embed(); cannot generate embeddings.`);
		this.name = 'EmbedderNotSupportedError';
	}
}

/**
 * Adapter that exposes an {@link LLMProvider}'s optional `embed?()` method
 * through the {@link EmbedderPort} contract used by the memory subsystem.
 *
 * Per ADR-013 §4 and CODE-QUALITY-GUIDELINES.md (Adapter Pattern, Appendix B),
 * memory must reach embedders only via this port — never via direct LLM-SDK
 * imports — so swapping providers (Ollama, OpenAI, Anthropic) is a one-line
 * change in DI wiring.
 */
export class LlmProviderEmbedder implements EmbedderPort {
	constructor(private readonly provider: LLMProvider) {}

	async embed(req: EmbeddingRequest): Promise<EmbeddingResult> {
		if (!this.provider.embed) {
			throw new EmbedderNotSupportedError(this.provider.name);
		}
		return this.provider.embed(req);
	}
}
