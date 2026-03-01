/**
 * Command Resolver - Handles command loading and provider resolution
 */

import type { CommandLoader } from 'executor/command-loader';
import type { getProviderRegistry } from 'llm/registry';
import type { CommandDefinition } from 'types/command.types';
import type { MCPSamplingService } from 'types/mcp.types';

import { ProviderName } from 'config/providers.config';
import { getLogger, type Logger } from 'output/logger';
import { ExecutionError } from 'utils/error-handler';

import type { CommandExecutionOptions } from './command-executor';
import type { CLIProviderResolver } from './provider-resolver';

import { ProviderFallbackService, type ProviderResolutionPath, ResolutionPath } from './provider-fallback-service';

export interface ResolvedCommand {
	command: CommandDefinition;
	mode?: string;
	model?: string;
	provider: ReturnType<ReturnType<typeof getProviderRegistry>['createProvider']>;
	providerName: string;
	resolutionPath?: ProviderResolutionPath;
}

export class CommandResolver {
	private fallbackService: ProviderFallbackService;

	constructor(
		private commandLoader: CommandLoader,
		private providerResolver: CLIProviderResolver,
		private mcpSampling?: MCPSamplingService,
		fallbackService?: ProviderFallbackService
	) {
		// Use injected fallbackService or create one (for backwards compatibility)
		this.fallbackService = fallbackService ?? new ProviderFallbackService(providerResolver);
	}

	/**
	 * Load and resolve command with provider using three-tier fallback
	 */
	async resolveCommand(commandName: string, options: CommandExecutionOptions): Promise<ResolvedCommand> {
		const logger = getLogger();

		// Load command definition
		const command = await this.commandLoader.loadCommand(commandName);

		// Resolve provider with fallback handling
		const providerInfo = await this.attemptProviderResolution(command.model, options, logger);

		// Perform fallback resolution
		const resolution = await this.performFallbackResolution(providerInfo, logger);

		// Validate model availability
		await this.validateModelAvailability(
			resolution.model,
			resolution.providerName,
			resolution.provider,
			resolution.resolutionPath
		);

		return {
			command,
			mode: resolution.mode,
			model: resolution.model,
			provider: resolution.provider,
			providerName: resolution.providerName,
			resolutionPath: resolution.resolutionPath
		};
	}

	/**
	 * Attempt provider resolution with error handling
	 */
	private async attemptProviderResolution(
		commandModel: string,
		options: CommandExecutionOptions,
		logger: Logger
	): Promise<{
		mode: string | undefined;
		model: string | undefined;
		providerConfig: Record<string, unknown>;
		providerName: string;
		shouldAttemptFallback: boolean;
	}> {
		try {
			const resolved = await this.providerResolver.resolveProvider(commandModel, options);
			return {
				mode: resolved.mode,
				model: resolved.model,
				providerConfig: resolved.providerConfig as Record<string, unknown>,
				providerName: resolved.providerName,
				shouldAttemptFallback: false
			};
		} catch (err) {
			// If provider resolution failed due to missing configuration, attempt fallback
			if (err instanceof ExecutionError) {
				logger.debug(`Provider resolution failed, will attempt fallback: ${err.message}`);

				// Check if we're in MCP context (running in Cursor)
				if (process.env['AI_MCP_ENABLED'] === 'true') {
					// Set up for fallback attempt
					return {
						mode: undefined,
						model: commandModel,
						providerConfig: {},
						providerName: ProviderName.CURSOR,
						shouldAttemptFallback: true
					};
				}
			}

			// For other errors or non-MCP context, rethrow
			throw err;
		}
	}

	/**
	 * Perform fallback resolution using ProviderFallbackService
	 */
	private async performFallbackResolution(
		providerInfo: {
			mode: string | undefined;
			model: string | undefined;
			providerConfig: Record<string, unknown>;
			providerName: string;
			shouldAttemptFallback: boolean;
		},
		logger: Logger
	): Promise<{
		mode: string | undefined;
		model: string | undefined;
		provider: ReturnType<ReturnType<typeof getProviderRegistry>['createProvider']>;
		providerName: string;
		resolutionPath: ProviderResolutionPath | undefined;
	}> {
		const inMCPContext = process.env['AI_MCP_ENABLED'] === 'true';

		try {
			const resolution = await this.fallbackService.resolveWithFallback(
				{
					inMCPContext,
					mode: providerInfo.mode,
					model: providerInfo.model,
					providerConfig: providerInfo.providerConfig || {},
					providerName: providerInfo.providerName
				},
				this.mcpSampling
			);

			// Log resolution path
			if (resolution.fallbackReason) {
				logger.debug(`Provider fallback: ${resolution.fallbackReason}`, {
					providerName: resolution.providerName,
					resolutionPath: resolution.resolutionPath
				});
			}

			return {
				mode: providerInfo.mode,
				model: providerInfo.model,
				provider: resolution.provider,
				providerName: resolution.providerName,
				resolutionPath: resolution.resolutionPath
			};
		} catch (err) {
			const errorMessage = (err as Error).message;
			logger.error(`Provider resolution failed completely: ${errorMessage}`, err as Error);

			// If we get here and we're in MCP context with no API keys, provide helpful guidance
			if (inMCPContext && providerInfo.shouldAttemptFallback) {
				throw new ExecutionError(
					'Provider resolution failed. In Cursor, you have three options:\n' +
						'1. Use guided completion mode (current - no setup needed)\n' +
						'2. Configure API keys: valora config setup --quick\n' +
						'3. Wait for Cursor to add native MCP sampling support',
					{
						errorDetails: errorMessage,
						inMCPContext,
						suggestion: 'guided_completion_mode'
					}
				);
			}

			throw err;
		}
	}

	/**
	 * Validate model availability
	 */
	private async validateModelAvailability(
		model: string | undefined,
		providerName: string,
		provider: ReturnType<ReturnType<typeof getProviderRegistry>['createProvider']>,
		resolutionPath: ProviderResolutionPath | undefined
	): Promise<void> {
		// Validate model availability if model is specified
		// This provides early detection before attempting to use the model
		if (model && resolutionPath !== ResolutionPath.GUIDED) {
			// Skip validation for guided mode as it doesn't use models directly
			const isAvailable = await provider.validateModel(model);
			if (!isAvailable) {
				const alternatives = provider.getAlternativeModels(model);
				const alternativesText =
					alternatives.length > 0
						? `\n\nSuggested alternatives:\n${alternatives.map((m) => `  • ${m}`).join('\n')}`
						: '';

				throw new Error(
					`❌ Model '${model}' is not available or not supported by the '${providerName}' provider.${alternativesText}\n\nPlease specify a valid model name or check the provider documentation for available models.`
				);
			}
		}
	}
}
