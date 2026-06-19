import type { LLMProviderContract as LLMProvider, MemoryRetentionConfig } from '@windagency/valora-plugin-api';

import { getLogger } from '@windagency/valora-runtime';

import type { EmbedderPort } from './embedder.port.js';

import { LlmProviderEmbedder } from './llm-provider-embedder.js';

/**
 * Lookup function the host injects so the bundled vault does not depend on
 * the host's `llm/registry` directly. The host wires this to its real
 * provider registry at boot via the bootstrap glue.
 */
export interface ProviderLookup {
	createProvider(_name: string, _config: Record<string, unknown>): LLMProvider;
	getAvailableProviders(): string[];
}

/**
 * Resolve an {@link EmbedderPort} for the memory subsystem from the configured
 * embedding provider. Returns `undefined` when:
 *   - Embeddings are not configured (`memory.embedding` absent).
 *   - No provider lookup is supplied.
 *   - The configured provider does not implement `embed?()`.
 *   - The provider registry cannot construct the provider.
 *
 * Semantic recall falls back gracefully to the lexical path in any of these
 * cases, so this resolver is intentionally forgiving.
 */
export function resolveEmbedder(
	memoryConfig: MemoryRetentionConfig | undefined,
	providerLookup?: ProviderLookup
): Promise<EmbedderPort | undefined> {
	const embeddingConfig = memoryConfig?.embedding;
	if (!embeddingConfig) return Promise.resolve(undefined);
	if (providerLookup === undefined) return Promise.resolve(undefined);

	try {
		const requested = embeddingConfig.provider;
		const providerName = requested === 'auto' ? selectAutoProvider(providerLookup.getAvailableProviders()) : requested;
		if (providerName === undefined) return Promise.resolve(undefined);

		const provider: LLMProvider = providerLookup.createProvider(providerName, {});
		if (typeof provider.embed !== 'function') return Promise.resolve(undefined);

		return Promise.resolve(new LlmProviderEmbedder(provider));
	} catch (err) {
		getLogger().debug(`Memory embedder unavailable, falling back to lexical recall: ${String(err)}`);
		return Promise.resolve(undefined);
	}
}

const AUTO_PREFERENCE = ['ollama', 'openai', 'anthropic', 'google'];

function selectAutoProvider(available: string[]): string | undefined {
	const lookup = new Set(available);
	for (const candidate of AUTO_PREFERENCE) {
		if (lookup.has(candidate)) return candidate;
	}
	return undefined;
}
