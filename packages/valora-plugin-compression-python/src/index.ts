import type { PluginAPI } from '@windagency/valora-plugin-api';

import { filterCargo, filterPip, filterPython, filterRuff } from './strategies.js';

export function register(api: PluginAPI): void {
	api.compression.registerStrategy('python', filterPython);
	api.compression.registerStrategy('pytest', filterPython);
	api.compression.registerStrategy('pip', filterPip);
	api.compression.registerStrategy('pip3', filterPip);
	api.compression.registerStrategy('cargo', filterCargo);
	api.compression.registerStrategy('ruff', filterRuff);
}
