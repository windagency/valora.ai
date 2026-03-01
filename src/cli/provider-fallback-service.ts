/**
 * Provider Fallback Service - Manages three-tier provider resolution
 *
 * Tier 1: MCP Sampling (when Cursor supports it)
 * Tier 2: Guided Completion Mode (uses Cursor subscription, no API keys)
 * Tier 3: API Key Fallback (Anthropic, OpenAI, Google)
 */

import type { LLMProvider } from 'types/llm.types';
import type { MCPSamplingService } from 'types/mcp.types';

import { ProviderName } from 'config/providers.config';
import { getProviderRegistry } from 'llm/registry';
import { GUIDED_MODE, type GuidedMode, type ProviderResolutionPath, ResolutionPath } from 'types/provider.types';
import { formatErrorMessage } from 'utils/error-utils';

import type { CLIProviderResolver } from './provider-resolver';

/**
 * Special provider identifiers for fallback modes
 * These are synthetic names used to distinguish between different resolution modes
 */
const CURSOR_GUIDED_MODE = 'cursor-guided' as const;

/**
 * Re-export for backward compatibility
 */
export { GUIDED_MODE, ResolutionPath };
export type { GuidedMode, ProviderResolutionPath };

export interface ProviderFallbackContext {
	inMCPContext: boolean;
	mode?: string;
	model?: string;
	providerConfig: Record<string, unknown>;
	providerName: string;
}

export interface ProviderResolution {
	fallbackReason?: string;
	provider: LLMProvider;
	providerName: string;
	resolutionPath: ProviderResolutionPath;
}

export class ProviderFallbackService {
	constructor(
		private providerResolver: CLIProviderResolver,
		private providerRegistry = getProviderRegistry()
	) {}

	/**
	 * Resolve provider with automatic three-tier fallback
	 *
	 * @param context - Provider resolution context
	 * @param mcpSampling - Optional MCP sampling service
	 * @returns Provider resolution result with metadata
	 */
	async resolveWithFallback(
		context: ProviderFallbackContext,
		mcpSampling?: MCPSamplingService
	): Promise<ProviderResolution> {
		const logger = await import('output/logger').then((m) => m.getLogger());

		// TIER 1: Try MCP Sampling (if provider is cursor and MCP is available)
		if (context.providerName === ProviderName.CURSOR && mcpSampling) {
			try {
				logger.debug('Attempting Tier 1: MCP Sampling');
				const provider = this.providerRegistry.createProvider(ProviderName.CURSOR, context.providerConfig, mcpSampling);

				// Test if provider is properly configured
				if (provider.isConfigured()) {
					logger.always('✅ Using MCP Sampling (Tier 1: Zero-config mode)', {
						provider: ProviderName.CURSOR,
						resolutionPath: ResolutionPath.MCP
					});

					return {
						provider,
						providerName: ProviderName.CURSOR,
						resolutionPath: ResolutionPath.MCP
					};
				}
			} catch (error) {
				logger.debug('MCP Sampling not available, checking fallback options', {
					error: formatErrorMessage(error)
				});
			}
		}

		// TIER 2 & 3: Check if we should use guided completion or API fallback
		// Only apply fallback if we're trying to use CURSOR provider or if provider is not configured
		if (context.inMCPContext && (context.providerName === ProviderName.CURSOR || !context.providerConfig['apiKey'])) {
			// In MCP context (Cursor), check for API key fallback first
			const apiFallback = await this.providerResolver.getFallbackProvider();

			if (apiFallback) {
				// TIER 3: API Key Fallback available
				logger.always(`✅ Using API Key Fallback (Tier 3: ${apiFallback.name})`, {
					model: apiFallback.model,
					provider: apiFallback.name,
					reason: 'MCP sampling not available, API keys configured',
					resolutionPath: ResolutionPath.API_FALLBACK
				});

				const provider = this.providerRegistry.createProvider(
					apiFallback.name,
					apiFallback.config as Record<string, unknown>,
					mcpSampling
				);

				return {
					fallbackReason: 'mcp_sampling_unavailable_using_api_keys',
					provider,
					providerName: apiFallback.name,
					resolutionPath: ResolutionPath.API_FALLBACK
				};
			} else {
				// TIER 2: Guided Completion Mode (no API keys configured)
				logger.always('✅ Using Guided Completion Mode (Tier 2: Zero-config, Cursor subscription)', {
					provider: CURSOR_GUIDED_MODE,
					reason: 'No API keys configured, using Cursor subscription',
					resolutionPath: ResolutionPath.GUIDED
				});

				// Create cursor provider without MCP sampling = guided mode
				const cursorProviderClass = await import('llm/providers/cursor.provider').then((m) => m.CursorProvider);
				const provider = new cursorProviderClass({}, undefined); // No MCP sampling = guided mode

				return {
					fallbackReason: 'mcp_sampling_unavailable_using_guided_mode',
					provider,
					providerName: CURSOR_GUIDED_MODE,
					resolutionPath: ResolutionPath.GUIDED
				};
			}
		}

		// Not in MCP context - use traditional provider resolution
		logger.debug('Not in MCP context, using traditional provider resolution', {
			provider: context.providerName
		});

		const provider = this.providerRegistry.createProvider(context.providerName, context.providerConfig, mcpSampling);

		return {
			provider,
			providerName: context.providerName,
			resolutionPath: ResolutionPath.API_FALLBACK
		};
	}

	/**
	 * Check if we should use guided completion mode
	 * Returns true if in MCP context but no API keys configured
	 */
	async shouldUseGuidedCompletion(): Promise<boolean> {
		const inMCPContext = process.env['AI_MCP_ENABLED'] === 'true';
		if (!inMCPContext) return false;

		const fallback = await this.providerResolver.getFallbackProvider();
		return fallback === null; // No API keys = use guided mode
	}

	/**
	 * Get human-readable description of resolution path
	 */
	getResolutionPathDescription(path: ProviderResolutionPath): string {
		const pathDescriptions: Record<ProviderResolutionPath, string> = {
			[ResolutionPath.API_FALLBACK]: 'API Key Mode (external provider with API keys)',
			[ResolutionPath.GUIDED]: 'Guided Completion Mode (Cursor subscription, no API keys)',
			[ResolutionPath.MCP]: 'MCP Sampling (native Cursor support)'
		};

		return pathDescriptions[path];
	}
}
