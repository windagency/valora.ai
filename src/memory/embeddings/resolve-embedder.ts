import type { MemoryRetentionConfig } from 'config/schema';
import type { LLMProvider } from 'types/llm.types';

import { getLogger } from 'output/logger';

import type { EmbedderPort } from './embedder.port';

import { LlmProviderEmbedder } from './llm-provider-embedder';

/**
 * Resolve an {@link EmbedderPort} for the memory subsystem from the configured
 * embedding provider. Returns `undefined` when:
 *   - Embeddings are not configured (`memory.embedding` absent).
 *   - The configured provider does not implement `embed?()`.
 *   - The provider registry cannot construct the provider (e.g., plugin
 *     not loaded in this runtime).
 *
 * Semantic recall falls back gracefully to the lexical path in any of these
 * cases, so this resolver is intentionally forgiving.
 */
export async function resolveEmbedder(
	memoryConfig: MemoryRetentionConfig | undefined
): Promise<EmbedderPort | undefined> {
	const embeddingConfig = memoryConfig?.embedding;
	if (!embeddingConfig) return undefined;

	try {
		const { getProviderRegistry } = await import('llm/registry');
		const registry = getProviderRegistry();
		const requested = embeddingConfig.provider;
		const providerName = requested === 'auto' ? selectAutoProvider(registry.getAvailableProviders()) : requested;
		if (providerName === undefined) return undefined;

		const provider: LLMProvider = registry.createProvider(providerName, {});
		if (typeof provider.embed !== 'function') return undefined;

		return new LlmProviderEmbedder(provider);
	} catch (err) {
		getLogger().debug(`Memory embedder unavailable, falling back to lexical recall: ${String(err)}`);
		return undefined;
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
