/**
 * CLI Provider Resolver - Determines the appropriate LLM provider for command execution
 */

import type { Config, ProviderConfig } from 'types/config.types';

import { getConfigLoader } from 'config/loader';
import { getDefaultModel, getProviderModels, PROVIDER_REGISTRY, ProviderName } from 'config/providers.config';
import { getLogger } from 'output/logger';
import { ExecutionError } from 'utils/error-handler';
import { formatErrorMessage } from 'utils/error-utils';

import type { CommandExecutionOptions } from './command-executor';

// Model to provider mapping for better error messages (generated from PROVIDER_REGISTRY)
export const MODEL_PROVIDER_SUGGESTIONS: Record<
	string,
	{ modelModes: Array<{ mode: string; model: string }>; provider: string }
> = Object.fromEntries(
	Object.entries(PROVIDER_REGISTRY).map(([key, metadata]) => [
		key,
		{
			modelModes: metadata.modelModes,
			provider: key
		}
	])
);

/**
 * Get unique models for a provider from MODEL_PROVIDER_SUGGESTIONS
 * @param providerName The provider name (e.g., 'google', 'anthropic', 'openai')
 * @returns Array of unique model names for the provider
 */
export interface ProviderResolution {
	mode?: string;
	model?: string;
	providerConfig: ProviderConfig;
	providerName: string;
}

export class CLIProviderResolver {
	/**
	 * Resolve the provider for command execution
	 */
	async resolveProvider(commandModel: string, options: CommandExecutionOptions): Promise<ProviderResolution> {
		const requestedModel = (options.flags['model'] as string) || commandModel;
		const requestedMode = options.flags['mode'] as string;

		// Validate model+mode combination if both are specified
		this.validateModelModeIfNeeded(requestedModel, requestedMode);

		// Determine provider name
		let providerName = this.determineProviderName(options, requestedModel);

		// Get provider configuration (may trigger mismatch handler and change provider)
		const result = await this.getProviderConfigIfNeeded(providerName, requestedModel);

		// Check if provider was changed by mismatch handler
		if (result.resolvedProviderName) {
			providerName = result.resolvedProviderName;
		}

		return {
			mode: requestedMode,
			model: result.resolvedModel ?? requestedModel,
			providerConfig: result.config,
			providerName
		};
	}

	/**
	 * Validate model and mode combination if both are provided
	 */
	private validateModelModeIfNeeded(model: string, mode: string | undefined): void {
		if (!mode || !model) {
			return;
		}

		const logger = getLogger();
		logger.debug(`Validating model+mode combination: ${model} + ${mode}`);

		const validation = this.validateModelModeCombination(model, mode);
		if (!validation.valid) {
			logger.debug(`Model+mode validation failed: ${validation.errorMessage}`);
			throw new ExecutionError(validation.errorMessage ?? 'Unknown validation error', {
				requestedMode: mode,
				requestedModel: model,
				suggestions: validation.suggestions
			});
		}
		logger.debug(`Model+mode validation passed`);
	}

	/**
	 * Determine the provider name from options and model
	 */
	private determineProviderName(options: CommandExecutionOptions, requestedModel: string): string {
		const logger = getLogger();

		if (options.flags['provider']) {
			return options.flags['provider'] as string;
		}

		if (process.env['AI_MCP_ENABLED'] === 'true' && !options.flags['model']) {
			logger.info('Auto-selected cursor provider (MCP context)');
			return ProviderName.CURSOR;
		}

		const providerName = this.getProviderForModel(requestedModel);
		if (providerName === ProviderName.CURSOR && process.env['AI_MCP_ENABLED'] === 'true') {
			logger.info('Auto-selected cursor provider (MCP context)');
		}

		return providerName;
	}

	/**
	 * Get provider configuration if needed (cursor provider doesn't need config)
	 */
	private async getProviderConfigIfNeeded(
		providerName: string,
		requestedModel?: string
	): Promise<{ config: ProviderConfig; resolvedModel?: string; resolvedProviderName?: string }> {
		if (providerName === ProviderName.CURSOR) {
			return { config: {} }; // Empty config for cursor provider
		}
		return this.getProviderConfig(providerName, requestedModel);
	}

	/**
	 * Validate model and mode combination
	 */
	private validateModelModeCombination(
		model: string,
		mode: string
	): { errorMessage?: string; suggestions?: string[]; valid: boolean } {
		// Check all providers for this model+mode combination using find
		const matchingProvider = Object.values(MODEL_PROVIDER_SUGGESTIONS).find((providerData) =>
			providerData.modelModes.some((mm) => mm.model === model && mm.mode === mode)
		);

		if (matchingProvider) {
			return { valid: true };
		}

		// Model+mode combination not found, provide suggestions
		const providerSuggestions = Object.entries(MODEL_PROVIDER_SUGGESTIONS)
			.map(([providerKey, providerData]) => {
				const modesForModel = providerData.modelModes.filter((mm) => mm.model === model).map((mm) => mm.mode);

				return modesForModel.length > 0 ? { modesForModel, providerKey } : null;
			})
			.filter((item): item is { modesForModel: string[]; providerKey: string } => item !== null);

		const availableModesForModel = providerSuggestions.flatMap((item) => item.modesForModel);
		const suggestions = providerSuggestions.map((item) => `${item.providerKey}: ${item.modesForModel.join(', ')}`);

		let errorMessage: string;
		if (availableModesForModel.length > 0) {
			errorMessage = `Invalid model+mode combination: '${model}' with mode '${mode}' is not supported.\n\nAvailable modes for '${model}': ${availableModesForModel.join(', ')}\n\nAvailable combinations:\n${suggestions.map((s) => `  - ${s}`).join('\n')}`;
		} else {
			errorMessage = `Model '${model}' is not supported. Use --model without --mode to see available models, or choose from supported model+mode combinations.`;
		}

		return {
			errorMessage,
			suggestions,
			valid: false
		};
	}

	/**
	 * Get provider name for a given model
	 */
	private getProviderForModel(model: string): string {
		// Model-based provider inference mapping
		const providerKeywords: Record<string, string[]> = {
			[ProviderName.ANTHROPIC]: ['claude', 'anthropic'],
			[ProviderName.CURSOR]: ['cursor'],
			[ProviderName.GOOGLE]: ['gemini', 'google'],
			[ProviderName.MOONSHOT]: ['kimi', 'moonshot'],
			[ProviderName.OPENAI]: ['gpt', 'openai'],
			[ProviderName.XAI]: ['grok', 'xai']
		};

		// Find provider by checking if model includes any of its keywords
		const matchedProvider = Object.entries(providerKeywords).find(([, keywords]) =>
			keywords.some((keyword) => model.includes(keyword))
		);

		return matchedProvider ? matchedProvider[0] : ProviderName.CURSOR;
	}

	/**
	 * Get provider configuration from config file
	 */
	private async getProviderConfig(
		providerName: string,
		requestedModel?: string
	): Promise<{ config: ProviderConfig; resolvedModel?: string; resolvedProviderName?: string }> {
		const logger = getLogger();
		const configLoader = getConfigLoader();

		try {
			const config = await configLoader.load();

			if (!config.providers || typeof config.providers !== 'object') {
				logger.warn(`No provider configuration found. Will attempt cursor/guided fallback.`, {
					provider: providerName
				});
				throw new ExecutionError(`No provider configuration found. Run 'valora config setup' to configure providers.`, {
					provider: providerName
				});
			}

			const providerConfig = config.providers[providerName as keyof typeof config.providers];
			if (!providerConfig) {
				return await this.handleMissingProvider(providerName, requestedModel, config);
			}

			return { config: providerConfig };
		} catch (error) {
			// Re-throw ExecutionError as-is
			if (error instanceof ExecutionError) {
				throw error;
			}
			// Wrap other errors
			const logger = getLogger();
			logger.error(`Failed to load provider config for ${providerName}`, error as Error);
			throw new ExecutionError(`Failed to load provider configuration: ${(error as Error).message}`, {
				provider: providerName
			});
		}
	}

	/**
	 * Handle missing provider configuration
	 */
	private async handleMissingProvider(
		providerName: string,
		requestedModel: string | undefined,
		config: Config
	): Promise<{ config: ProviderConfig; resolvedModel?: string; resolvedProviderName?: string }> {
		const logger = getLogger();
		const configuredProviders = this.getConfiguredProviders(config);

		logger.warn(
			`Provider '${providerName}' not configured. Configured providers: ${configuredProviders.join(', ') ?? 'none'}`,
			{
				provider: providerName,
				requestedModel
			}
		);

		// Try interactive resolution if possible
		const resolution = await this.tryInteractiveMismatchResolution(
			providerName,
			requestedModel,
			configuredProviders,
			config
		);

		if (resolution) {
			return resolution;
		}

		// Build error message for non-interactive or when user cancels
		const suggestionMessage = this.buildProviderSuggestionMessage(providerName, configuredProviders, requestedModel);

		throw new ExecutionError(suggestionMessage, {
			configuredProviders,
			provider: providerName,
			requestedModel
		});
	}

	/**
	 * Try to resolve provider mismatch interactively
	 */
	private async tryInteractiveMismatchResolution(
		providerName: string,
		requestedModel: string | undefined,
		configuredProviders: string[],
		config: Config
	): Promise<null | { config: ProviderConfig; resolvedModel?: string; resolvedProviderName?: string }> {
		const logger = getLogger();

		// If not interactive or no configured providers, skip
		if (!process.stdout.isTTY || !process.stdin.isTTY || configuredProviders.length === 0) {
			return null;
		}

		try {
			const { ProviderMismatchHandler: providerMismatchHandler } = await import('./provider-mismatch-handler');
			const handler = new providerMismatchHandler();
			const resolution = await handler.handleMismatch(
				providerName,
				requestedModel ?? 'unknown',
				configuredProviders,
				config
			);

			if (resolution) {
				logger.info(`Resolved provider mismatch: ${providerName} → ${resolution.providerName}`, {
					originalModel: requestedModel,
					resolvedModel: resolution.model
				});

				return {
					config: resolution.providerConfig,
					resolvedModel: resolution.model,
					resolvedProviderName: resolution.providerName
				};
			}

			logger.info('User cancelled provider mismatch resolution');
			return null;
		} catch (error) {
			logger.debug('Interactive mismatch handler failed, falling back to error', {
				error: formatErrorMessage(error)
			});
			return null;
		}
	}

	/**
	 * Get list of configured providers
	 */
	private getConfiguredProviders(config: Config): string[] {
		if (!config.providers || typeof config.providers !== 'object') {
			return [];
		}

		return Object.keys(config.providers).filter((providerName) => {
			const providerConfig = config.providers[providerName as keyof typeof config.providers];
			if (!providerConfig) {
				return false;
			}

			// Check for standard API key
			if (providerConfig.apiKey) {
				return true;
			}

			// Check for Vertex AI configuration (Anthropic via Vertex)
			if (providerConfig.vertexAI && providerConfig.vertexProjectId && providerConfig.vertexRegion) {
				return true;
			}

			// Cursor provider doesn't need API key
			if (providerName === ProviderName.CURSOR) {
				return true;
			}

			return false;
		});
	}

	/**
	 * Build helpful error message with provider suggestions
	 */
	private buildProviderSuggestionMessage(
		requestedProvider: string,
		configuredProviders: string[],
		requestedModel?: string
	): string {
		let message = `Provider '${requestedProvider}' is not configured. `;

		if (requestedModel) {
			message += `The model '${requestedModel}' requires the '${requestedProvider}' provider.\n\n`;
		} else {
			message += `\n\n`;
		}

		if (configuredProviders.length === 0) {
			message += `No providers are configured. Run 'valora config setup' to configure providers.`;
		} else {
			message += `Configured providers: ${configuredProviders.join(', ')}\n\n`;

			// Suggest alternative models from configured providers
			const suggestions = configuredProviders
				.map((provider) => {
					const suggestion = MODEL_PROVIDER_SUGGESTIONS[provider];
					if (suggestion?.modelModes) {
						// Show up to 3 popular model+mode combinations per provider
						const topModels = suggestion.modelModes.slice(0, 3);
						const modelStrings = topModels.map((mm) => `${mm.model} (${mm.mode})`);
						return `${provider}: ${modelStrings.join(', ')}`;
					}
					return null;
				})
				.filter((s): s is string => s !== null);

			if (suggestions.length > 0) {
				message += `Try using one of these models instead:\n${suggestions.map((s) => `  - ${s}`).join('\n')}`;
			} else {
				message += `Run 'valora config setup' to configure additional providers or update your model selection.`;
			}
		}

		return message;
	}

	/**
	 * Get fallback provider when cursor provider is unavailable
	 * Returns the first configured provider with priority: anthropic > openai > google
	 */
	async getFallbackProvider(): Promise<null | { config: ProviderConfig; model?: string; name: string }> {
		const logger = getLogger();
		const configLoader = getConfigLoader();
		const config = await configLoader.load();

		logger.debug('Searching for fallback provider', {
			configAvailable: !!config.providers,
			inMCPContext: process.env['AI_MCP_ENABLED'] === 'true'
		});

		if (!config.providers || typeof config.providers !== 'object') {
			logger.debug('No provider configuration found - will use guided completion mode');
			return null;
		}

		// Priority order for fallback
		const priority = [
			ProviderName.ANTHROPIC,
			ProviderName.OPENAI,
			ProviderName.GOOGLE,
			ProviderName.XAI,
			ProviderName.MOONSHOT
		];

		// Find first configured provider with API key using find
		const fallbackProvider = priority
			.map((providerName, index) => {
				const providerConfig = config.providers[providerName as keyof typeof config.providers];
				return providerConfig?.apiKey
					? {
							config: providerConfig,
							index,
							name: providerName,
							providerConfig
						}
					: null;
			})
			.find((item): item is NonNullable<typeof item> => item !== null);

		if (fallbackProvider) {
			const defaultModel =
				fallbackProvider.providerConfig.default_model ?? this.getDefaultModelForProvider(fallbackProvider.name);

			logger.info(`Found fallback provider: ${fallbackProvider.name}`, {
				hasApiKey: true,
				model: defaultModel,
				priority: fallbackProvider.index + 1,
				totalPriority: priority.length
			});

			return {
				config: fallbackProvider.config,
				model: defaultModel,
				name: fallbackProvider.name
			};
		}

		logger.info('No API keys configured for fallback providers - will use guided completion mode', {
			checkedProviders: priority.join(', ')
		});

		return null;
	}

	/**
	 * Get default model for a provider from centralized provider registry
	 */
	private getDefaultModelForProvider(providerName: string): string | undefined {
		return getDefaultModel(providerName);
	}
}

export function getModelsForProvider(providerName: string): string[] {
	return getProviderModels(providerName);
}
