/**
 * OpenAI provider implementation
 *
 * HTTP Agent Pooling Status: ✅ IMPLEMENTED
 * Implementation: HttpsAgent with keepAlive: true, configured via httpAgent option
 * Benefits: Connection reuse, reduced latency, improved performance
 *
 * Self-registers with the LLM Provider Registry using dependency inversion pattern
 */

import type { BatchableProvider } from 'batch/batch-provider.interface';
import type { BatchRequest, BatchResult, BatchStatusInfo, BatchSubmission } from 'batch/batch.types';

import { generateLocalId } from 'batch/batch-session';
import {
	cancelOpenAIBatch,
	getOpenAIBatchResults,
	getOpenAIBatchStatus,
	submitOpenAIBatch
} from 'batch/providers/openai.batch-provider';
import { Agent as HttpsAgent } from 'https';
import OpenAI from 'openai';
import { getCredentialGuard } from 'security/credential-guard';

import type { LLMCompletionOptions, LLMCompletionResult, LLMUsage } from 'types/llm.types';

import { BuiltinProviders, getProviderModels } from 'config/providers.config';
import { BaseLLMProvider } from 'llm/provider.interface';
import { getProviderRegistry } from 'llm/registry';
import { createErrorContext, ProviderError, withCircuitBreaker, withRetry } from 'utils/error-handler';
import { checkRateLimit, getRateLimitStatus } from 'utils/rate-limiter';

import { OPENAI_DESCRIPTOR, REASONING_CONTROLLED_MODELS } from './openai.models';

export class OpenAIProvider extends BaseLLMProvider implements BatchableProvider {
	name = BuiltinProviders.OPENAI;
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
					provider: BuiltinProviders.OPENAI,
					remaining: status.remaining,
					resetTime: status.resetTime
				},
				context,
				{ maxRetries: 0, type: 'retry' } // Don't retry rate limited requests
			);
		}

		const operation = async (): Promise<LLMCompletionResult> => {
			const client = this.getClient();
			const model = options.model ?? this.getDefaultModel() ?? 'gpt-5';
			const { temperature, topP } = this.resolveSamplingParams(model, options);

			const response = await client.chat.completions.create({
				max_tokens: options.max_tokens,
				messages: options.messages.map((m) => ({
					content: m.content,
					role: m.role as 'assistant' | 'system' | 'user'
				})),
				model,
				stop: options.stop,
				temperature,
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
				top_p: topP
			});

			const choice = response.choices[0];

			if (!choice) {
				throw new ProviderError(
					'OpenAI API returned no choices in response',
					{
						provider: BuiltinProviders.OPENAI,
						response: response
					},
					context
				);
			}

			return {
				content: choice.message.content ?? '',
				finish_reason: choice.finish_reason,
				model: response.model,
				role: 'assistant' as const,
				tool_calls: choice.message.tool_calls?.map((tc) => ({
					arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
					id: tc.id,
					name: tc.function.name
				})),
				usage: response.usage ? this.extractUsage(response.usage) : undefined
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
				`OpenAI API error: ${getCredentialGuard().scanOutput((error as Error).message)}`,
				{
					error: error,
					model: options.model,
					provider: BuiltinProviders.OPENAI
				},
				context
			);
		}
	}

	override getAlternativeModels(currentModel?: string): string[] {
		const alternatives = getProviderModels(BuiltinProviders.OPENAI);
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
			const model = options.model ?? this.getDefaultModel() ?? 'gpt-5';
			const { temperature, topP } = this.resolveSamplingParams(model, options);

			const stream = await client.chat.completions.create({
				max_tokens: options.max_tokens,
				messages: options.messages.map((m) => ({
					content: m.content,
					role: m.role as 'assistant' | 'system' | 'user'
				})),
				model,
				stop: options.stop,
				stream: true,
				temperature,
				top_p: topP
			});

			return await this.processStream(stream, onChunk);
		} catch (error) {
			throw new ProviderError(`OpenAI streaming error: ${getCredentialGuard().scanOutput((error as Error).message)}`, {
				error: error,
				provider: BuiltinProviders.OPENAI
			});
		}
	}

	/**
	 * Process streaming response chunks into a completion result.
	 */
	override validateModel(modelName: string): Promise<boolean> {
		// Get known models from MODEL_PROVIDER_SUGGESTIONS
		const knownModels = getProviderModels(BuiltinProviders.OPENAI);

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
			// OpenAI sends usage in the final chunk when stream_options.include_usage is set
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

	/**
	 * Extract usage metrics from OpenAI response, including automatic cache metrics.
	 * OpenAI returns cached token counts in prompt_tokens_details.cached_tokens.
	 */
	private extractUsage(responseUsage: OpenAI.CompletionUsage): LLMUsage {
		const usage: LLMUsage = {
			completion_tokens: responseUsage.completion_tokens,
			prompt_tokens: responseUsage.prompt_tokens,
			total_tokens: responseUsage.total_tokens
		};

		// OpenAI automatic caching: extract cached_tokens from prompt_tokens_details
		const details = responseUsage.prompt_tokens_details as Record<string, unknown> | undefined;
		const cachedTokens = typeof details?.['cached_tokens'] === 'number' ? details['cached_tokens'] : 0;
		if (cachedTokens > 0) {
			usage.cache_read_input_tokens = cachedTokens;
		}

		return usage;
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

	/**
	 * Resolve `temperature`/`top_p` to send, or `undefined` to omit them entirely.
	 * Reasoning-controlled models (see REASONING_CONTROLLED_MODELS) reject both as
	 * unsupported parameters.
	 */
	private resolveSamplingParams(
		model: string,
		options: Pick<LLMCompletionOptions, 'temperature' | 'top_p'>
	): { temperature: number | undefined; topP: number | undefined } {
		if (REASONING_CONTROLLED_MODELS.has(model)) {
			return { temperature: undefined, topP: undefined };
		}
		return { temperature: options.temperature, topP: options.top_p };
	}

	// ─── BatchableProvider implementation ────────────────────────────────────

	async cancelBatch(batchId: string): Promise<void> {
		return cancelOpenAIBatch(this.getClient(), batchId);
	}

	async getBatchResults(batchId: string): Promise<BatchResult[]> {
		return getOpenAIBatchResults(this.getClient(), batchId);
	}

	async getBatchStatus(batchId: string): Promise<BatchStatusInfo> {
		return getOpenAIBatchStatus(this.getClient(), batchId);
	}

	async submitBatch(requests: BatchRequest[]): Promise<BatchSubmission> {
		const client = this.getClient();
		const defaultModel = this.getDefaultModel() ?? 'gpt-5';

		const formatted = requests.map((req) => {
			const model = req.options.model ?? defaultModel;
			const { temperature, topP } = this.resolveSamplingParams(model, req.options);

			return {
				customId: req.id,
				params: {
					max_tokens: req.options.max_tokens,
					messages: req.options.messages.map((m) => ({
						content: m.content,
						role: m.role as 'assistant' | 'system' | 'user'
					})),
					model,
					stop: req.options.stop,
					temperature,
					tools: req.options.tools
						? req.options.tools.map((tool) => ({
								function: {
									description: tool.description,
									name: tool.name,
									parameters: tool.parameters
								},
								type: 'function' as const
							}))
						: undefined,
					top_p: topP
				} as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming
			};
		});

		return submitOpenAIBatch(client, formatted, this.name, generateLocalId());
	}

	supportsBatch(): true {
		return true;
	}
}

// Self-register this provider with the registry when module is loaded
getProviderRegistry().registerProvider(BuiltinProviders.OPENAI, OpenAIProvider, { owner: 'core' }, OPENAI_DESCRIPTOR);
