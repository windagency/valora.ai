import OpenAI from 'openai';

import type {
	EmbeddingRequest,
	EmbeddingResult,
	LLMCompletionOptions,
	LLMCompletionResult,
	LLMProvider
} from 'types/llm.types';

export interface OllamaManagers {
	binary: { assertInstalled(): Promise<void> };
	model: {
		ensureModel(_baseUrl: string, _model: string): Promise<void>;
		listLocalModels(_baseUrl: string): Promise<string[]>;
	};
	process: { ensureRunning(_baseUrl: string): Promise<void>; stop(): Promise<void> };
}

const DEFAULT_OLLAMA_HOST = 'http://localhost:11434';
const DEFAULT_MODEL = 'llama3.1';
const DEFAULT_EMBED_MODEL = 'nomic-embed-text';

export class OllamaProvider implements LLMProvider {
	name = 'ollama';
	private client: null | OpenAI = null;

	private readonly config: Record<string, unknown>;
	private readonly managers: OllamaManagers;

	constructor(config: Record<string, unknown>, managers: OllamaManagers) {
		this.config = config;
		this.managers = managers;
	}

	async complete(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
		const model = options.model ?? this.getModel();
		await this.ensureReady(model);

		const response = await this.getClient().chat.completions.create({
			max_tokens: options.max_tokens,
			messages: this.mapMessages(options.messages),
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

	async embed(req: EmbeddingRequest): Promise<EmbeddingResult> {
		const model = req.model ?? DEFAULT_EMBED_MODEL;
		await this.ensureReady(model);

		const response = await this.getClient().embeddings.create({ input: req.input, model });
		const vectors = response.data.map((d) => d.embedding);
		const dim = vectors[0]?.length ?? 0;

		return { dim, model: response.model, vectors };
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
			messages: this.mapMessages(options.messages),
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

	async validateModel(modelName: string): Promise<boolean> {
		try {
			const host = this.getOllamaHost();
			await this.managers.binary.assertInstalled();
			await this.managers.process.ensureRunning(host);
			const models = await this.managers.model.listLocalModels(host);
			// Ollama tags include the version suffix (`llama3.1:latest`); accept both forms.
			return models.some((m) => m === modelName || m.startsWith(`${modelName}:`));
		} catch {
			// Ollama not running, binary missing, or HTTP failure — cannot confirm; surface as unvalidated.
			return false;
		}
	}

	private async ensureReady(model: string): Promise<void> {
		const host = this.getOllamaHost();
		await this.managers.binary.assertInstalled();
		await this.managers.process.ensureRunning(host);
		await this.managers.model.ensureModel(host, model);
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
		return getStringConfig(this.config, 'model', DEFAULT_MODEL);
	}

	private getOllamaHost(): string {
		return getStringConfig(this.config, 'ollama_host', DEFAULT_OLLAMA_HOST);
	}

	private mapMessages(
		messages: LLMCompletionOptions['messages']
	): Array<{ content: string; role: 'assistant' | 'system' | 'user' }> {
		return messages.map((m) => ({
			content: m.content,
			role: m.role as 'assistant' | 'system' | 'user'
		}));
	}

	private parseArgs(raw: string): Record<string, unknown> {
		try {
			return JSON.parse(raw) as Record<string, unknown>;
		} catch {
			return {};
		}
	}
}

function getStringConfig(config: Record<string, unknown>, key: string, fallback: string): string {
	const value = config[key];
	return typeof value === 'string' ? value : fallback;
}
