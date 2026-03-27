/**
 * Interactive setup wizard - orchestrates the configuration setup process
 */

import { getColorAdapter } from 'output/color-adapter.interface';
import { getPromptAdapter } from 'ui/prompt-adapter.interface';
import { isPromptCancellation } from 'utils/prompt-handler';

import type { ConfigLoader } from './loader';

import { getProviderMetadata, ProviderName } from './providers.config';
import { type Config, DEFAULT_CONFIG } from './schema';
import {
	configureDefaults,
	configureProvider,
	filterValidProviders,
	PROVIDER_CHOICES,
	QUICK_SETUP_CHOICES
} from './validation-helpers';

const prompt = getPromptAdapter();

export class SetupWizard {
	private configLoader: ConfigLoader;

	constructor(configLoader: ConfigLoader) {
		this.configLoader = configLoader;
	}

	/**
	 * Run the interactive setup wizard
	 */
	async run(): Promise<Config> {
		const color = getColorAdapter();
		console.group(color.colorModifier('blue', 'bold', '\n🤖 VALORA - Setup Wizard'));

		console.info(
			color.gray('This wizard will help you configure API keys for LLM providers and set default preferences.')
		);

		// Check if running in Cursor/MCP context
		if (process.env['AI_MCP_ENABLED'] === 'true') {
			console.info(`${color.yellow('💡 TIP: You can use the Cursor Provider (no API keys needed!')}
${color.gray('   When using tools in Cursor, they automatically use your subscription.')}
${color.gray('   API keys are optional - only needed for CLI or specific providers.')}`);
		}

		console.groupEnd();

		console.log();

		const config = await this.buildBaseConfig();

		try {
			// Ask which providers to configure
			const { providers } = await prompt.prompt([
				{
					choices: PROVIDER_CHOICES,
					message: 'Which LLM providers would you like to configure?',
					name: 'providers',
					type: 'checkbox'
				}
			]);

			// Filter out the skip option
			const validProviders = filterValidProviders(providers as string[]);

			// Configure each selected provider
			if (validProviders.length === 0) {
				console.info(`${color.cyan('\n✨ No API keys configured - Using Cursor Provider only')}
${color.gray('   You can add API keys later with: valora config setup')}`);
			} else {
				// Configure providers sequentially (required for interactive prompts)
				await validProviders.reduce(async (previousPromise, provider) => {
					await previousPromise;
					return configureProvider(provider, config);
				}, Promise.resolve());
			}

			// Set default provider
			config.defaults.default_provider = await this.selectDefaultProvider(validProviders, color);

			// Configure defaults
			await configureDefaults(config);

			// Save configuration
			await this.configLoader.save(config);

			console.group();

			console.info(`${color.colorModifier('green', 'bold', '✅ Configuration saved successfully!')}
${color.gray(`Config file: ${this.configLoader.getConfigPath()}`)}`);

			console.groupEnd();

			console.log();

			return config;
		} catch (error) {
			// Propagate prompt cancellations
			if (isPromptCancellation(error)) {
				throw error;
			}
			// Rethrow other errors
			throw error;
		}
	}

	/**
	 * Build a base Config by loading the existing config file and preserving all
	 * non-wizard-managed settings (features, logging, sessions, hooks, paths).
	 * Providers are preserved from the existing file; default_provider is cleared
	 * so the wizard can set it fresh.
	 */
	private async buildBaseConfig(): Promise<Config> {
		const raw = await this.configLoader.loadRaw();
		return {
			defaults: { ...DEFAULT_CONFIG.defaults, ...(raw.defaults ?? {}), default_provider: undefined },
			paths: raw.paths ?? DEFAULT_CONFIG.paths,
			providers: { ...(raw.providers ?? {}) },
			...(raw.features && { features: raw.features }),
			...(raw.logging && { logging: raw.logging }),
			...(raw.sessions && { sessions: raw.sessions }),
			...(raw.hooks && { hooks: raw.hooks })
		} as Config;
	}

	/**
	 * Select default provider based on configured providers
	 */
	private async selectDefaultProvider(
		validProviders: string[],
		color: ReturnType<typeof getColorAdapter>
	): Promise<string> {
		// No providers configured, default to Cursor
		if (validProviders.length === 0) {
			return ProviderName.CURSOR;
		}

		// Single provider - use it automatically
		if (validProviders.length === 1) {
			const provider = validProviders[0]!;
			const providerLabel = getProviderMetadata(provider)?.label ?? provider;
			console.info(color.cyan(`\n✓ Set ${providerLabel} as default provider`));
			return provider;
		}

		// Multiple providers - prompt user to choose
		const { defaultProvider } = await prompt.prompt([
			{
				choices: validProviders.map((provider) => ({
					name: getProviderMetadata(provider)?.label ?? provider,
					value: provider
				})),
				message: 'Which provider would you like to use as default?',
				name: 'defaultProvider',
				type: 'list'
			}
		]);

		return defaultProvider as string;
	}

	/**
	 * Quick setup with minimal prompts
	 */
	async quickSetup(): Promise<Config> {
		const color = getColorAdapter();
		console.group(color.colorModifier('blue', 'bold', '\n🤖 VALORA - Quick Setup'));
		console.groupEnd();

		try {
			const { apiKey, providerChoice } = await this.getProviderFromEnvOrPrompt(color);

			const config = await this.buildBaseConfig();
			config.defaults.default_provider = providerChoice;
			if (apiKey) {
				config.providers[providerChoice as keyof typeof config.providers] = { apiKey };
			}

			await this.configLoader.save(config);

			console.group();
			console.info(`${color.colorModifier('green', 'bold', '✅ Quick setup complete!')}
${color.gray(`You can run 'valora config setup' for more options.`)}`);
			console.groupEnd();
			console.log();

			return config;
		} catch (error) {
			if (isPromptCancellation(error)) {
				throw error;
			}
			throw error;
		}
	}

	/**
	 * Configure a specific provider (used for mismatch resolution)
	 */
	async configureSpecificProvider(providerName: string): Promise<void> {
		const color = getColorAdapter();
		const config = await this.configLoader.load();

		console.group(color.cyan(`\n📦 Configuring ${providerName}`));

		try {
			await configureProvider(providerName, config);

			// If this is the only provider or no default is set, make it the default
			if (!config.defaults.default_provider) {
				config.defaults.default_provider = providerName;
				console.info(color.cyan(`✓ Set ${providerName} as default provider`));
			}

			await this.configLoader.save(config);

			console.info(color.green('✅ Configuration saved'));
			console.groupEnd();
		} catch (error) {
			console.groupEnd();
			// Propagate prompt cancellations
			if (isPromptCancellation(error)) {
				throw error;
			}
			throw error;
		}
	}

	/**
	 * Get provider choice and API key from environment variables or prompt user
	 */
	private async getProviderFromEnvOrPrompt(
		color: ReturnType<typeof getColorAdapter>
	): Promise<{ apiKey: string; providerChoice: string }> {
		// Check for environment variables first
		const envProvider = this.checkEnvForProvider();
		if (envProvider) {
			return envProvider;
		}

		// Check if non-interactive mode without API keys
		if (process.env['AI_INTERACTIVE'] === 'false' || process.env['CI']) {
			console.info(color.cyan('✨ No API keys found - Using Cursor Provider (non-interactive mode)'));
			return { apiKey: '', providerChoice: ProviderName.CURSOR };
		}

		// Interactive mode - prompt user
		return this.promptForProvider(color);
	}

	/**
	 * Check environment variables for provider configuration
	 */
	private checkEnvForProvider(): null | { apiKey: string; providerChoice: string } {
		const envMapping = {
			[ProviderName.ANTHROPIC]: process.env['AI_ANTHROPIC_API_KEY'],
			[ProviderName.GOOGLE]: process.env['AI_GOOGLE_API_KEY'],
			[ProviderName.OPENAI]: process.env['AI_OPENAI_API_KEY']
		};

		for (const [provider, apiKey] of Object.entries(envMapping)) {
			if (apiKey) {
				return { apiKey, providerChoice: provider };
			}
		}

		return null;
	}

	/**
	 * Prompt user for provider selection and API key
	 */
	private async promptForProvider(
		color: ReturnType<typeof getColorAdapter>
	): Promise<{ apiKey: string; providerChoice: string }> {
		const providerAnswer = await prompt.prompt([
			{
				choices: QUICK_SETUP_CHOICES,
				default: ProviderName.CURSOR,
				message: 'Which LLM provider would you like to use?',
				name: 'providerChoice',
				type: 'list'
			}
		]);
		const providerChoice = providerAnswer['providerChoice'] as string;

		// Cursor provider doesn't need API key
		if (providerChoice === ProviderName.CURSOR) {
			console.info(`${color.cyan('✨ Using Cursor Provider (no API key needed)')}
${color.gray('   Available when running in Cursor IDE.')}`);
			return { apiKey: '', providerChoice };
		}

		// Prompt for API key
		const apiKeyAnswer = await prompt.prompt([
			{
				message: 'Enter your API key:',
				name: 'apiKey',
				type: 'password',
				validate: (input: unknown) =>
					typeof input === 'string' && input.trim().length > 0 ? true : 'API key is required'
			}
		]);
		const keyValue = apiKeyAnswer['apiKey'];
		const apiKey = typeof keyValue === 'string' ? keyValue.trim() : '';

		return { apiKey, providerChoice };
	}

	/**
	 * Check if setup is needed
	 * Respects non-interactive mode and Cursor provider availability
	 */
	static async needsSetup(configLoader: ConfigLoader, forceInteractive = false): Promise<boolean> {
		if (this.isMCPEnabled()) {
			return false;
		}

		const isNonInteractive = this.checkNonInteractiveMode(forceInteractive);

		if (!configLoader.exists()) {
			return this.handleMissingConfig(isNonInteractive);
		}

		return this.checkExistingConfig(configLoader, isNonInteractive);
	}

	/**
	 * Check if MCP is enabled
	 */
	private static isMCPEnabled(): boolean {
		return process.env['AI_MCP_ENABLED'] === 'true';
	}

	/**
	 * Check if in non-interactive mode
	 */
	private static checkNonInteractiveMode(forceInteractive: boolean): boolean {
		return (
			process.env['AI_INTERACTIVE'] === 'false' ||
			process.env['CI'] === 'true' ||
			process.env['NODE_ENV'] === 'test' ||
			forceInteractive === false
		);
	}

	/**
	 * Handle missing config file
	 */
	private static handleMissingConfig(isNonInteractive: boolean): boolean {
		return !isNonInteractive;
	}

	/**
	 * Check existing config for setup requirements
	 */
	private static async checkExistingConfig(configLoader: ConfigLoader, isNonInteractive: boolean): Promise<boolean> {
		try {
			const config = await configLoader.load();

			if (config.defaults?.default_provider) {
				return false; // Setup already complete
			}

			if (!config.providers || typeof config.providers !== 'object') {
				return !isNonInteractive; // Only need setup if interactive
			}

			const hasConfiguredProvider = this.hasValidProvider(config.providers);

			if (hasConfiguredProvider) {
				return false;
			}

			// If no providers configured but we're non-interactive, that's OK (Cursor provider can be used)
			return !isNonInteractive;
		} catch {
			// If config loading fails and we're non-interactive, assume setup isn't needed
			return !isNonInteractive;
		}
	}

	/**
	 * Check if providers object has at least one valid provider
	 */
	private static hasValidProvider(providers: Record<string, unknown>): boolean {
		return Object.keys(providers).some((key) => {
			const providerConfig = providers[key] as undefined | { apiKey?: string };
			const providerMetadata = getProviderMetadata(key);

			if (!providerMetadata) {
				return false; // Unknown provider
			}

			if (providerMetadata.requiresApiKey) {
				return this.isValidApiKey(providerConfig?.apiKey);
			}

			// For providers that don't require API keys (like Cursor), just having the provider configured is enough
			return true;
		});
	}

	/**
	 * Check if API key is valid
	 */
	private static isValidApiKey(apiKey: string | undefined): boolean {
		return Boolean(apiKey && typeof apiKey === 'string' && apiKey.trim().length > 0);
	}
}
