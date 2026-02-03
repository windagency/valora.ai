/**
 * OpenAI provider implementation
 *
 * HTTP Agent Pooling Status: ✅ IMPLEMENTED
 * Implementation: HttpsAgent with keepAlive: true, configured via httpAgent option
 * Benefits: Connection reuse, reduced latency, improved performance
 *
 * Self-registers with the LLM Provider Registry using dependency inversion pattern
 */

import type { LLMCompletionOptions, LLMCompletionResult } from 'types/llm.types';

import { getProviderModels, ProviderName } from 'config/providers.config';
import { Agent as HttpsAgent } from 'https';
import { BaseLLMProvider } from 'llm/provider.interface';
import { getProviderRegistry } from 'llm/registry';
import OpenAI from 'openai';
import { createErrorContext, ProviderError, withCircuitBreaker, withRetry } from 'utils/error-handler';
import { checkRateLimit, getRateLimitStatus } from 'utils/rate-limiter';

export class OpenAIProvider extends BaseLLMProvider {
	name = ProviderName.OPENAI;
	private client: null | OpenAI = null;

	async complete(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
		const context = createErrorContext('openai-provider', 'complete', {
			maxTokens: options.max_tokens,
			model: options.model
		});

		// Check rate limiting before proceeding
		const rateLimitKey = this.getRateLimitKey();
		if (!checkRateLimit(rateLimitKey, 'llm_api_call')) {
			const status = getRateLimitStatus(rateLimitKey, 'llm_api_call');
			throw new ProviderError(
				`OpenAI API rate limit exceeded. Try again in ${Math.ceil((status.resetTime - Date.now()) / 1000)} seconds.`,
				{
					blockedUntil: status.blockedUntil,
					provider: ProviderName.OPENAI,
					remaining: status.remaining,
					resetTime: status.resetTime
				},
				context,
				{ maxRetries: 0, type: 'retry' } // Don't retry rate limited requests
			);
		}

		const operation = async (): Promise<LLMCompletionResult> => {
			const client = this.getClient();

			const response = await client.chat.completions.create({
				max_tokens: options.max_tokens,
				messages: options.messages.map((m) => ({
					content: m.content,
					role: m.role as 'assistant' | 'system' | 'user'
				})),
				model: options.model ?? this.getDefaultModel() ?? 'gpt-5',
				stop: options.stop,
				temperature: options.temperature,
				tools: options.tools
					? options.tools.map((tool) => ({
							function: {
								description: tool.description,
								name: tool.name,
								parameters: tool.parameters
							},
							type: 'function' as const
						}))
					: undefined,
				top_p: options.top_p
			});

			const choice = response.choices[0];

			if (!choice) {
				throw new ProviderError(
					'OpenAI API returned no choices in response',
					{
						provider: ProviderName.OPENAI,
						response: response
					},
					context
				);
			}

			return {
				content: choice.message.content ?? '',
				finish_reason: choice.finish_reason,
				role: 'assistant' as const,
				tool_calls: choice.message.tool_calls?.map((tc) => ({
					arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
					id: tc.id,
					name: tc.function.name
				})),
				usage: response.usage
					? {
							completion_tokens: response.usage.completion_tokens,
							prompt_tokens: response.usage.prompt_tokens,
							total_tokens: response.usage.total_tokens
						}
					: undefined
			};
		};

		try {
			return await withCircuitBreaker(
				'openai-api',
				async () => {
					return withRetry(operation, {
						baseDelayMs: 1000,
						context,
						maxRetries: 3
					});
				},
				context
			);
		} catch (error) {
			throw new ProviderError(
				`OpenAI API error: ${(error as Error).message}`,
				{
					error: error,
					model: options.model,
					provider: ProviderName.OPENAI
				},
				context
			);
		}
	}

	override getAlternativeModels(currentModel?: string): string[] {
		const alternatives = getProviderModels(ProviderName.OPENAI);
		if (currentModel) {
			return alternatives.filter((m) => m !== currentModel);
		}
		return alternatives;
	}

	isConfigured(): boolean {
		return !!(this.config['apiKey'] && typeof this.config['apiKey'] === 'string');
	}

	async streamComplete(options: LLMCompletionOptions, onChunk: (chunk: string) => void): Promise<LLMCompletionResult> {
		try {
			const client = this.getClient();

			const stream = await client.chat.completions.create({
				max_tokens: options.max_tokens,
				messages: options.messages.map((m) => ({
					content: m.content,
					role: m.role as 'assistant' | 'system' | 'user'
				})),
				model: options.model ?? this.getDefaultModel() ?? 'gpt-5',
				stop: options.stop,
				stream: true,
				temperature: options.temperature,
				top_p: options.top_p
			});

			let fullContent = '';
			let finishReason: string | undefined;

			for await (const chunk of stream) {
				const choice = chunk.choices[0];
				const delta = choice?.delta;
				if (delta?.content) {
					fullContent += delta.content;
					onChunk(delta.content);
				}
				if (choice?.finish_reason) {
					finishReason = choice.finish_reason;
				}
			}

			return {
				content: fullContent,
				finish_reason: finishReason,
				role: 'assistant'
			};
		} catch (error) {
			throw new ProviderError(`OpenAI streaming error: ${(error as Error).message}`, {
				error: error,
				provider: ProviderName.OPENAI
			});
		}
	}

	override validateModel(modelName: string): Promise<boolean> {
		// Get known models from MODEL_PROVIDER_SUGGESTIONS
		const knownModels = getProviderModels(ProviderName.OPENAI);

		// Check if model is in known list
		if (knownModels.includes(modelName)) {
			return Promise.resolve(true);
		}

		// Also accept models that follow standard naming patterns (gpt-*, o1-*, o3-*, o4-*, ft:*)
		if (modelName.startsWith('gpt-')) return Promise.resolve(true);
		if (modelName.startsWith('o1-')) return Promise.resolve(true);
		if (modelName.startsWith('o3-')) return Promise.resolve(true);
		if (modelName.startsWith('o4-')) return Promise.resolve(true);
		if (modelName.startsWith('ft:')) return Promise.resolve(true); // Fine-tuned models

		return Promise.resolve(false);
	}

	private getClient(): OpenAI {
		if (!this.client) {
			// Configure HTTP agent with keepAlive for connection pooling
			// Note: OpenAI SDK uses a single httpAgent property for both protocols
			const httpsAgent = new HttpsAgent({
				keepAlive: true,
				timeout: this.getTimeout()
			});

			this.client = new OpenAI({
				apiKey: this.getApiKey(),
				httpAgent: httpsAgent,
				maxRetries: this.getMaxRetries(),
				timeout: this.getTimeout() // OpenAI SDK uses httpAgent for HTTPS connections
			});
		}
		return this.client;
	}
}

// Self-register this provider with the registry when module is loaded
getProviderRegistry().registerProvider(ProviderName.OPENAI, OpenAIProvider);
