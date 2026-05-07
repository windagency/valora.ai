import type { PluginAPI } from '@windagency/valora-plugin-api';

import { type RtkBinaryManager, RtkBinaryManagerImpl } from './binary-manager.js';

export function register(api: PluginAPI, binaryManager: RtkBinaryManager = new RtkBinaryManagerImpl()): void {
	api.lifecycle.onActivate(async () => {
		await binaryManager.ensureInstalled();
	});
}
