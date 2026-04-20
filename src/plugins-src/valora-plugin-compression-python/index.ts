import type { PluginAPI } from 'plugins/plugin-api.types';

import { filterPython } from './strategies';

export function register(api: PluginAPI): void {
	api.compression.registerStrategy('python', filterPython);
	api.compression.registerStrategy('pytest', filterPython);
}
