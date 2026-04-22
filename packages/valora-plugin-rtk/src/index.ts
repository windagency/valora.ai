import type { PluginAPI } from 'plugins/plugin-api.types';

import { type RtkBinaryManager, RtkBinaryManagerImpl } from './binary-manager.js';

export function register(api: PluginAPI, binaryManager: RtkBinaryManager = new RtkBinaryManagerImpl()): void {
	api.lifecycle.onActivate(async () => {
		await binaryManager.ensureInstalled();
	});
}
