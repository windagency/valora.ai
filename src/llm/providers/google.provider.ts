/**
 * Google (Gemini) provider implementation
 *
 * HTTP Agent Pooling Status: ❌ NOT IMPLEMENTED
 * Reason: Google Generative AI SDK (@google/generative-ai ^0.21.0) does not support HTTP agent configuration
 * Impact: Each request creates new HTTP connections (performance optimisation opportunity)
 * Recommendation: Monitor SDK updates or consider REST API with custom HTTP client
 *
 * Self-registers with the LLM Provider Registry using dependency inversion pattern
 */

import type { LLMCompletionOptions, LLMCompletionResult } from 'types/llm.types';

import { GoogleGenerativeAI } from '@google/generative-ai';
import { getProviderModels, ProviderName } from 'config/providers.config';
import { BaseLLMProvider } from 'llm/provider.interface';
import { getProviderRegistry } from 'llm/registry';
import { ProviderError } from 'utils/error-handler';

export class GoogleProvider extends BaseLLMProvider {
	name = ProviderName.GOOGLE;
	private client: GoogleGenerativeAI | null = null;

	async complete(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
		try {
			const client = this.getClient();
			const model = client.getGenerativeModel({
				model: options.model ?? this.getDefaultModel() ?? 'gemini-2.5-pro'
			});

			const { contents, systemInstruction } = this.formatMessages(options);
			const generationConfig = this.createGenerationConfig(options);

			const result = await model.generateContent({
				contents,
				generationConfig,
				systemInstruction
			});

			return this.mapResponseToResult(result.response);
		} catch (error) {
			this.handleGoogleError(error, 'API');
		}
	}

	override getAlternativeModels(currentModel?: string): string[] {
		const alternatives = getProviderModels(ProviderName.GOOGLE);
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
			const model = client.getGenerativeModel({
				model: options.model ?? this.getDefaultModel() ?? 'gemini-2.5-pro'
			});

			const { contents, systemInstruction } = this.formatMessages(options);
			const generationConfig = this.createGenerationConfig(options);

			const result = await model.generateContentStream({
				contents,
				generationConfig,
				systemInstruction
			});

			const fullContent = await this.processStream(result.stream, onChunk);
			const response = await result.response;

			return {
				content: fullContent,
				role: 'assistant',
				usage: {
					completion_tokens: response.usageMetadata?.candidatesTokenCount ?? 0,
					prompt_tokens: response.usageMetadata?.promptTokenCount ?? 0,
					total_tokens: response.usageMetadata?.totalTokenCount ?? 0
				}
			};
		} catch (error) {
			this.handleGoogleError(error, 'streaming');
		}
	}

	override validateModel(modelName: string): Promise<boolean> {
		// Get known models from MODEL_PROVIDER_SUGGESTIONS
		const knownModels = getProviderModels(ProviderName.GOOGLE);

		// Check if model is in known list
		if (knownModels.includes(modelName)) {
			return Promise.resolve(true);
		}

		// Also accept models that follow the gemini-* or gemma-* pattern as they might be valid
		// but not yet in our list
		if (modelName.startsWith('gemini-') || modelName.startsWith('gemma-')) {
			return Promise.resolve(true);
		}

		return Promise.resolve(false);
	}

	/**
	 * Create generation config from completion options
	 */
	private createGenerationConfig(options: LLMCompletionOptions): {
		maxOutputTokens?: number;
		stopSequences?: string[];
		temperature?: number;
		topP?: number;
	} {
		return {
			maxOutputTokens: options.max_tokens,
			stopSequences: options.stop,
			temperature: options.temperature,
			topP: options.top_p
		};
	}

	private formatMessages(options: LLMCompletionOptions): {
		contents: Array<{
			parts: Array<{ text: string }>;
			role: 'model' | 'user';
		}>;
		systemInstruction?: string;
	} {
		const systemMessages = options.messages.filter((m) => m.role === 'system');
		const systemInstruction = systemMessages.map((m) => m.content).join('\n\n');

		const contents = options.messages
			.filter((m) => m.role !== 'system')
			.map((m) => ({
				parts: [{ text: m.content }],
				role: m.role === 'user' ? ('user' as const) : ('model' as const)
			}));

		return {
			contents,
			systemInstruction: systemInstruction ?? undefined
		};
	}

	private getClient(): GoogleGenerativeAI {
		// PERF-002: HTTP Agent Pooling - Partially implemented
		// Google Generative AI SDK (@google/generative-ai ^0.21.0) does not currently
		// support HTTP agent configuration. The SDK uses fetch internally without
		// configurable HTTP agents for connection pooling.
		//
		// Status: KNOWN LIMITATION - HTTP agent pooling not available
		// Recommendation: Monitor SDK updates for agent configuration support
		// Alternative: Consider using REST API directly with custom HTTP client if needed
		this.client ??= new GoogleGenerativeAI(this.getApiKey());
		return this.client;
	}

	/**
	 * Map Google API response to LLMCompletionResult
	 */
	private mapResponseToResult(response: {
		candidates?: Array<{ finishReason?: string }>;
		text: () => string;
		usageMetadata?: {
			candidatesTokenCount?: number;
			promptTokenCount?: number;
			totalTokenCount?: number;
		};
	}): LLMCompletionResult {
		return {
			content: response.text(),
			finish_reason: response.candidates?.[0]?.finishReason,
			role: 'assistant',
			usage: {
				completion_tokens: response.usageMetadata?.candidatesTokenCount ?? 0,
				prompt_tokens: response.usageMetadata?.promptTokenCount ?? 0,
				total_tokens: response.usageMetadata?.totalTokenCount ?? 0
			}
		};
	}

	/**
	 * Process streaming chunks and accumulate content
	 */
	private async processStream(
		stream: AsyncIterable<{ text: () => string }>,
		onChunk: (chunk: string) => void
	): Promise<string> {
		let fullContent = '';

		for await (const chunk of stream) {
			const text = chunk.text();
			fullContent += text;
			onChunk(text);
		}

		return fullContent;
	}

	/**
	 * Handle Google API errors with proper error messages
	 * @param error - The error to handle
	 * @param context - The context where the error occurred (e.g., 'API', 'streaming')
	 */
	private handleGoogleError(error: unknown, context: string): never {
		const typedError = error as Error;
		const errorMessage = typedError.message;

		const modelMatch = errorMessage.match(/models\/([^ ]+) is not found/);

		if (modelMatch) {
			const modelName = modelMatch[1];
			throw new ProviderError(
				`The model '${modelName}' is not available or not supported by the Google API. Please check the model name or try a supported model (e.g., gemini-3.0-pro, gemini-2.5-pro, gemini-2.5-flash).`,
				{
					error: typedError,
					provider: ProviderName.GOOGLE
				}
			);
		}

		throw new ProviderError(`Google ${context} error: ${errorMessage}`, {
			error: typedError,
			provider: ProviderName.GOOGLE
		});
	}
}

// Self-register this provider with the registry when module is loaded
getProviderRegistry().registerProvider(ProviderName.GOOGLE, GoogleProvider);
