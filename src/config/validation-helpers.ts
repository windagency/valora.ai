/**
 * Configuration validation helpers - handles input validation and provider configuration
 */

import { getColorAdapter } from 'output/color-adapter.interface';
import { getPromptAdapter } from 'ui/prompt-adapter.interface';
import { isPromptCancellation } from 'utils/prompt-handler';

import type { Config } from './schema';

import { getAllProviderKeys, getProviderMetadata, PROVIDER_REGISTRY, ProviderName } from './providers.config';

const prompt = getPromptAdapter();

/**
 * Provider configuration labels and defaults (generated from PROVIDER_REGISTRY)
 */
export const PROVIDER_LABELS: Record<string, string> = Object.fromEntries(
	getAllProviderKeys().map((key) => [key, PROVIDER_REGISTRY[key]?.label ?? ''])
);

export const DEFAULT_MODELS: Record<string, string> = Object.fromEntries(
	getAllProviderKeys().map((key) => [key, PROVIDER_REGISTRY[key]?.defaultModel ?? ''])
);

/**
 * Available provider choices for setup wizard (generated from PROVIDER_REGISTRY)
 */
export const PROVIDER_CHOICES = [
	...getAllProviderKeys().map((key, index) => {
		const metadata = PROVIDER_REGISTRY[key];
		if (!metadata) {
			throw new Error(`Provider metadata not found for key: ${key}`);
		}
		const displayName = metadata.description ? `${metadata.label} (${metadata.description})` : metadata.label;
		return {
			checked: index === 0, // First provider (anthropic) is checked by default
			name: displayName,
			value: key
		};
	}),
	{ name: getColorAdapter().gray('Skip - No provider configuration'), value: '__skip__' }
];

/**
 * Quick setup provider choices (prioritize no-API-key providers first)
 */
export const QUICK_SETUP_CHOICES = [
	// No-API-key providers first
	...getAllProviderKeys()
		.filter((key) => !PROVIDER_REGISTRY[key]?.requiresApiKey)
		.map((key) => {
			const metadata = PROVIDER_REGISTRY[key];
			if (!metadata) {
				throw new Error(`Provider metadata not found for key: ${key}`);
			}
			return {
				name: `${metadata.label} (No API key needed)`,
				value: key
			};
		}),
	// Then API-key providers
	{ name: 'Anthropic (Claude) - Recommended', value: ProviderName.ANTHROPIC },
	{ name: 'OpenAI (GPT)', value: ProviderName.OPENAI },
	{ name: 'Google (Gemini)', value: ProviderName.GOOGLE }
];

/**
 * Configure a specific LLM provider
 */
export async function configureProvider(providerName: string, config: Config): Promise<void> {
	const color = getColorAdapter();
	const metadata = getProviderMetadata(providerName);
	if (!metadata) {
		throw new Error(`Unknown provider: ${providerName}`);
	}

	console.group(color.cyan(`\n📦 Configuring ${metadata.label}`));

	try {
		// Providers that don't require API key
		if (!metadata.requiresApiKey) {
			if (metadata.helpText) {
				console.info(color.gray(`  ${metadata.helpText}`));
			}

			const { defaultModel } = await prompt.prompt([
				{
					default: metadata.defaultModel,
					message: 'Default model (optional):',
					name: 'defaultModel',
					type: 'input'
				}
			]);

			config.providers[providerName as keyof typeof config.providers] = {
				apiKey: '', // Empty for providers without API key
				default_model: (defaultModel as string).trim() || metadata.defaultModel
			};

			console.groupEnd();
			return;
		}

		// Check if this is Anthropic provider - offer Vertex AI option
		if (providerName === ProviderName.ANTHROPIC) {
			const { useVertex } = await prompt.prompt([
				{
					default: false,
					message: 'Use Vertex AI for Claude? (Recommended for enterprise environments)',
					name: 'useVertex',
					type: 'confirm'
				}
			]);

			if (useVertex) {
				// Configure Vertex AI
				const vertexAnswers = await prompt.prompt([
					{
						message: 'Vertex AI Project ID:',
						name: 'vertexProjectId',
						type: 'input',
						validate: (input: unknown) => {
							if (typeof input !== 'string' || !input || input.trim().length === 0) {
								return 'Vertex AI Project ID is required';
							}
							return true;
						}
					},
					{
						default: 'global',
						message: 'Cloud ML Region:',
						name: 'vertexRegion',
						type: 'input'
					},
					{
						default: metadata.defaultModel,
						message: 'Default model:',
						name: 'defaultModel',
						type: 'input'
					}
				]);

				config.providers[providerName as keyof typeof config.providers] = {
					default_model: (vertexAnswers['defaultModel'] as string).trim() || metadata.defaultModel,
					vertexAI: true,
					vertexProjectId: (vertexAnswers['vertexProjectId'] as string).trim(),
					vertexRegion: (vertexAnswers['vertexRegion'] as string).trim()
				};

				console.groupEnd();
				return;
			}
		}

		// Standard API key-based provider configuration
		const { apiKey, defaultModel } = await prompt.prompt([
			{
				message: `Enter your ${metadata.label} API key:`,
				name: 'apiKey',
				type: 'password',
				validate: (input: unknown) => {
					if (typeof input !== 'string' || !input || input.trim().length === 0) {
						return 'API key is required';
					}
					return true;
				}
			},
			{
				default: metadata.defaultModel,
				message: 'Default model:',
				name: 'defaultModel',
				type: 'input'
			}
		]);

		config.providers[providerName as keyof typeof config.providers] = {
			apiKey: (apiKey as string).trim(),
			default_model: (defaultModel as string).trim()
		};

		console.groupEnd();
	} catch (error) {
		console.groupEnd();
		// Propagate prompt cancellations
		if (isPromptCancellation(error)) {
			throw error;
		}
		// Rethrow other errors
		throw error;
	}
}

/**
 * Configure default preferences
 */
export async function configureDefaults(config: Config): Promise<void> {
	const color = getColorAdapter();
	console.group(color.cyan('\n⚙️  Configuring default preferences'));

	try {
		const answers = await prompt.prompt([
			{
				default: true,
				message: 'Enable interactive mode by default?',
				name: 'interactive',
				type: 'confirm'
			},
			{
				default: true,
				message: 'Enable session mode by default?',
				name: 'session_mode',
				type: 'confirm'
			},
			{
				choices: ['debug', 'info', 'warn', 'error'],
				default: 'info',
				message: 'Default log level:',
				name: 'log_level',
				type: 'list'
			},
			{
				choices: ['markdown', 'json', 'yaml'],
				default: 'markdown',
				message: 'Default output format:',
				name: 'output_format',
				type: 'list'
			}
		]);

		config.defaults = {
			dry_run: false,
			dry_run_estimate_tokens: true,
			dry_run_show_diffs: true,
			interactive: answers['interactive'] as boolean,
			log_level: answers['log_level'] as 'debug' | 'error' | 'info' | 'warn',
			output_format: answers['output_format'] as 'json' | 'markdown' | 'yaml',
			session_mode: answers['session_mode'] as boolean
		};

		console.groupEnd();
	} catch (error) {
		console.groupEnd();
		// Propagate prompt cancellations
		if (isPromptCancellation(error)) {
			throw error;
		}
		// Rethrow other errors
		throw error;
	}
}

/**
 * Validate API key input
 */
export function validateApiKey(input: string): boolean | string {
	if (!input || input.trim().length === 0) {
		return 'API key is required';
	}
	return true;
}

/**
 * Filter out skip option from provider selection
 */
export function filterValidProviders(providers: string[]): string[] {
	return providers.filter((p) => p !== '__skip__');
}
