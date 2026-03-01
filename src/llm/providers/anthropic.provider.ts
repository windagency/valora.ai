/**
 * Anthropic (Claude) provider implementation
 *
 * HTTP Agent Pooling Status: ✅ IMPLEMENTED
 * Implementation: Custom fetch using undici with built-in connection pooling
 * Benefits: Connection reuse, reduced latency, improved performance
 * Note: undici (Node.js's fetch implementation) has built-in connection pooling enabled by default
 *
 * Self-registers with the LLM Provider Registry using dependency inversion pattern
 */

import type { LLMCompletionOptions, LLMCompletionResult, LLMMessage } from 'types/llm.types';

import Anthropic from '@anthropic-ai/sdk';
import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';
import { DEFAULT_MAX_TOKENS } from 'config/constants';
import { getProviderModels, ProviderName } from 'config/providers.config';
import { createHash } from 'crypto';
import { getModelMappingRegistry, type ModelMappingRegistry } from 'llm/model-mapping-registry';
import { BaseLLMProvider } from 'llm/provider.interface';
import { getProviderRegistry } from 'llm/registry';
import { Agent as UndiciAgent, fetch as undiciFetch } from 'undici';
import { createErrorContext, ProviderError, withCircuitBreaker, withRetry } from 'utils/error-handler';
import { checkRateLimit, getRateLimitStatus } from 'utils/rate-limiter';

export class AnthropicProvider extends BaseLLMProvider {
	name = ProviderName.ANTHROPIC;
	private client: Anthropic | AnthropicVertex | null = null;
	private readonly modelMappingRegistry: ModelMappingRegistry;

	// Threshold above which streaming is required by Anthropic API
	private static readonly STREAMING_THRESHOLD = 16000;

	constructor(config: Record<string, unknown> = {}) {
		super(config);
		this.modelMappingRegistry = getModelMappingRegistry();
	}

	async complete(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
		const context = createErrorContext('anthropic-provider', 'complete', {
			maxTokens: options.max_tokens,
			mode: options.mode,
			model: options.model
		});

		// Check if we're in a sandboxed environment with network blocking
		const isSandboxed =
			['AI_MCP_ENABLED', 'CI'].some((key) => process.env[key] === 'true') || process.env['NODE_ENV'] === 'test';

		if (isSandboxed && !this.isConfigured()) {
			// In sandboxed environments without API keys, provide a helpful error
			throw new ProviderError(
				'Anthropic provider not configured. In sandboxed environments, API keys are required for LLM operations.',
				{
					provider: ProviderName.ANTHROPIC,
					sandboxed: true,
					suggestion: 'Configure ANTHROPIC_API_KEY or use Cursor provider in non-sandboxed environments'
				},
				context,
				{
					fallbackValue: {
						content: 'LLM operations not available in sandboxed environment',
						role: 'assistant',
						usage: { completion_tokens: 0, prompt_tokens: 0, total_tokens: 0 }
					},
					type: 'fallback'
				}
			);
		}

		// Check rate limiting before proceeding
		const rateLimitKey = this.getRateLimitKey();
		if (!checkRateLimit(rateLimitKey, 'llm_api_call')) {
			const status = getRateLimitStatus(rateLimitKey, 'llm_api_call');
			throw new ProviderError(
				`Anthropic API rate limit exceeded. Try again in ${Math.ceil((status.resetTime - Date.now()) / 1000)} seconds.`,
				{
					blockedUntil: status.blockedUntil,
					provider: ProviderName.ANTHROPIC,
					remaining: status.remaining,
					resetTime: status.resetTime
				},
				context,
				{ maxRetries: 0, type: 'retry' } // Don't retry rate limited requests
			);
		}

		// Use streaming for large token requests (Anthropic requires streaming for requests >10 min)
		const maxTokens = options.max_tokens ?? DEFAULT_MAX_TOKENS;
		if (maxTokens > AnthropicProvider.STREAMING_THRESHOLD) {
			return this.completeWithStreaming(options);
		}

		const operation = async (): Promise<LLMCompletionResult> => {
			const client = this.getClient();
			const { messages, system } = this.formatMessages(options.messages);

			// Resolve model name based on model + mode combination
			const resolvedModel = this.resolveModelName(options.model, options.mode);

			// Format tools for Anthropic API
			const formattedTools = options.tools?.map((tool) => ({
				description: tool.description,
				input_schema: tool.parameters as Anthropic.Tool.InputSchema,
				name: tool.name
			}));

			// Diagnostic logging for tool configuration
			const logger = await import('output/logger').then((m) => m.getLogger());
			logger.info('Anthropic API call configuration', {
				hasTools: !!formattedTools,
				model: resolvedModel,
				toolCount: formattedTools?.length ?? 0,
				toolNames: formattedTools?.map((t) => t.name)
			});

			// Type-safe message creation for both Anthropic and AnthropicVertex
			const messageParams: Anthropic.MessageCreateParamsNonStreaming = {
				max_tokens: maxTokens,
				messages: messages as Anthropic.MessageParam[],
				model: resolvedModel,
				stop_sequences: options.stop,
				system,
				temperature: options.temperature,
				tools: formattedTools,
				top_p: options.top_p
			};

			const response =
				client instanceof AnthropicVertex
					? await client.messages.create(messageParams)
					: await client.messages.create(messageParams);

			return {
				content: this.extractContent(response),
				finish_reason: response.stop_reason ?? undefined,
				role: 'assistant' as const,
				tool_calls: this.extractToolCalls(response),
				usage: {
					completion_tokens: response.usage.output_tokens,
					prompt_tokens: response.usage.input_tokens,
					total_tokens: response.usage.input_tokens + response.usage.output_tokens
				}
			};
		};

		try {
			return await withCircuitBreaker(
				'anthropic-api',
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
				`Anthropic API error: ${(error as Error).message}`,
				{
					error: error,
					model: options.model,
					provider: ProviderName.ANTHROPIC
				},
				context
			);
		}
	}

	/**
	 * Complete using streaming (required for large token requests)
	 */
	override getAlternativeModels(currentModel?: string): string[] {
		const alternatives = getProviderModels(ProviderName.ANTHROPIC);
		return currentModel ? alternatives.filter((m) => m !== currentModel) : alternatives;
	}

	isConfigured(): boolean {
		const hasApiKey = typeof this.config['apiKey'] === 'string' && this.config['apiKey'].length > 0;

		const useVertex = this.config['vertexAI'] as boolean;
		const hasVertexConfig =
			useVertex &&
			typeof this.config['vertexProjectId'] === 'string' &&
			typeof this.config['vertexRegion'] === 'string';

		return hasApiKey || hasVertexConfig;
	}

	private async completeWithStreaming(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
		// Use streamComplete but collect all chunks into final result
		return this.streamComplete(options, () => {
			// No-op callback - we just need the final result
		});
	}

	/**
	 * Get a hashed identifier for rate limiting
	 * Override to support both Vertex AI (project ID) and standard API (API key) modes
	 */
	async streamComplete(options: LLMCompletionOptions, onChunk: (chunk: string) => void): Promise<LLMCompletionResult> {
		try {
			const client = this.getClient();
			const { messages, system } = this.formatMessages(options.messages);

			const streamParams = this.buildStreamParams(options, messages, system);
			const stream =
				client instanceof AnthropicVertex
					? await client.messages.create(streamParams)
					: await client.messages.create(streamParams);

			return await this.processStream(stream, onChunk);
		} catch (error) {
			throw new ProviderError(`Anthropic streaming error: ${(error as Error).message}`, {
				error: error,
				provider: ProviderName.ANTHROPIC
			});
		}
	}

	/**
	 * Build streaming parameters
	 */
	private buildStreamParams(
		options: LLMCompletionOptions,
		messages: Anthropic.MessageParam[],
		system: string | undefined
	): Anthropic.MessageCreateParamsStreaming {
		// Resolve model name for Vertex AI compatibility
		const resolvedModel = this.resolveModelName(options.model, options.mode);

		return {
			max_tokens: options.max_tokens ?? DEFAULT_MAX_TOKENS,
			messages,
			model: resolvedModel,
			stream: true,
			system,
			temperature: options.temperature,
			tools: options.tools?.map((tool) => ({
				description: tool.description,
				input_schema: tool.parameters as Anthropic.Tool.InputSchema,
				name: tool.name
			})),
			top_p: options.top_p
		};
	}

	/**
	 * Process streaming response
	 */
	override validateModel(modelName: string): Promise<boolean> {
		const knownModels = getProviderModels(ProviderName.ANTHROPIC);
		// Accept known models or any model following the claude-* pattern
		return Promise.resolve(knownModels.includes(modelName) || modelName.startsWith('claude-'));
	}

	protected override getRateLimitKey(): string {
		const useVertex = this.config['vertexAI'] as boolean;

		if (!useVertex) {
			// Fall back to standard API key rate limiting
			return super.getRateLimitKey();
		}

		// Use Vertex Project ID for rate limiting
		const projectId = this.config['vertexProjectId'] as string;
		if (!projectId) {
			throw new Error('Vertex AI Project ID not configured');
		}

		// Hash the project ID using SHA-256 and take first 8 characters for rate limiting
		const hash = createHash('sha256').update(projectId).digest('hex').substring(0, 8);

		return `${this.name}:vertex:${hash}`;
	}

	private getClient(): Anthropic | AnthropicVertex {
		if (!this.client) {
			const useVertex = this.config['vertexAI'] as boolean;
			this.client = useVertex ? this.createVertexClient() : this.createStandardClient();
		}
		return this.client;
	}

	/**
	 * Create a custom fetch function with undici connection pooling
	 */
	private createCustomFetch(): typeof globalThis.fetch {
		const dispatcher = new UndiciAgent({
			connections: 128,
			keepAliveMaxTimeout: 600 * 1000,
			keepAliveTimeout: 4 * 1000,
			keepAliveTimeoutThreshold: 1000,
			pipelining: 1
		});

		return ((input: Parameters<typeof undiciFetch>[0], init?: Parameters<typeof undiciFetch>[1]) =>
			undiciFetch(input, { ...init, dispatcher })) as typeof globalThis.fetch;
	}

	/**
	 * Create Vertex AI client
	 */
	private createVertexClient(): AnthropicVertex {
		const region = this.config['vertexRegion'] as string;
		const projectId = this.config['vertexProjectId'] as string;

		if (!region || !projectId) {
			throw new Error('Vertex AI configuration incomplete: region and projectId are required');
		}

		return new AnthropicVertex({
			fetch: this.createCustomFetch(),
			maxRetries: this.getMaxRetries(),
			projectId,
			region
		});
	}

	/**
	 * Create standard Anthropic client
	 */
	private createStandardClient(): Anthropic {
		return new Anthropic({
			apiKey: this.getApiKey(),
			fetch: this.createCustomFetch(),
			maxRetries: this.getMaxRetries(),
			timeout: this.getTimeout()
		});
	}

	private async processStream(
		stream: AsyncIterable<Anthropic.MessageStreamEvent>,
		onChunk: (chunk: string) => void
	): Promise<LLMCompletionResult> {
		let fullContent = '';
		const usage = {
			completion_tokens: 0,
			prompt_tokens: 0,
			total_tokens: 0
		};

		// Track tool use blocks being built during streaming
		const toolUseBlocks: Map<number, { id: string; input: string; name: string }> = new Map();

		const chunkHandlers: Record<string, (chunk: Anthropic.MessageStreamEvent) => void> = {
			contentBlockDelta: (chunk: Anthropic.MessageStreamEvent) => {
				if (chunk.type === 'content_block_delta') {
					if (chunk.delta.type === 'text_delta') {
						const text = chunk.delta.text;
						fullContent += text;
						onChunk(text);
					} else if (chunk.delta.type === 'input_json_delta') {
						// Accumulate JSON input for tool use
						const existing = toolUseBlocks.get(chunk.index);
						if (existing) {
							existing.input += chunk.delta.partial_json;
						}
					}
				}
			},
			contentBlockStart: (chunk: Anthropic.MessageStreamEvent) => {
				if (chunk.type === 'content_block_start' && chunk.content_block.type === 'tool_use') {
					// Start tracking a new tool use block
					toolUseBlocks.set(chunk.index, {
						id: chunk.content_block.id,
						input: '',
						name: chunk.content_block.name
					});
				}
			},
			messageDelta: (chunk: Anthropic.MessageStreamEvent) => {
				if (chunk.type === 'message_delta') {
					usage.completion_tokens = chunk.usage.output_tokens;
					usage.total_tokens = usage.prompt_tokens + usage.completion_tokens;
				}
			},
			messageStart: (chunk: Anthropic.MessageStreamEvent) => {
				if (chunk.type === 'message_start') {
					usage.prompt_tokens = chunk.message.usage.input_tokens;
				}
			}
		};

		// Map snake_case chunk types to camelCase handler keys
		const typeMap: Record<string, string> = {
			content_block_delta: 'contentBlockDelta',
			content_block_start: 'contentBlockStart',
			message_delta: 'messageDelta',
			message_start: 'messageStart'
		};

		for await (const chunk of stream) {
			chunkHandlers[typeMap[chunk.type] ?? '']?.(chunk);
		}

		// Convert accumulated tool use blocks to tool_calls format
		const toolCalls =
			toolUseBlocks.size > 0
				? Array.from(toolUseBlocks.values()).map((block) => {
						let parsedInput: Record<string, unknown> = {};
						try {
							parsedInput = JSON.parse(block.input) as Record<string, unknown>;
						} catch {
							// If JSON parsing fails, use empty object
						}
						return {
							arguments: parsedInput,
							id: block.id,
							name: block.name
						};
					})
				: undefined;

		return {
			content: fullContent,
			role: 'assistant',
			tool_calls: toolCalls,
			usage
		};
	}

	/**
	 * Resolve the actual Anthropic model name based on model and mode
	 */
	private extractContent(response: Anthropic.Message): string {
		return response.content
			.filter((block) => block.type === 'text')
			.map((block) => (block as Anthropic.TextBlock).text)
			.join('');
	}

	/**
	 * Extract tool calls from an Anthropic response
	 */
	private extractToolCalls(
		response: Anthropic.Message
	): Array<{ arguments: Record<string, unknown>; id: string; name: string }> | undefined {
		const toolUseBlocks = response.content.filter(
			(block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
		);

		if (toolUseBlocks.length === 0) {
			return undefined;
		}

		return toolUseBlocks.map((block) => ({
			arguments: block.input as Record<string, unknown>,
			id: block.id,
			name: block.name
		}));
	}

	private formatMessages(messages: LLMMessage[]): {
		messages: Anthropic.MessageParam[];
		system?: string;
	} {
		const systemContent = messages
			.filter((m) => m.role === 'system')
			.map((m) => m.content)
			.join('\n\n');

		const formattedMessages: Anthropic.MessageParam[] = [];

		for (const msg of messages) {
			const formatted = this.formatSingleMessage(msg);
			if (formatted) {
				formattedMessages.push(formatted);
			}
		}

		return {
			messages: formattedMessages,
			system: systemContent || undefined
		};
	}

	/**
	 * Format a single message for the Anthropic API
	 */
	private formatSingleMessage(msg: LLMMessage): Anthropic.MessageParam | null {
		if (msg.role === 'system') {
			return null; // System messages are handled separately
		}

		if (msg.role === 'tool') {
			return this.formatToolResultMessage(msg);
		}

		if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
			return this.formatAssistantWithToolCalls(msg);
		}

		// Regular assistant/user messages
		return {
			content: msg.content,
			role: msg.role as 'assistant' | 'user'
		};
	}

	/**
	 * Format a tool result message for Anthropic API
	 */
	private formatToolResultMessage(msg: LLMMessage): Anthropic.MessageParam {
		return {
			content: [
				{
					content: msg.content,
					tool_use_id: msg.name ?? 'unknown',
					type: 'tool_result'
				}
			],
			role: 'user'
		};
	}

	/**
	 * Format an assistant message with tool calls for Anthropic API
	 */
	private formatAssistantWithToolCalls(msg: LLMMessage): Anthropic.MessageParam {
		const contentBlocks: Array<Anthropic.TextBlockParam | Anthropic.ToolUseBlockParam> = [];

		if (msg.content) {
			contentBlocks.push({
				text: msg.content,
				type: 'text'
			});
		}

		for (const toolCall of msg.tool_calls ?? []) {
			contentBlocks.push({
				id: toolCall.id,
				input: toolCall.arguments,
				name: toolCall.name,
				type: 'tool_use'
			});
		}

		return {
			content: contentBlocks,
			role: 'assistant'
		};
	}

	private resolveModelName(model?: string, mode?: string): string {
		model ??= this.getDefaultModel() ?? 'claude-sonnet-4.5';
		const useVertex = this.config['vertexAI'] as boolean;

		// Use the model mapping registry for resolution
		return this.modelMappingRegistry.resolveWithMode(model, mode, useVertex);
	}
}

// Self-register this provider with the registry when module is loaded
getProviderRegistry().registerProvider(ProviderName.ANTHROPIC, AnthropicProvider);
