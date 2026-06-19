import type { PluginAPI } from 'plugins/plugin-api.types';

import { register as registerPython } from '@windagency/valora-plugin-compression-python/src/index';
import { register as registerTypescript } from '@windagency/valora-plugin-compression-typescript/src/index';
import { register as registerUniversal } from '@windagency/valora-plugin-compression-universal/src/index';

export type PluginId = 'python' | 'typescript' | 'universal';

type RegisterFn = PluginAPI['compression']['registerStrategy'];

export function registerPlugins(plugins: Set<PluginId>, registerFn: RegisterFn): void {
	const api = makeApi(registerFn);
	if (plugins.has('universal')) registerUniversal(api);
	if (plugins.has('typescript')) registerTypescript(api);
	if (plugins.has('python')) registerPython(api);
}

function makeApi(registerFn: RegisterFn): PluginAPI {
	return {
		compression: { registerStrategy: registerFn },
		config: { extend: () => {} },
		lifecycle: { onActivate: () => {}, onDeactivate: () => {} },
		logger: { debug: () => {}, error: () => {}, info: () => {}, warn: () => {} },
		providers: { register: () => {} }
	};
}
