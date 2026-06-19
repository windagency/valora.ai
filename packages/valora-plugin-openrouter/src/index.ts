import type { PluginAPI, ProviderDescriptor } from '@windagency/valora-plugin-api';

import { OPENROUTER_MODELS } from './models.js';
import { OpenRouterProvider } from './openrouter-provider.js';

const descriptor = {
	defaultModel: OPENROUTER_MODELS.GEMMA_4_31B_FREE,
	description: 'OpenRouter — unified gateway to hundreds of models via an OpenAI-compatible API',
	envVars: { apiKey: 'OPENROUTER_API_KEY', model: 'OPENROUTER_DEFAULT_MODEL' },
	helpText:
		'Set OPENROUTER_API_KEY. Use any model slug from openrouter.ai/models, e.g. openrouter:anthropic/claude-sonnet-4.5.',
	label: 'OpenRouter',
	modelModes: [
		{ mode: 'default', model: OPENROUTER_MODELS.GEMMA_4_31B_FREE },
		{ mode: 'default', model: OPENROUTER_MODELS.CLAUDE_SONNET_4_5 },
		{ mode: 'default', model: OPENROUTER_MODELS.GPT_4O },
		{ mode: 'default', model: OPENROUTER_MODELS.LLAMA_3_3_70B },
		{ mode: 'default', model: OPENROUTER_MODELS.MISTRAL_LARGE }
	],
	modelPrefix: 'openrouter:',
	requiresApiKey: true
} satisfies ProviderDescriptor;

export function register(api: PluginAPI): void {
	api.providers.register('openrouter', OpenRouterProvider, descriptor);
	// No onDeactivate hook — no local process to stop
}
