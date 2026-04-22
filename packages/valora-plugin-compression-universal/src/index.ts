import type { PluginAPI } from 'plugins/plugin-api.types';

import { filterDocker, filterGit, filterMake, filterRg } from './strategies';

export function register(api: PluginAPI): void {
	api.compression.registerStrategy('git', filterGit);
	api.compression.registerStrategy('grep', filterRg);
	api.compression.registerStrategy('rg', filterRg);
	api.compression.registerStrategy('docker', filterDocker);
	api.compression.registerStrategy('make', filterMake);
}
