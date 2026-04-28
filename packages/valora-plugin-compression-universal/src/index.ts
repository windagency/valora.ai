import type { PluginAPI } from 'plugins/plugin-api.types';

import {
	filterCat,
	filterCurl,
	filterDiff,
	filterDocker,
	filterGh,
	filterGit,
	filterJson,
	filterLog,
	filterLs,
	filterMake,
	filterRg
} from './strategies.js';

export function register(api: PluginAPI): void {
	api.compression.registerStrategy('git', filterGit);
	api.compression.registerStrategy('grep', filterRg);
	api.compression.registerStrategy('rg', filterRg);
	api.compression.registerStrategy('docker', filterDocker);
	api.compression.registerStrategy('make', filterMake);
	api.compression.registerStrategy('ls', filterLs);
	api.compression.registerStrategy('find', filterLs);
	api.compression.registerStrategy('tree', filterLs);
	api.compression.registerStrategy('cat', filterCat);
	api.compression.registerStrategy('diff', filterDiff);
	api.compression.registerStrategy('curl', filterCurl);
	api.compression.registerStrategy('wget', filterCurl);
	api.compression.registerStrategy('jq', filterJson);
	api.compression.registerStrategy('yq', filterJson);
	api.compression.registerStrategy('tail', filterLog);
	api.compression.registerStrategy('journalctl', filterLog);
	api.compression.registerStrategy('gh', filterGh);
}
