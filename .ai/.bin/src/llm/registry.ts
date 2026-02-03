/**
 * LLM Provider Registry - Factory for creating providers
 *
 * Uses dependency inversion principle:
 * - Registry depends on interfaces (LLMProvider), not concrete implementations
 * - Providers register themselves when their modules are loaded
 * - No direct imports of concrete provider classes
 */

import type { LLMProvider, ProviderFactory } from 'types/llm.types';
import type { MCPSamplingService } from 'types/mcp.types';

import { ProviderName } from 'config/providers.config';
import { ProviderError } from 'utils/error-handler';

export class LLMProviderRegistry implements ProviderFactory {
	private providers: Map<string, new (config: Record<string, unknown>) => LLMProvider>;

	constructor() {
		this.providers = new Map();
	}

	/**
	 * Register a provider
	 */
	registerProvider(name: string, providerClass: new (config: Record<string, unknown>) => LLMProvider): void {
		this.providers.set(name, providerClass);
	}

	/**
	 * Create a provider instance
	 *
	 * @param providerName - Name of the provider to create
	 * @param config - Provider configuration
	 * @param mcpSampling - Optional MCP sampling service for CursorProvider (dependency injection)
	 *                     Required for CursorProvider to function properly.
	 */
	createProvider(providerName: string, config: Record<string, unknown>, mcpSampling?: MCPSamplingService): LLMProvider {
		const providerClass = this.providers.get(providerName);

		if (!providerClass) {
			throw new ProviderError(`Unknown provider: ${providerName}`, {
				available: this.getAvailableProviders(),
				provider: providerName
			});
		}

		// For CursorProvider, use dependency injection
		// CursorProvider has a special constructor signature: (config, mcpSampling?)
		let provider: LLMProvider;
		if (providerName === ProviderName.CURSOR) {
			// Type assertion needed because providerClass is generic, but we know
			// CursorProvider accepts mcpSampling as second parameter
			type CursorProviderConstructor = new (
				config: Record<string, unknown>,
				mcpSampling?: MCPSamplingService
			) => LLMProvider;
			const cursorProviderClass = providerClass as unknown as CursorProviderConstructor;
			provider = new cursorProviderClass(config, mcpSampling ?? undefined);
		} else {
			provider = new providerClass(config);
		}

		if (!provider.isConfigured()) {
			// Special handling for cursor provider - gives more helpful error
			if (providerName === ProviderName.CURSOR) {
				throw new ProviderError(
					`Cursor provider requires MCP context (must run in Cursor via MCP).\n\n` +
						`If you're in Cursor and seeing this error, Cursor may not support MCP sampling yet.\n` +
						`Fallback: Use a traditional provider by configuring API keys: valora config setup --quick`,
					{
						hint: 'Cursor provider only works when running as MCP server in Cursor',
						provider: providerName
					}
				);
			}

			throw new ProviderError(`Provider ${providerName} is not properly configured`, {
				hint: 'Run "valora config setup" to configure the provider',
				provider: providerName
			});
		}

		return provider;
	}

	/**
	 * Get list of available providers
	 */
	getAvailableProviders(): string[] {
		return Array.from(this.providers.keys());
	}

	/**
	 * Check if a provider is registered
	 */
	hasProvider(name: string): boolean {
		return this.providers.has(name);
	}
}

// Singleton instance
let registryInstance: LLMProviderRegistry | null = null;

/**
 * Get the singleton provider registry instance
 * Note: Providers must be initialized separately via initializeProviders()
 */
export function getProviderRegistry(): LLMProviderRegistry {
	registryInstance ??= new LLMProviderRegistry();
	return registryInstance;
}
