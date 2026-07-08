/**
 * Configuration validation helpers - handles input validation and provider configuration
 */

import type { ProviderDescriptor } from 'plugins/plugin-api.types';

import { getColorAdapter } from 'output/color-adapter.interface';
// eslint-disable-next-line valora-local/import-layer-remedy
import { getPromptAdapter } from 'ui/prompt-adapter.interface';
import { isPromptCancellation } from 'utils/prompt-handler';

import type { Config } from './schema';

import { getProviderCatalog } from './provider-catalog';
import { BuiltinProviders, getAllProviderKeys, PROVIDER_REGISTRY } from './providers.config';

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
 * Order provider keys for display: alphabetical by label (case-insensitive),
 * with the built-in `local` provider always pinned last. Plugin-contributed
 * providers are sorted alongside the built-ins.
 */
export function sortProviderKeysForDisplay(keys: string[], labelOf: (key: string) => string): string[] {
	return [...keys].sort((a, b) => {
		if (a === BuiltinProviders.LOCAL && b === BuiltinProviders.LOCAL) return 0;
		if (a === BuiltinProviders.LOCAL) return 1;
		if (b === BuiltinProviders.LOCAL) return -1;
		return labelOf(a).toLowerCase().localeCompare(labelOf(b).toLowerCase());
	});
}

/**
 * Available provider choices for setup wizard (queries the catalog at call time).
 * Providers are listed alphabetically by label, with Local always last.
 */
export function getProviderChoices(): Array<{ checked?: boolean; name: string; value: string }> {
	const catalog = getProviderCatalog();
	const keys = sortProviderKeysForDisplay(
		catalog.getAllProviderKeys(),
		(key) => catalog.getProviderMetadata(key)?.label ?? key
	);
	const choices: Array<{ checked?: boolean; name: string; value: string }> = keys.map((key, index) => {
		const metadata = catalog.getProviderMetadata(key);
		if (!metadata) {
			throw new Error(`Provider metadata not found for key: ${key}`);
		}
		const displayName = metadata.description ? `${metadata.label} (${metadata.description})` : metadata.label;
		return {
			checked: index === 0, // First provider checked by default
			name: displayName,
			value: key
		};
	});
	choices.push({ name: getColorAdapter().gray('Skip - No provider configuration'), value: '__skip__' });
	return choices;
}

/**
 * Quick setup provider choices (queries the catalog at call time).
 * Providers are listed alphabetically by label, with Local always last.
 * No-API-key providers are annotated so users can spot the zero-config options.
 */
export function getQuickSetupChoices(): Array<{ name: string; value: string }> {
	const catalog = getProviderCatalog();
	const keys = sortProviderKeysForDisplay(
		catalog.getAllProviderKeys(),
		(key) => catalog.getProviderMetadata(key)?.label ?? key
	);
	return keys.map((key) => {
		const metadata = catalog.getProviderMetadata(key);
		const label = metadata?.label ?? key;
		const suffix = metadata && !metadata.requiresApiKey ? ' (No API key needed)' : '';
		return { name: `${label}${suffix}`, value: key };
	});
}

/**
 * Configure the local provider — prompts for base URL and default model
 */
async function configureLocalProvider(metadata: ProviderDescriptor, config: Config): Promise<void> {
	const color = getColorAdapter();
	if (metadata.helpText) {
		console.info(color.gray(`  ${metadata.helpText}`));
	}

	const { baseUrl, defaultModel } = await prompt.prompt([
		{
			default: 'http://localhost:8080/v1',
			message: 'Local server URL:',
			name: 'baseUrl',
			type: 'input'
		},
		{
			default: metadata.defaultModel,
			message: 'Default model name:',
			name: 'defaultModel',
			type: 'input'
		}
	]);

	config.providers[BuiltinProviders.LOCAL as keyof typeof config.providers] = {
		baseUrl: (baseUrl as string).trim() || 'http://localhost:8080/v1',
		default_model: (defaultModel as string).trim() || metadata.defaultModel
	};
}

/**
 * Configure Anthropic provider — offers Vertex AI option before standard API key prompt
 * Returns true if Vertex AI was configured (caller should skip standard API key prompt)
 */
async function configureAnthropicVertexOption(
	metadata: ProviderDescriptor,
	providerName: string,
	config: Config
): Promise<boolean> {
	const { useVertex } = await prompt.prompt([
		{
			default: false,
			message: 'Use Vertex AI for Claude? (Recommended for enterprise environments)',
			name: 'useVertex',
			type: 'confirm'
		}
	]);

	if (!useVertex) {
		return false;
	}

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

	return true;
}

/**
 * Configure a specific LLM provider
 */
export async function configureProvider(providerName: string, config: Config): Promise<void> {
	const color = getColorAdapter();
	const metadata = getProviderCatalog().getProviderMetadata(providerName);
	if (!metadata) {
		throw new Error(`Unknown provider: ${providerName}`);
	}

	console.group(color.cyan(`\n📦 Configuring ${metadata.label}`));

	try {
		// Local provider — prompt for base URL instead of API key
		if (providerName === BuiltinProviders.LOCAL) {
			await configureLocalProvider(metadata, config);
			console.groupEnd();
			return;
		}

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
		if (providerName === BuiltinProviders.ANTHROPIC) {
			const usedVertex = await configureAnthropicVertexOption(metadata, providerName, config);
			if (usedVertex) {
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
			...config.defaults,
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
