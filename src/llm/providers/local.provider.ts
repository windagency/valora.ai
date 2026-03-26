/**
 * Local model provider implementation
 *
 * Supports any OpenAI-compatible local model server:
 * Ollama, LM Studio, vLLM, llama.cpp, LocalAI, etc.
 *
 * No API key required. Default base URL: http://localhost:11434/v1
 *
 * Self-registers with the LLM Provider Registry using dependency inversion pattern
 */

import OpenAI from 'openai';

import type { LLMCompletionOptions, LLMCompletionResult, LLMUsage } from 'types/llm.types';

import { ProviderName } from 'config/providers.config';
import { BaseLLMProvider } from 'llm/provider.interface';
import { getProviderRegistry } from 'llm/registry';
import { getLogger } from 'output/logger';
import { createErrorContext, ProviderError, withRetry } from 'utils/error-handler';

const DEFAULT_LOCAL_BASE_URL = 'http://localhost:11434/v1';

export class LocalProvider extends BaseLLMProvider {
	name = ProviderName.LOCAL;
	private client: null | OpenAI = null;

	async complete(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
		const baseURL = this.getBaseURL();
		const context = createErrorContext('local-provider', 'complete', {
			baseURL,
			maxTokens: options.max_tokens,
			model: options.model
		});

		const operation = async (): Promise<LLMCompletionResult> => {
			const client = this.getClient();

			const response = await client.chat.completions.create({
				max_tokens: options.max_tokens,
				messages: options.messages.map((m) => ({
					content: m.content,
					role: m.role as 'assistant' | 'system' | 'user'
				})),
				model: options.model ?? this.getDefaultModel() ?? 'llama3.1',
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
					'Local model server returned no choices in response',
					{ baseURL, provider: ProviderName.LOCAL, response },
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
							`Local model returned malformed tool call arguments for '${tc.function.name}' — using empty args`,
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
			return await withRetry(operation, {
				baseDelayMs: 500,
				context,
				maxRetries: 2
			});
		} catch (error) {
			throw this.wrapError(error as Error, baseURL, options.model, context);
		}
	}

	isConfigured(): boolean {
		// Local provider is always available — uses default base URL if not configured
		return true;
	}

	async streamComplete(options: LLMCompletionOptions, onChunk: (chunk: string) => void): Promise<LLMCompletionResult> {
		const baseURL = this.getBaseURL();
		try {
			const client = this.getClient();

			const stream = await client.chat.completions.create({
				max_tokens: options.max_tokens,
				messages: options.messages.map((m) => ({
					content: m.content,
					role: m.role as 'assistant' | 'system' | 'user'
				})),
				model: options.model ?? this.getDefaultModel() ?? 'llama3.1',
				stop: options.stop,
				stream: true,
				temperature: options.temperature,
				top_p: options.top_p
			});

			return await this.processStream(stream, onChunk);
		} catch (error) {
			throw this.wrapError(
				error as Error,
				baseURL,
				options.model,
				createErrorContext('local-provider', 'streamComplete', { baseURL })
			);
		}
	}

	override validateModel(_modelName: string): Promise<boolean> {
		// Local model names are fully dynamic — whatever the user has loaded locally
		return Promise.resolve(true);
	}

	private extractUsage(responseUsage: OpenAI.CompletionUsage): LLMUsage {
		return {
			completion_tokens: responseUsage.completion_tokens,
			prompt_tokens: responseUsage.prompt_tokens,
			total_tokens: responseUsage.total_tokens
		};
	}

	private getBaseURL(): string {
		return (this.config['baseUrl'] as string) || DEFAULT_LOCAL_BASE_URL;
	}

	private getClient(): OpenAI {
		this.client ??= new OpenAI({
			apiKey: (this.config['apiKey'] as string) || 'not-needed',
			baseURL: this.getBaseURL(),
			maxRetries: this.getMaxRetries(),
			timeout: this.getTimeout()
		});
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

	private wrapError(
		error: Error,
		baseURL: string,
		model: string | undefined,
		context: ReturnType<typeof createErrorContext>
	): ProviderError {
		const msg = error.message;
		const code = (error as NodeJS.ErrnoException).code;

		if (code === 'ECONNREFUSED' || msg.includes('ECONNREFUSED')) {
			return new ProviderError(
				`Cannot connect to local model server at ${baseURL}. Is your server running? For Ollama: \`ollama serve\``,
				{ baseURL, error, model, provider: ProviderName.LOCAL },
				context,
				{ maxRetries: 0, type: 'retry' }
			);
		}

		if (code === 'ECONNRESET' || msg.includes('ECONNRESET') || msg.toLowerCase().includes('timeout')) {
			return new ProviderError(
				`Local model server timed out at ${baseURL}. The model may still be loading or the server is overloaded.`,
				{ baseURL, error, model, provider: ProviderName.LOCAL },
				context
			);
		}

		if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
			return new ProviderError(
				`Model '${model}' not found on local server at ${baseURL}. Check available models (e.g., \`ollama list\`).`,
				{ baseURL, error, model, provider: ProviderName.LOCAL },
				context,
				{ maxRetries: 0, type: 'retry' }
			);
		}

		return new ProviderError(
			`Local model server error: ${msg}`,
			{ baseURL, error, model, provider: ProviderName.LOCAL },
			context
		);
	}
}

// Self-register this provider with the registry when module is loaded
getProviderRegistry().registerProvider(ProviderName.LOCAL, LocalProvider);
