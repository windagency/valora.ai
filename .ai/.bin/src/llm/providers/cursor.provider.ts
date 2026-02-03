/**
 * Cursor Provider - Uses host AI capabilities via MCP sampling
 *
 * This provider delegates LLM calls to Cursor's built-in AI via MCP's
 * sampling capability (mcpServer.server.createMessage), allowing users
 * to leverage their Cursor subscription instead of configuring separate API keys.
 *
 * Architecture: Uses dependency injection to receive MCPSamplingService,
 * eliminating tight coupling to global state and enabling testability.
 *
 * HTTP Agent Pooling Status: ✅ NOT APPLICABLE
 * Reason: Uses MCP protocol, not direct HTTP requests
 * No HTTP connections to pool
 *
 * Self-registers with the LLM Provider Registry using dependency inversion pattern
 */

import type { LLMCompletionOptions, LLMCompletionResult, LLMMessage } from 'types/llm.types';
import type { MCPSamplingService } from 'types/mcp.types';

import { COMPLETION_MODE, DEFAULT_MAX_TOKENS } from 'config/constants';
import { getProviderModels, ProviderName } from 'config/providers.config';
import { BaseLLMProvider } from 'llm/provider.interface';
import { getProviderRegistry } from 'llm/registry';
import { ProviderError } from 'utils/error-handler';
import { formatErrorMessage } from 'utils/error-utils';
import { getTemplateLoader } from 'utils/template-loader';

export class CursorProvider extends BaseLLMProvider {
	name = ProviderName.CURSOR;
	private mcpSampling: MCPSamplingService | null;

	override getAlternativeModels(currentModel?: string): string[] {
		const alternatives = getProviderModels(ProviderName.CURSOR);
		if (currentModel) {
			return alternatives.filter((m) => m !== currentModel);
		}
		return alternatives;
	}

	override validateModel(modelName: string): Promise<boolean> {
		// Get known models from MODEL_PROVIDER_SUGGESTIONS
		const knownModels = getProviderModels(ProviderName.CURSOR);

		// Check if model is in known list
		if (knownModels.includes(modelName)) {
			return Promise.resolve(true);
		}

		// Cursor manages its own models, so we generally accept valid looking model names
		// that follow cursor-* pattern or other common patterns
		return Promise.resolve(!!modelName && (modelName.startsWith('cursor-') || modelName.includes('-')));
	}

	/**
	 * Creates a CursorProvider instance
	 *
	 * @param config - Provider configuration (unused for Cursor, but required by base class)
	 * @param mcpSampling - Optional MCP sampling service. If not provided, provider will not be configured.
	 */
	constructor(config: Record<string, unknown>, mcpSampling?: MCPSamplingService) {
		super(config);
		this.mcpSampling = mcpSampling ?? null;
	}

	/**
	 * Cursor provider is configured when MCP sampling service is available
	 */
	isConfigured(): boolean {
		if (!this.mcpSampling) {
			return false;
		}
		// We can't easily test if MCP sampling actually works without making a call
		// so we just check if the service exists
		return true;
	}

	/**
	 * Complete the prompt using MCP sampling or guided completion
	 */
	async complete(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
		const logger = await import('output/logger').then((m) => m.getLogger());

		// If MCP sampling is not available, use guided completion mode
		if (!this.mcpSampling) {
			logger.always('MCP sampling service not available, using guided completion mode');
			return this.createGuidedCompletion(options);
		}

		try {
			const mcpSampling = this.getMCPSampling();

			// Format messages for Cursor
			const formattedMessages = this.formatMessages(options.messages);

			// Request sampling from Cursor via MCP
			const response = await mcpSampling.requestSampling({
				maxTokens: options.max_tokens ?? DEFAULT_MAX_TOKENS,
				messages: formattedMessages,
				modelPreferences: {
					hints: [
						{
							name: options.model ?? this.getDefaultModel() ?? 'claude-sonnet-4'
						}
					],
					intelligencePriority: 0.8 // Prefer quality
				},
				stopSequences: options.stop,
				systemPrompt: this.extractSystemPrompt(options.messages),
				temperature: options.temperature
			});

			logger.info('MCP sampling successful');
			return {
				content: response.content,
				finish_reason: response.stopReason ?? 'stop',
				role: 'assistant',
				usage: {
					// Cursor doesn't expose token counts via MCP
					completion_tokens: 0,
					prompt_tokens: 0,
					total_tokens: 0
				}
			};
		} catch (error) {
			// Check if this is specifically the "Method not found" error (-32601)
			const errorMessage = formatErrorMessage(error);
			const isMCPNotSupported = errorMessage.includes('Method not found') || errorMessage.includes('-32601');

			if (isMCPNotSupported) {
				logger.always('MCP sampling not supported by Cursor (method not found), using guided completion mode', {
					expectedBehavior: 'This is normal - Cursor will process the structured prompts directly'
				});
			} else {
				logger.always('MCP sampling failed, falling back to guided completion mode', {
					error: errorMessage,
					fallbackMode: 'guided_completion'
				});
			}

			// Always fall back to guided completion when MCP sampling fails
			return this.createGuidedCompletion(options);
		}
	}

	private getMCPSampling(): MCPSamplingService {
		if (!this.mcpSampling) {
			throw new ProviderError('Cursor provider only available when running via MCP in Cursor', {
				hint: 'This provider requires the orchestration engine to run as an MCP server in Cursor',
				provider: ProviderName.CURSOR
			});
		}
		return this.mcpSampling;
	}

	/**
	 * Create a guided completion response when sampling is not available
	 * This returns structured data for Cursor AI to process instead of trying to sample
	 */
	async streamComplete(options: LLMCompletionOptions, onChunk: (chunk: string) => void): Promise<LLMCompletionResult> {
		// MCP sampling doesn't support streaming yet
		// Fall back to non-streaming and send full content
		const result = await this.complete(options);
		onChunk(result.content);
		return result;
	}

	private async createGuidedCompletion(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
		const systemPrompt = this.extractSystemPrompt(options.messages) ?? '';
		const userMessages = options.messages.filter((m) => m.role === 'user');
		const userPrompt = userMessages.map((m) => m.content).join('\n\n');

		// Get formatted prompt from template
		const guidedPrompt = await this.formatGuidedPrompt(systemPrompt, userPrompt, options);

		return {
			content: guidedPrompt, // ✅ Used by request-handler
			finish_reason: 'guided_completion',
			guidedCompletion: {
				context: {
					maxTokens: options.max_tokens ?? DEFAULT_MAX_TOKENS,
					mode: COMPLETION_MODE.GUIDED,
					model: options.model ?? 'default',
					originalMessages: options.messages.length,
					provider: ProviderName.CURSOR,
					temperature: options.temperature,
					useCursorSubscription: true
				},
				expectedOutputSchema: {
					description: 'Cursor AI should process the prompts and return appropriate response',
					type: 'object'
				},
				instruction: '', // Not needed anymore, content has everything
				mode: COMPLETION_MODE.GUIDED,
				systemPrompt, // Keep for debugging
				userPrompt // Keep for debugging
			},
			role: 'assistant',
			usage: {
				completion_tokens: 0,
				prompt_tokens: 0,
				total_tokens: 0
			}
		};
	}

	/**
	 * Format guided prompt for Cursor AI to process
	 * Loads template from .ai/templates/GUIDED_COMPLETION.md and populates with variables
	 */
	private extractSystemPrompt(messages: LLMMessage[]): string | undefined {
		const systemMessages = messages.filter((m) => m.role === 'system');
		if (systemMessages.length === 0) return undefined;
		return systemMessages.map((m) => m.content).join('\n\n');
	}

	private async formatGuidedPrompt(
		systemPrompt: string,
		userPrompt: string,
		options: LLMCompletionOptions
	): Promise<string> {
		const templateLoader = getTemplateLoader();

		try {
			return await templateLoader.renderTemplate('GUIDED_COMPLETION', {
				maxTokens: options.max_tokens ?? DEFAULT_MAX_TOKENS,
				model: options.model ?? 'claude-sonnet-4.5 (default)',
				systemPrompt,
				temperature: options.temperature ?? '0.7 (default)',
				userPrompt
			});
		} catch (error) {
			// Fallback to inline formatting if template loading fails
			const logger = await import('output/logger').then((m) => m.getLogger());
			logger.warn('Failed to load guided completion template, using fallback', {
				error: formatErrorMessage(error)
			});

			// Use fallback inline formatting
			return this.formatGuidedPromptFallback(systemPrompt, userPrompt, options);
		}
	}

	/**
	 * Fallback inline formatting (used if template loading fails)
	 * Maintains original functionality as safety net
	 */
	private formatGuidedPromptFallback(systemPrompt: string, userPrompt: string, options: LLMCompletionOptions): string {
		const sections: string[] = [];

		sections.push('═══════════════════════════════════════════════════════════════════════════');
		sections.push('🎯 CURSOR GUIDED COMPLETION MODE (Zero Config!)');
		sections.push('═══════════════════════════════════════════════════════════════════════════');
		sections.push('');
		sections.push('✨ Good news! You can use your Cursor subscription - no API keys required!');
		sections.push('');
		sections.push('VALORA has prepared structured prompts below. Cursor MCP sampling');
		sections.push('is not yet supported, so please process these prompts using Cursor AI and');
		sections.push('generate the expected output as if it were called directly via API.');
		sections.push('');
		sections.push('This is the intended workflow - everything is working as designed! 🚀');
		sections.push('');
		sections.push('═══════════════════════════════════════════════════════════════════════════');
		sections.push('📋 SYSTEM INSTRUCTIONS');
		sections.push('═══════════════════════════════════════════════════════════════════════════');
		sections.push('');
		sections.push(systemPrompt);
		sections.push('');
		sections.push('═══════════════════════════════════════════════════════════════════════════');
		sections.push('💬 USER PROMPT');
		sections.push('═══════════════════════════════════════════════════════════════════════════');
		sections.push('');
		sections.push(userPrompt);
		sections.push('');
		sections.push('═══════════════════════════════════════════════════════════════════════════');
		sections.push('⚙️ GENERATION PARAMETERS');
		sections.push('═══════════════════════════════════════════════════════════════════════════');
		sections.push('');
		sections.push(`Model: ${options.model ?? 'claude-sonnet-4.5 (default)'}`);
		sections.push(`Max Tokens: ${options.max_tokens ?? DEFAULT_MAX_TOKENS}`);
		sections.push(`Temperature: ${options.temperature ?? '0.7 (default)'}`);
		sections.push('');
		sections.push('═══════════════════════════════════════════════════════════════════════════');
		sections.push('📝 YOUR RESPONSE BELOW');
		sections.push('═══════════════════════════════════════════════════════════════════════════');
		sections.push('');
		sections.push('Following the system instructions above, please generate your response to');
		sections.push('address the user prompt. Provide a complete, well-structured answer:');
		sections.push('');

		return sections.join('\n');
	}

	private formatMessages(messages: LLMMessage[]): Array<{ content: string; role: string }> {
		return messages
			.filter((m) => m.role !== 'system')
			.map((m) => ({
				content: m.content,
				role: m.role
			}));
	}
}

// Self-register this provider with the registry when module is loaded
getProviderRegistry().registerProvider(ProviderName.CURSOR, CursorProvider);
