/* eslint-disable no-unused-vars -- pure type declarations; param names are documentation */
import type { ZodType, ZodTypeAny } from 'zod';

import type { MemoryProviderClass, MemoryProviderDescriptor, MemoryProviderFactory } from './memory.types.js';

export type PluginMemoryProvider = MemoryProviderClass | MemoryProviderFactory;

/**
 * Compression strategy function — takes raw command output and the command
 * name, returns a compressed/filtered string.
 */
export type CompressionStrategy = (output: string, command: string) => string;

/**
 * Minimal logger surface exposed to plugins.
 * Matches the structural contract of the host Logger's public debug/info/warn/error methods.
 */
export interface PluginLogger {
	debug(message: string, data?: Record<string, unknown>): void;
	error(message: string, error?: Error, data?: Record<string, unknown>): void;
	info(message: string, data?: Record<string, unknown>): void;
	warn(message: string, data?: Record<string, unknown>): void;
}

/**
 * Minimal LLM provider interface that plugins may register.
 * Mirrors the structural contract from the host's LLMProvider.
 */
export interface CodePluginModule {
	register(api: PluginAPI): Promise<void> | void;
}

export interface LLMProviderContract {
	complete(options: PluginLLMCompletionOptions): Promise<PluginLLMCompletionResult>;
	embed?(req: PluginEmbeddingRequest): Promise<PluginEmbeddingResult>;
	getAlternativeModels(currentModel?: string): string[];
	isConfigured(): boolean;
	name: string;
	streamComplete(
		options: PluginLLMCompletionOptions,
		onChunk: (chunk: string) => void
	): Promise<PluginLLMCompletionResult>;
	validateModel(modelName: string): Promise<boolean>;
}

export interface PluginAPI {
	cli: {
		addSubcommand(name: string, description: string, handler: () => Promise<void> | void): void;
	};
	compression: {
		registerStrategy(tool: string, fn: CompressionStrategy): void;
	};
	config: {
		extend<TOutput>(schema: ZodType<TOutput>): () => TOutput;
	};
	lifecycle: PluginLifecycleHooks;
	logger: PluginLogger;
	memory: {
		activate(name: string, config?: Record<string, unknown>): void;
		register(name: string, provider: PluginMemoryProvider, descriptor?: MemoryProviderDescriptor): void;
	};
	providers: {
		register(name: string, provider: PluginProvider, descriptor?: ProviderDescriptor): void;
	};
}

export interface PluginEmbeddingRequest {
	input: string[];
	model?: string;
}

export interface PluginEmbeddingResult {
	dim: number;
	model: string;
	vectors: number[][];
}

export interface PluginLifecycleHooks {
	onActivate: (fn: () => Promise<void>) => void;
	onDeactivate: (fn: () => Promise<void>) => void;
}

export interface PluginLLMCompletionOptions {
	max_tokens?: number;
	messages: PluginLLMMessage[];
	mode?: string;
	model?: string;
	requires_thinking_trace?: boolean;
	stop?: string[];
	stream?: boolean;
	temperature?: number;
	tools?: PluginLLMToolDefinition[];
	top_p?: number;
}

export interface PluginLLMCompletionResult {
	content: string;
	finish_reason?: string;
	/** The actual model name returned by the provider (may differ from the requested model) */
	model?: string;
	role: PluginLLMRole;
	tool_calls?: PluginLLMToolCall[];
	usage?: PluginLLMUsage;
	/** Guided completion mode — when a provider cannot complete directly */
	guidedCompletion?: {
		context: Record<string, unknown>;
		expectedOutputSchema?: Record<string, unknown>;
		instruction: string;
		mode: 'guided';
		systemPrompt: string;
		userPrompt: string;
	};
}

export interface PluginLLMMessage {
	content: string;
	name?: string;
	role: PluginLLMRole;
	tool_calls?: PluginLLMToolCall[];
}

export type PluginLLMRole = 'assistant' | 'system' | 'tool' | 'user';

export interface PluginLLMToolCall {
	arguments: Record<string, unknown>;
	id: string;
	name: string;
}

export interface PluginLLMToolDefinition {
	description: string;
	name: string;
	parameters: Record<string, unknown>;
}

export interface PluginLLMUsage {
	batch_discount_applied?: boolean;
	cache_creation_input_tokens?: number;
	cache_read_input_tokens?: number;
	completion_tokens: number;
	prompt_tokens: number;
	total_tokens: number;
}

export type PluginProvider = PluginProviderClass | PluginProviderFactory;

export type PluginProviderClass = new (config: Record<string, unknown>) => LLMProviderContract;

export type PluginProviderFactory = (config: Record<string, unknown>) => LLMProviderContract;

export interface ProviderDescriptor {
	configSchema?: ZodTypeAny;
	configureInteractive?: (ctx: ProviderWizardContext) => Promise<Record<string, unknown>>;
	contextWindows?: Record<string, number>;
	defaultModel: string;
	description?: string;
	envVars?: { apiKey?: string; model?: string };
	helpText?: string;
	label: string;
	modelModes: Array<{ mode: string; model: string }>;
	modelPrefix?: string;
	requiresApiKey: boolean;
}

export interface ProviderWizardContext {
	currentConfig?: Record<string, unknown>;
}
