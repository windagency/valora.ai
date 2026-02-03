/**
 * LLM Provider Interface
 */

import type { LLMCompletionOptions, LLMCompletionResult, LLMProvider } from 'types/llm.types';

import { DEFAULT_MAX_RETRIES, DEFAULT_TIMEOUT_MS } from 'config/constants';

/**
 * Base abstract class for LLM providers
 */
export abstract class BaseLLMProvider implements LLMProvider {
	abstract name: string;

	constructor(protected config: Record<string, unknown>) {}

	/**
	 * Check if provider is properly configured
	 */
	abstract isConfigured(): boolean;

	/**
	 * Complete a chat conversation
	 */
	abstract complete(options: LLMCompletionOptions): Promise<LLMCompletionResult>;

	/**
	 * Stream a chat conversation
	 */
	abstract streamComplete(
		options: LLMCompletionOptions,
		onChunk: (chunk: string) => void
	): Promise<LLMCompletionResult>;

	/**
	 * Check if the requested model is available/valid for this provider
	 *
	 * @param _modelName The model name to check
	 * @returns true if available, false otherwise
	 */
	validateModel(_modelName: string): Promise<boolean> {
		// Default implementation assumes true if no validation logic exists
		// Providers should override this to implement specific checks
		return Promise.resolve(true);
	}

	/**
	 * Get a list of alternative models for this provider
	 * Used when the requested model is unavailable
	 *
	 * @param _currentModel The model that failed validation
	 * @returns Array of alternative model names in order of preference
	 */
	getAlternativeModels(_currentModel?: string): string[] {
		// Default implementation returns empty array
		// Providers should override this to return valid alternatives
		return [];
	}

	/**
	 * Get default model for this provider
	 */
	protected getDefaultModel(): string | undefined {
		return this.config['default_model'] as string | undefined;
	}

	/**
	 * Get API key from config
	 */
	protected getApiKey(): string {
		const apiKey = this.config['apiKey'] as string;
		if (!apiKey) {
			throw new Error(`${this.name} API key not configured`);
		}
		return apiKey;
	}

	/**
	 * Get a hashed identifier for rate limiting (to avoid exposing API keys in logs)
	 */
	protected getRateLimitKey(): string {
		const apiKey = this.getApiKey();
		// Simple hash for rate limiting - not cryptographically secure
		let hash = 0;
		for (let i = 0; i < apiKey.length; i++) {
			const char = apiKey.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash; // Convert to 32-bit integer
		}
		return `${this.name}:${Math.abs(hash)}`;
	}

	/**
	 * Get timeout from config
	 */
	protected getTimeout(): number {
		return (this.config['timeout_ms'] as number) || DEFAULT_TIMEOUT_MS;
	}

	/**
	 * Get max retries from config
	 */
	protected getMaxRetries(): number {
		return (this.config['max_retries'] as number) || DEFAULT_MAX_RETRIES;
	}
}
