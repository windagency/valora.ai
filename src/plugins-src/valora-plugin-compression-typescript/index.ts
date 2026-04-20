import type { PluginAPI } from 'plugins/plugin-api.types';

import { filterEslint, filterPackageManager, filterTestRunner, filterTsc } from './strategies';

export function register(api: PluginAPI): void {
	api.compression.registerStrategy('tsc', filterTsc);
	api.compression.registerStrategy('eslint', filterEslint);
	api.compression.registerStrategy('jest', filterTestRunner);
	api.compression.registerStrategy('vitest', filterTestRunner);
	api.compression.registerStrategy('pnpm', filterPackageManager);
	api.compression.registerStrategy('npm', filterPackageManager);
	api.compression.registerStrategy('npx', filterPackageManager);
	api.compression.registerStrategy('yarn', filterPackageManager);
}
