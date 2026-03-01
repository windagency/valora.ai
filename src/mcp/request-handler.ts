/**
 * MCP Request Handler - Handles tool calls and result formatting
 */

import type { CommandExecutor } from 'cli/command-executor';
import type { CommandResult } from 'types/command.types';
import type { ToolCallArgs, ToolResult } from 'types/mcp.types';

import { getConfigLoader } from 'config/loader';
import { ProviderName } from 'config/providers.config';
import { getLogger } from 'output/logger';
import { generateId } from 'utils/id-generator';
import { validateToolCallArgs, type ValidationResult } from 'utils/input-validator';
import { checkRateLimit, getRateLimitStatus } from 'utils/rate-limiter';

import type { CommandFlags } from './types';

export class MCPRequestHandler {
	constructor(private commandExecutor: CommandExecutor) {}

	/**
	 * Handle a tool call from MCP
	 */
	async handleToolCall(commandName: string, args: ToolCallArgs): Promise<ToolResult> {
		const logger = getLogger();

		// Generate request ID if not present for tracing
		args.requestId ??= generateId();
		const requestId = args.requestId;

		// Validate input size and structure
		const validation: ValidationResult = validateToolCallArgs(args as Record<string, unknown>);
		if (!validation.valid) {
			logger.warn(`Input validation failed for tool call: ${commandName}`, {
				errors: validation.errors,
				metrics: validation.metrics,
				requestId,
				sessionId: args.sessionId,
				warnings: validation.warnings
			});

			return {
				content: [
					{
						text: `Input validation failed: ${validation.errors.join(', ')}`,
						type: 'text'
					}
				],
				isError: true
			};
		}

		// Log validation warnings
		if (validation.warnings.length > 0) {
			logger.info(`Tool call validation warnings: ${commandName}`, {
				metrics: validation.metrics,
				requestId,
				sessionId: args.sessionId,
				warnings: validation.warnings
			});
		}

		// Apply rate limiting
		const clientIdentifier = this.getClientIdentifier(args);
		if (!checkRateLimit(clientIdentifier, 'mcp_tool_call')) {
			const status = getRateLimitStatus(clientIdentifier, 'mcp_tool_call');
			const resetTime = new Date(status.resetTime).toISOString();
			const blockedMsg = status.blockedUntil
				? `Rate limit exceeded. Blocked until ${new Date(status.blockedUntil).toISOString()}`
				: `Rate limit exceeded. Try again after ${resetTime}`;

			logger.warn(`Rate limit exceeded for client: ${clientIdentifier}`, {
				blockedUntil: status.blockedUntil,
				clientIdentifier,
				commandName,
				remaining: status.remaining,
				requestId,
				resetTime
			});

			return {
				content: [
					{
						text: blockedMsg,
						type: 'text'
					}
				],
				isError: true
			};
		}

		this.logToolCallStart(commandName, args);

		try {
			// Execute the command
			const result = await this.commandExecutor.execute(commandName, {
				args: args.args ?? [],
				flags: await this.buildFlags(args),
				interactive: false
			});

			// Format and return result
			return this.formatToolResult(commandName, result, args);
		} catch (error) {
			logger.error(`Tool call failed: ${commandName}`, error as Error, {
				requestId,
				sessionId: args.sessionId
			});
			return this.formatToolError(commandName, error as Error, args);
		}
	}

	/**
	 * Build execution flags from tool call arguments
	 */
	private async buildFlags(args: ToolCallArgs): Promise<CommandFlags> {
		const flags: CommandFlags = {};

		if (args.provider) {
			flags.provider = args.provider;
		}

		if (args.model) {
			flags.model = args.model;
		}

		if (args.sessionId) {
			flags.sessionId = args.sessionId;
		}

		if (args.requestId) {
			flags.requestId = args.requestId;
		}

		// Add any additional flags that might be needed
		// Check if we need setup for the requested provider
		if (await this.needsSetup(args)) {
			flags.needsSetup = true;
		}

		return flags;
	}

	/**
	 * Check if provider setup is needed
	 */
	private async needsSetup(args: ToolCallArgs): Promise<boolean> {
		const configLoader = getConfigLoader();

		// Cursor provider doesn't need setup
		if (args.provider === ProviderName.CURSOR) {
			return false;
		}

		// Check if other providers are configured
		const providerName = args.provider ?? ProviderName.CURSOR;
		if (providerName === ProviderName.CURSOR) {
			return false;
		}

		try {
			const config = await configLoader.load();
			const providerConfig = config.providers[providerName as keyof typeof config.providers];
			return !providerConfig;
		} catch {
			// If config loading fails, assume setup is needed
			return true;
		}
	}

	/**
	 * Format a successful tool result
	 */
	private formatToolResult(commandName: string, result: CommandResult, args: ToolCallArgs): ToolResult {
		const logger = getLogger();

		if (result.success) {
			logger.info(`Tool call completed: ${commandName}`, {
				hasOutput: !!result.outputs,
				isGuidedCompletion: !!result.outputs?.['guidedCompletion'],
				requestId: args.requestId,
				sessionId: args.sessionId,
				stageCount: result.stages?.length ?? 0
			});

			// Handle guided completion specifically - return formatted prompt for Cursor AI
			if (result.outputs?.['guidedCompletion']) {
				const guided = result.outputs['guidedCompletion'] as {
					context: Record<string, unknown>;
					instruction: string;
					systemPrompt: string;
					userPrompt: string;
				};

				logger.always('Returning guided completion prompts for Cursor AI processing', {
					context: guided.context,
					requestId: args.requestId
				});

				// Return the pre-formatted content from cursor provider
				// It already has nice visual separators and instructions
				const formattedPrompt = this.formatGuidedCompletionForCursor(guided, result.outputs['result'] as string);

				return {
					content: [
						{
							text: formattedPrompt,
							type: 'text'
						}
					],
					isError: false,
					metadata: {
						mode: 'guided_completion',
						provider: ProviderName.CURSOR,
						requiresManualProcessing: true,
						useCursorSubscription: true
					}
				};
			}

			// Regular command output
			const output = (result.outputs?.['result'] as string) ?? 'Command completed successfully';

			return {
				content: [
					{
						text: output,
						type: 'text'
					}
				],
				isError: false
			};
		} else {
			logger.warn(`Tool call failed: ${commandName}`, {
				error: result.error,
				requestId: args.requestId,
				sessionId: args.sessionId
			});

			return {
				content: [
					{
						text: `Command failed: ${result.error ?? 'Unknown error'}`,
						type: 'text'
					}
				],
				isError: true
			};
		}
	}

	/**
	 * Format a tool error result
	 */
	private formatToolError(commandName: string, error: Error, args: ToolCallArgs): ToolResult {
		const logger = getLogger();
		logger.error(`Tool call error: ${commandName}`, error, {
			requestId: args.requestId,
			sessionId: args.sessionId
		});

		return {
			content: [
				{
					text: `Error executing command '${commandName}': ${error.message}`,
					type: 'text'
				}
			],
			isError: true
		};
	}

	/**
	 * Get a unique identifier for the client making the request
	 * Used for rate limiting and security tracking
	 */
	private getClientIdentifier(args: ToolCallArgs): string {
		// Use sessionId as primary identifier, fallback to a generic identifier
		// In a production system, you might want to use IP address, user ID, etc.
		const baseId = args.sessionId ?? 'anonymous';

		// Add some entropy to prevent simple enumeration attacks
		const timestamp = Math.floor(Date.now() / (1000 * 60)); // Minute granularity
		return `${baseId}_${timestamp}`;
	}

	/**
	 * Format guided completion for Cursor AI to process
	 * Simply returns the pre-formatted content from cursor.provider
	 */
	private formatGuidedCompletionForCursor(
		_guided: {
			context: Record<string, unknown>;
			instruction: string;
			systemPrompt: string;
			userPrompt: string;
		},
		formattedResult: string
	): string {
		// The cursor provider already formats everything using the template loader
		// Just return it directly - no reconstruction needed
		return formattedResult;
	}

	/**
	 * Log tool call start
	 */
	private logToolCallStart(commandName: string, args: ToolCallArgs): void {
		const logger = getLogger();

		// Log basic tool call info
		logger.info(`Tool call: ai_${commandName}`, {
			argCount: args.args?.length ?? 0,
			model: args.model,
			provider: args.provider,
			requestId: args.requestId,
			sessionId: args.sessionId
		});

		// Log MCP sampling availability
		const hasMCPSampling = this.commandExecutor.hasMCPSampling();
		logger.debug('MCP sampling availability', {
			requestId: args.requestId,
			samplingAvailable: hasMCPSampling
		});

		if (hasMCPSampling) {
			logger.info('Cursor MCP sampling enabled - zero-config mode active', { requestId: args.requestId });
		} else {
			logger.warn('Cursor MCP sampling not available - falling back to configured providers', {
				requestId: args.requestId
			});
		}
	}
}
