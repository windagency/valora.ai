/**
 * xAI (Grok) provider implementation
 *
 * The xAI API is OpenAI-compatible, so this provider talks to it through the
 * OpenAI SDK pointed at xAI's base URL. Requires an API key.
 *
 * HTTP Agent Pooling Status: ✅ IMPLEMENTED
 * Implementation: HttpsAgent with keepAlive: true, configured via httpAgent option
 *
 * Self-registers with the LLM Provider Registry using dependency inversion pattern
 */

import { Agent as HttpsAgent } from 'https';
import OpenAI from 'openai';
import { getCredentialGuard } from 'security/credential-guard';

import type { LLMCompletionOptions, LLMCompletionResult, LLMUsage } from 'types/llm.types';

import { BuiltinProviders, getProviderModels, ModelName } from 'config/providers.config';
import { BaseLLMProvider } from 'llm/provider.interface';
import { getProviderRegistry } from 'llm/registry';
import { getLogger } from 'output/logger';
import { createErrorContext, ProviderError, withRetry } from 'utils/error-handler';
import { checkRateLimit, getRateLimitStatus } from 'utils/rate-limiter';

import { XAI_DESCRIPTOR } from './xai.models';

const DEFAULT_XAI_BASE_URL = 'https://api.x.ai/v1';

export class XAIProvider extends BaseLLMProvider {
	name = BuiltinProviders.XAI;
	private client: null | OpenAI = null;

	async complete(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
		const context = createErrorContext('xai-provider', 'complete', {
			maxTokens: options.max_tokens,
			model: options.model
		});

		const rateLimitKey = this.getRateLimitKey();
		if (!checkRateLimit(rateLimitKey, 'llm_api_call')) {
			const status = getRateLimitStatus(rateLimitKey, 'llm_api_call');
			throw new ProviderError(
				`xAI API rate limit exceeded. Try again in ${Math.ceil((status.resetTime - Date.now()) / 1000)} seconds.`,
				{
					blockedUntil: status.blockedUntil,
					provider: BuiltinProviders.XAI,
					remaining: status.remaining,
					resetTime: status.resetTime
				},
				context,
				{ maxRetries: 0, type: 'retry' }
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
				model: options.model ?? this.getDefaultModel() ?? ModelName.GROK_4_3,
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
					'xAI API returned no choices in response',
					{ provider: BuiltinProviders.XAI, response },
					context
				);
			}

			return {
				content: choice.message.content ?? '',
				finish_reason: choice.finish_reason,
				model: response.model,
				role: 'assistant' as const,
				tool_calls: choice.message.tool_calls?.map((tc) => {
					let parsedArgs: Record<string, unknown> = {};
					try {
						parsedArgs = JSON.parse(tc.function.arguments) as Record<string, unknown>;
					} catch {
						getLogger().debug(
							`xAI returned malformed tool call arguments for '${tc.function.name}' — using empty args`,
							{ rawArguments: tc.function.arguments }
						);
					}
					return {
						arguments: parsedArgs,
						id: tc.id,
						name: tc.function.name
					};
				}),
				usage: response.usage ? this.extractUsage(response.usage) : undefined
			};
		};

		try {
			return await withRetry(operation, { baseDelayMs: 1000, context, maxRetries: 3 });
		} catch (error) {
			throw new ProviderError(
				`xAI API error: ${getCredentialGuard().scanOutput((error as Error).message)}`,
				{ error, model: options.model, provider: BuiltinProviders.XAI },
				context
			);
		}
	}

	override getAlternativeModels(currentModel?: string): string[] {
		const alternatives = getProviderModels(BuiltinProviders.XAI);
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
				model: options.model ?? this.getDefaultModel() ?? ModelName.GROK_4_3,
				stop: options.stop,
				stream: true,
				temperature: options.temperature,
				top_p: options.top_p
			});

			return await this.processStream(stream, onChunk);
		} catch (error) {
			throw new ProviderError(`xAI streaming error: ${getCredentialGuard().scanOutput((error as Error).message)}`, {
				error,
				provider: BuiltinProviders.XAI
			});
		}
	}

	override validateModel(modelName: string): Promise<boolean> {
		const knownModels = getProviderModels(BuiltinProviders.XAI);
		if (knownModels.includes(modelName)) {
			return Promise.resolve(true);
		}
		// Accept anything following xAI's grok-* naming convention.
		if (modelName.startsWith('grok-')) return Promise.resolve(true);
		return Promise.resolve(false);
	}

	private extractUsage(responseUsage: OpenAI.CompletionUsage): LLMUsage {
		const usage: LLMUsage = {
			completion_tokens: responseUsage.completion_tokens,
			prompt_tokens: responseUsage.prompt_tokens,
			total_tokens: responseUsage.total_tokens
		};

		const details = responseUsage.prompt_tokens_details as Record<string, unknown> | undefined;
		const cachedTokens = typeof details?.['cached_tokens'] === 'number' ? details['cached_tokens'] : 0;
		if (cachedTokens > 0) {
			usage.cache_read_input_tokens = cachedTokens;
		}

		return usage;
	}

	private getBaseURL(): string {
		return (this.config['baseUrl'] as string) || DEFAULT_XAI_BASE_URL;
	}

	private getClient(): OpenAI {
		if (!this.client) {
			const httpsAgent = new HttpsAgent({ keepAlive: true, timeout: this.getTimeout() });
			this.client = new OpenAI({
				apiKey: this.getApiKey(),
				baseURL: this.getBaseURL(),
				httpAgent: httpsAgent,
				maxRetries: this.getMaxRetries(),
				timeout: this.getTimeout()
			});
		}
		return this.client;
	}

	private async processStream(
		stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
		onChunk: (chunk: string) => void
	): Promise<LLMCompletionResult> {
		let fullContent = '';
		let finishReason: string | undefined;
		let streamUsage: LLMUsage | undefined;

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
			if (chunk.usage) {
				streamUsage = this.extractUsage(chunk.usage);
			}
		}

		return {
			content: fullContent,
			finish_reason: finishReason,
			role: 'assistant',
			usage: streamUsage
		};
	}
}

// Self-register this provider with the registry when module is loaded
getProviderRegistry().registerProvider(BuiltinProviders.XAI, XAIProvider, { owner: 'core' }, XAI_DESCRIPTOR);
