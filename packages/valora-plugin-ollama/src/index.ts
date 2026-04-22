import type { PluginAPI, ProviderDescriptor } from 'plugins/plugin-api.types';

import { OllamaBinaryManagerImpl } from './binary-manager.js';
import { OllamaModelManagerImpl } from './model-manager.js';
import { OllamaProvider } from './ollama-provider.js';
import { OllamaProcessManagerImpl } from './process-manager.js';

export function register(api: PluginAPI): void {
	const binary = new OllamaBinaryManagerImpl();
	const processManager = new OllamaProcessManagerImpl();
	const model = new OllamaModelManagerImpl();

	api.providers.register('ollama', (config) => new OllamaProvider(config, { binary, model, process: processManager }), {
		configSchema: undefined,
		contextWindows: { codellama: 16_384, 'llama3.1': 128_000, mistral: 32_768, phi3: 128_000, qwen2: 32_768 },
		defaultModel: 'llama3.1',
		description: 'Self-managed Ollama provider — runs models locally via the Ollama binary',
		envVars: { model: 'OLLAMA_DEFAULT_MODEL' },
		helpText: 'Use any model available via ollama pull. No API key required.',
		label: 'Ollama',
		modelModes: [
			{ mode: 'default', model: 'llama3.1' },
			{ mode: 'default', model: 'mistral' },
			{ mode: 'default', model: 'codellama' },
			{ mode: 'default', model: 'phi3' },
			{ mode: 'default', model: 'qwen2' }
		],
		modelPrefix: 'ollama:',
		requiresApiKey: false
	} satisfies ProviderDescriptor);

	api.lifecycle.onDeactivate(async () => {
		await processManager.stop();
	});
}
