/**
 * LLM Provider type definitions
 */

import type { GuidedMode } from './provider.types';

export interface LLMCompletionOptions {
	max_tokens?: number;
	messages: LLMMessage[];
	mode?: string;
	model?: string;
	stop?: string[];
	stream?: boolean;
	temperature?: number;
	tools?: LLMToolDefinition[];
	top_p?: number;
}

export interface LLMCompletionResult {
	content: string;
	finish_reason?: string;
	role: LLMRole;
	tool_calls?: LLMToolCall[];
	usage?: LLMUsage;
	// Guided completion mode - when provider can't complete directly
	guidedCompletion?: {
		context: Record<string, unknown>;
		expectedOutputSchema?: Record<string, unknown>;
		instruction: string;
		mode: GuidedMode;
		systemPrompt: string;
		userPrompt: string;
	};
}

export interface LLMMessage {
	content: string;
	name?: string;
	role: LLMRole;
	/**
	 * Tool calls made by the assistant (only for role='assistant')
	 * Required by Anthropic API when sending tool_result messages back
	 */
	tool_calls?: LLMToolCall[];
}

export interface LLMProvider {
	complete(options: LLMCompletionOptions): Promise<LLMCompletionResult>;
	getAlternativeModels(currentModel?: string): string[];
	isConfigured(): boolean;
	name: string;
	streamComplete(options: LLMCompletionOptions, onChunk: (chunk: string) => void): Promise<LLMCompletionResult>;
	validateModel(modelName: string): Promise<boolean>;
}

export type LLMRole = 'assistant' | 'system' | 'tool' | 'user';

export interface LLMToolCall {
	arguments: Record<string, unknown>;
	id: string;
	name: string;
}

export interface LLMToolDefinition {
	description: string;
	name: string;
	parameters: Record<string, unknown>;
}

export interface LLMToolResult {
	output: string;
	tool_call_id: string;
}

export interface LLMUsage {
	completion_tokens: number;
	prompt_tokens: number;
	total_tokens: number;
}

export interface ProviderFactory {
	createProvider(providerName: string, config: Record<string, unknown>): LLMProvider;
	getAvailableProviders(): string[];
}
