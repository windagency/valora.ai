/**
 * Provider Mismatch Handler - Handles model/provider configuration mismatches interactively
 *
 * When a command requests a model that requires an unconfigured provider,
 * this handler offers interactive options to resolve the issue.
 */

import type { Config, ProviderConfig } from 'types/config.types';

import { getDefaultModel } from 'config/providers.config';
import { getColorAdapter } from 'output/color-adapter.interface';
import { getPromptAdapter } from 'ui/prompt-adapter.interface';
import { isPromptCancellation } from 'utils/prompt-handler';

const prompt = getPromptAdapter();

export interface ProviderResolution {
	model?: string;
	providerConfig: ProviderConfig;
	providerName: string;
}

export class ProviderMismatchHandler {
	/**
	 * Handle provider/model mismatch interactively
	 */
	async handleMismatch(
		requestedProvider: string,
		requestedModel: string,
		configuredProviders: string[],
		config: Config
	): Promise<null | ProviderResolution> {
		const color = getColorAdapter();

		// Show warning
		console.log();
		console.warn(color.yellow('⚠️  Model/Provider Mismatch Detected'));
		console.info(color.gray(`   Requested: ${requestedModel} (requires ${requestedProvider} provider)`));
		console.info(color.gray(`   Configured: ${configuredProviders.join(', ')}`));
		console.log();

		try {
			// Prompt for action
			const action = await this.promptUserAction(requestedProvider, configuredProviders, config);

			const actionHandlers = {
				cancel: () => null,
				configure: async () => this.configureProvider(requestedProvider),
				useDefault: () => this.useDefaultProvider(config)
			} as const;

			const handler = actionHandlers[action as keyof typeof actionHandlers];
			return handler ? await handler() : null;
		} catch (error) {
			// Handle prompt cancellation gracefully
			if (isPromptCancellation(error)) {
				console.info(color.gray('\n⏸️  Operation cancelled by user'));
				return null;
			}
			throw error;
		}
	}

	/**
	 * Prompt user for action
	 */
	private async promptUserAction(
		requestedProvider: string,
		_configuredProviders: string[],
		config: Config
	): Promise<'cancel' | 'configure' | 'useDefault'> {
		const defaultProvider = config.defaults?.default_provider;
		const defaultModel = this.getDefaultModelForProvider(defaultProvider, config);

		const choices = [
			{
				name: `Configure ${requestedProvider} provider now (run setup wizard)`,
				value: 'configure'
			},
			{
				name: `Use ${defaultProvider} provider instead (model: ${defaultModel})`,
				value: 'useDefault'
			},
			{
				name: 'Cancel command execution',
				value: 'cancel'
			}
		];

		const { action } = await prompt.prompt([
			{
				choices,
				message: 'How would you like to proceed?',
				name: 'action',
				type: 'list'
			}
		]);

		return action as 'cancel' | 'configure' | 'useDefault';
	}

	/**
	 * Configure the requested provider
	 */
	private async configureProvider(providerName: string): Promise<ProviderResolution> {
		const color = getColorAdapter();
		console.info(color.cyan(`\n📦 Configuring ${providerName} provider...`));

		// Import and run setup wizard for specific provider
		const { SetupWizard: setupWizard } = await import('../config/interactive-wizard');
		const { getConfigLoader } = await import('../config/loader');

		const configLoader = getConfigLoader();
		const wizard = new setupWizard(configLoader);

		// Run targeted provider configuration
		await wizard.configureSpecificProvider(providerName);

		// Reload config and return provider config
		const config = await configLoader.reload();
		const providerConfig = config.providers[providerName as keyof typeof config.providers];

		if (!providerConfig) {
			throw new Error(`Failed to configure ${providerName} provider`);
		}

		console.info(color.green(`✅ ${providerName} provider configured successfully\n`));

		return {
			model: providerConfig.default_model,
			providerConfig,
			providerName
		};
	}

	/**
	 * Use the default configured provider
	 */
	private useDefaultProvider(config: Config): ProviderResolution {
		const color = getColorAdapter();
		const defaultProvider = config.defaults?.default_provider;

		if (!defaultProvider) {
			throw new Error('No default provider configured');
		}

		const providerConfig = config.providers[defaultProvider as keyof typeof config.providers];
		if (!providerConfig) {
			throw new Error(`Default provider ${defaultProvider} not configured`);
		}

		const defaultModel = this.getDefaultModelForProvider(defaultProvider, config);

		console.info(color.cyan(`\n→ Switching to ${defaultProvider} provider`));
		console.info(color.gray(`  Model: ${defaultModel}\n`));

		return {
			model: defaultModel,
			providerConfig,
			providerName: defaultProvider
		};
	}

	/**
	 * Get default model for a provider
	 */
	private getDefaultModelForProvider(providerName: string | undefined, config: Config): string {
		if (!providerName) {
			return 'unknown';
		}

		const providerConfig = config.providers[providerName as keyof typeof config.providers];
		return providerConfig?.default_model ?? getDefaultModel(providerName) ?? 'unknown';
	}
}
