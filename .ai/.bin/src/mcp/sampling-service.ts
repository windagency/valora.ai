/**
 * MCP Sampling Service - Handles AI model sampling via MCP
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SamplingMessage } from '@modelcontextprotocol/sdk/types.js';
import type { MCPSamplingOptions, MCPSamplingResult, MCPSamplingService } from 'types/mcp.types';

import { DEFAULT_MAX_TOKENS } from 'config/constants';
import { getLogger } from 'output/logger';
import { validateCompletionOptions, type ValidationResult } from 'utils/input-validator';
import { checkRateLimit, getRateLimitStatus } from 'utils/rate-limiter';

export class MCPSamplingServiceImpl implements MCPSamplingService {
	constructor(private mcpServer: McpServer) {}

	async requestSampling(options: MCPSamplingOptions): Promise<MCPSamplingResult> {
		const logger = getLogger();

		this.validateSamplingOptions(options, logger);
		this.checkSamplingRateLimit(options, logger);

		logger.debug('Requesting MCP sampling from Cursor', {
			hasSystemPrompt: !!options.systemPrompt,
			maxTokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
			messageCount: options.messages.length
		});

		try {
			const formattedMessages = this.formatMessagesForMCP(options);
			const response = await this.executeSamplingRequest(options, formattedMessages);

			logger.debug('MCP sampling response received', {
				contentType: response.content.type,
				model: response.model,
				stopReason: response.stopReason
			});

			return this.extractSamplingResult(response);
		} catch (error) {
			logger.error('MCP sampling request failed', error as Error, {
				maxTokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
				messageCount: options.messages.length
			});
			throw error;
		}
	}

	/**
	 * Validate sampling options
	 */
	private validateSamplingOptions(options: MCPSamplingOptions, logger: ReturnType<typeof getLogger>): void {
		const validation: ValidationResult = validateCompletionOptions(options as unknown as Record<string, unknown>);
		if (!validation.valid) {
			logger.warn(`Completion options validation failed`, {
				errors: validation.errors,
				maxTokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
				messageCount: options.messages.length,
				metrics: validation.metrics,
				warnings: validation.warnings
			});

			throw new Error(`Completion options validation failed: ${validation.errors.join(', ')}`);
		}

		if (validation.warnings.length > 0) {
			logger.info(`Completion options validation warnings`, {
				maxTokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
				messageCount: options.messages.length,
				metrics: validation.metrics,
				warnings: validation.warnings
			});
		}
	}

	/**
	 * Check rate limit for sampling requests
	 */
	private checkSamplingRateLimit(options: MCPSamplingOptions, logger: ReturnType<typeof getLogger>): void {
		const clientIdentifier = this.getSamplingClientIdentifier(options);
		if (!checkRateLimit(clientIdentifier, 'mcp_sampling')) {
			const status = getRateLimitStatus(clientIdentifier, 'mcp_sampling');
			const resetTime = new Date(status.resetTime).toISOString();
			const blockedMsg = status.blockedUntil
				? `Sampling rate limit exceeded. Blocked until ${new Date(status.blockedUntil).toISOString()}`
				: `Sampling rate limit exceeded. Try again after ${resetTime}`;

			logger.warn(`Sampling rate limit exceeded for client: ${clientIdentifier}`, {
				blockedUntil: status.blockedUntil,
				maxTokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
				messageCount: options.messages.length,
				remaining: status.remaining,
				resetTime
			});

			throw new Error(blockedMsg);
		}
	}

	/**
	 * Format messages for MCP createMessage API
	 */
	private formatMessagesForMCP(options: MCPSamplingOptions): SamplingMessage[] {
		const formattedMessages: SamplingMessage[] = options.messages.map((msg) => ({
			content: {
				text: msg.content,
				type: 'text'
			},
			role: msg.role as 'assistant' | 'user'
		}));

		// Add system prompt as first message if provided
		if (options.systemPrompt) {
			formattedMessages.unshift({
				content: {
					text: `[System]: ${options.systemPrompt}`,
					type: 'text'
				},
				role: 'user'
			});
		}

		return formattedMessages;
	}

	/**
	 * Execute the sampling request via MCP
	 */
	private async executeSamplingRequest(
		options: MCPSamplingOptions,
		formattedMessages: SamplingMessage[]
	): Promise<{ content: { text?: string; type: string }; model: string; stopReason?: string }> {
		return this.mcpServer.server.createMessage({
			maxTokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
			messages: formattedMessages,
			metadata: options.modelPreferences,
			stopSequences: options.stopSequences,
			temperature: options.temperature
		});
	}

	/**
	 * Extract sampling result from MCP response
	 */
	private extractSamplingResult(response: {
		content: { text?: string; type: string };
		model: string;
		stopReason?: string;
	}): MCPSamplingResult {
		const content = response.content.type === 'text' ? (response.content.text ?? '') : '';

		return {
			content,
			model: response.model,
			stopReason: response.stopReason
		};
	}

	/**
	 * Get a unique identifier for sampling requests
	 * Used for rate limiting sampling operations
	 */
	private getSamplingClientIdentifier(options: MCPSamplingOptions): string {
		// For sampling, we can use a more general identifier since sampling is typically
		// done through the MCP server connection. In a production system, you might
		// want to track per-user or per-session sampling limits.

		// Use a combination of message count and model preferences for uniqueness
		const modelHint = options.modelPreferences?.hints?.[0]?.name ?? 'default';
		const messageCount = options.messages.length;

		// Add timestamp granularity to prevent simple enumeration
		const timestamp = Math.floor(Date.now() / (1000 * 60)); // Minute granularity
		return `sampling_${modelHint}_${messageCount}_${timestamp}`;
	}
}
