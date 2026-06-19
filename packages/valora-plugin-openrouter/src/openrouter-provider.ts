import type { ChatCompletion, ChatCompletionChunk } from 'openai/resources/chat/completions';
import type { Stream } from 'openai/streaming';

import OpenAI from 'openai';

import type { LLMCompletionOptions, LLMCompletionResult, LLMProvider } from 'types/llm.types';

import { OPENROUTER_MODELS } from './models.js';

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL = OPENROUTER_MODELS.GEMMA_4_31B_FREE;
const DEFAULT_REFERER = 'https://github.com/windagency/valora.ai';
const DEFAULT_TITLE = 'Valora';

export class OpenRouterProvider implements LLMProvider {
	name = 'openrouter';
	private cachedModels: null | Set<string> = null;
	private client: null | OpenAI = null;
	private readonly config: Record<string, unknown>;

	constructor(config: Record<string, unknown>) {
		this.config = config;
	}

	async complete(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
		const model: string = options.model ?? DEFAULT_MODEL;

		const response: ChatCompletion = await this.getClient().chat.completions.create({
			max_tokens: options.max_tokens,
			messages: this.mapMessages(options),
			model,
			stop: options.stop,
			stream: false,
			temperature: options.temperature,
			tools: options.tools?.map((tool) => ({
				function: { description: tool.description, name: tool.name, parameters: tool.parameters },
				type: 'function' as const
			})),
			top_p: options.top_p
		});

		const choice = response.choices[0];
		if (!choice) throw new Error('OpenRouter returned no choices');

		return {
			content: choice.message.content ?? '',
			finish_reason: choice.finish_reason,
			model: response.model,
			role: 'assistant',
			tool_calls: choice.message.tool_calls?.map((tc) => ({
				arguments: this.parseArgs(tc.function.arguments),
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
	}

	getAlternativeModels(_currentModel?: string): string[] {
		return [
			OPENROUTER_MODELS.GEMMA_4_31B_FREE,
			OPENROUTER_MODELS.CLAUDE_SONNET_4_5,
			OPENROUTER_MODELS.GPT_4O,
			OPENROUTER_MODELS.LLAMA_3_3_70B,
			OPENROUTER_MODELS.MISTRAL_LARGE
		];
	}

	isConfigured(): boolean {
		return this.resolveApiKey() !== undefined;
	}

	async streamComplete(options: LLMCompletionOptions, onChunk: (_chunk: string) => void): Promise<LLMCompletionResult> {
		const model: string = options.model ?? DEFAULT_MODEL;

		const stream: Stream<ChatCompletionChunk> = await this.getClient().chat.completions.create({
			max_tokens: options.max_tokens,
			messages: this.mapMessages(options),
			model,
			stop: options.stop,
			stream: true,
			temperature: options.temperature,
			top_p: options.top_p
		});

		let fullContent = '';
		let finishReason: string | undefined;

		for await (const chunk of stream) {
			const choice = chunk.choices[0];
			if (choice?.delta?.content) {
				fullContent += choice.delta.content;
				onChunk(choice.delta.content);
			}
			if (choice?.finish_reason) finishReason = choice.finish_reason;
		}

		return { content: fullContent, finish_reason: finishReason, role: 'assistant' };
	}

	async validateModel(model: string): Promise<boolean> {
		if (!this.isConfigured()) return false;
		try {
			const catalogue = await this.loadCatalogue();
			return catalogue.has(model);
		} catch {
			// Network failure / non-OK response: surface as "couldn't validate" rather than throwing.
			return false;
		}
	}

	private configString(key: string, fallback: string): string {
		const value = this.config[key];
		return typeof value === 'string' && value.length > 0 ? value : fallback;
	}

	private getClient(): OpenAI {
		const apiKey = this.resolveApiKey();
		if (apiKey === undefined) {
			throw new Error('OpenRouter API key missing — set OPENROUTER_API_KEY or config.apiKey');
		}

		this.client ??= new OpenAI({
			apiKey,
			baseURL: this.configString('baseUrl', DEFAULT_BASE_URL),
			defaultHeaders: {
				'HTTP-Referer': this.configString('httpReferer', DEFAULT_REFERER),
				'X-Title': this.configString('xTitle', DEFAULT_TITLE)
			},
			maxRetries: 2
		});

		return this.client;
	}

	private async loadCatalogue(): Promise<Set<string>> {
		if (this.cachedModels !== null) return this.cachedModels;
		const response = await this.getClient().models.list();
		const ids = new Set<string>();
		for (const entry of response.data) {
			if (typeof entry.id === 'string') ids.add(entry.id);
		}
		this.cachedModels = ids;
		return ids;
	}

	private mapMessages(
		options: LLMCompletionOptions
	): Array<{ content: string; role: 'assistant' | 'system' | 'user' }> {
		return options.messages.map((m) => ({ content: m.content, role: m.role as 'assistant' | 'system' | 'user' }));
	}

	private parseArgs(raw: string): Record<string, unknown> {
		try {
			return JSON.parse(raw) as Record<string, unknown>;
		} catch {
			return {};
		}
	}

	private resolveApiKey(): string | undefined {
		const configKey = this.config['apiKey'];
		if (typeof configKey === 'string' && configKey.length > 0) {
			return configKey;
		}
		const envKey = process.env['OPENROUTER_API_KEY'];
		return typeof envKey === 'string' && envKey.length > 0 ? envKey : undefined;
	}
}
