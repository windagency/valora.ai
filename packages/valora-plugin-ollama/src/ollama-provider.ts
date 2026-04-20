import OpenAI from 'openai';

import type { LLMCompletionOptions, LLMCompletionResult, LLMProvider } from 'types/llm.types';

interface OllamaManagers {
	binary: { assertInstalled(): Promise<void> };
	model: { ensureModel(_baseUrl: string, _model: string): Promise<void> };
	process: { ensureRunning(_baseUrl: string): Promise<void>; stop(): Promise<void> };
}

let managers: null | OllamaManagers = null;

export function resetManagers(): void {
	managers = null;
}

export function setManagers(m: OllamaManagers): void {
	managers = m;
}

const DEFAULT_OLLAMA_HOST = 'http://localhost:11434';
const DEFAULT_MODEL = 'llama3.1';

export class OllamaProvider implements LLMProvider {
	name = 'ollama';
	private client: null | OpenAI = null;

	private readonly config: Record<string, unknown>;

	constructor(config: Record<string, unknown>) {
		this.config = config;
	}

	async complete(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
		const model = options.model ?? this.getModel();
		await this.ensureReady(model);

		const response = await this.getClient().chat.completions.create({
			max_tokens: options.max_tokens,
			messages: options.messages.map((m) => ({
				content: m.content,
				role: m.role as 'assistant' | 'system' | 'user'
			})),
			model,
			stop: options.stop,
			temperature: options.temperature,
			tools: options.tools?.map((tool) => ({
				function: { description: tool.description, name: tool.name, parameters: tool.parameters },
				type: 'function' as const
			})),
			top_p: options.top_p
		});

		const choice = response.choices[0];
		if (!choice) throw new Error('Ollama returned no choices');

		return {
			content: choice.message.content ?? '',
			finish_reason: choice.finish_reason,
			model: response.model,
			role: 'assistant' as const,
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

	getAlternativeModels(): string[] {
		return ['llama3.1', 'mistral', 'codellama', 'phi3', 'qwen2'];
	}

	isConfigured(): boolean {
		return true;
	}

	async streamComplete(options: LLMCompletionOptions, onChunk: (_chunk: string) => void): Promise<LLMCompletionResult> {
		const model = options.model ?? this.getModel();
		await this.ensureReady(model);

		const stream = await this.getClient().chat.completions.create({
			max_tokens: options.max_tokens,
			messages: options.messages.map((m) => ({
				content: m.content,
				role: m.role as 'assistant' | 'system' | 'user'
			})),
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

		return { content: fullContent, finish_reason: finishReason, role: 'assistant' as const };
	}

	validateModel(_modelName: string): Promise<boolean> {
		return Promise.resolve(true);
	}

	private async ensureReady(model: string): Promise<void> {
		if (!managers) throw new Error('OllamaProvider: managers not initialised — register() was not called');
		const host = this.getOllamaHost();
		await managers.binary.assertInstalled();
		await managers.process.ensureRunning(host);
		await managers.model.ensureModel(host, model);
	}

	private getClient(): OpenAI {
		this.client ??= new OpenAI({
			apiKey: 'ollama',
			baseURL: `${this.getOllamaHost()}/v1`,
			maxRetries: 2
		});
		return this.client;
	}

	private getModel(): string {
		return (this.config['model'] as string) ?? DEFAULT_MODEL;
	}

	private getOllamaHost(): string {
		return (this.config['ollama_host'] as string) ?? DEFAULT_OLLAMA_HOST;
	}

	private parseArgs(raw: string): Record<string, unknown> {
		try {
			return JSON.parse(raw) as Record<string, unknown>;
		} catch {
			return {};
		}
	}
}
