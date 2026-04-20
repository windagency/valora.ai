import type { PluginAPI } from 'plugins/plugin-api.types';

import { OllamaBinaryManagerImpl } from './binary-manager.js';
import { OllamaModelManagerImpl } from './model-manager.js';
import { OllamaProvider, setManagers } from './ollama-provider.js';
import { OllamaProcessManagerImpl } from './process-manager.js';

export function register(api: PluginAPI): void {
	const binary = new OllamaBinaryManagerImpl();
	const process = new OllamaProcessManagerImpl();
	const model = new OllamaModelManagerImpl();

	setManagers({ binary, model, process });
	api.providers.register('ollama', OllamaProvider);

	api.lifecycle.onDeactivate(async () => {
		await process.stop();
	});
}
