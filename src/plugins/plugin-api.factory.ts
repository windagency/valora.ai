import type { DIContainer } from 'di/container';
import type { LoadedPlugin } from 'types/plugin.types';

import { getProviderRegistry } from 'llm/registry';
import { getLogger } from 'output/logger';

import type { PluginAPI } from './plugin-api.types';

export interface PluginLifecycleRegistry {
	activateHooks: Array<() => Promise<void>>;
	deactivateHooks: Array<() => Promise<void>>;
}

export function createPluginAPI(
	_container: DIContainer,
	_plugin: LoadedPlugin,
	lifecycleRegistry: PluginLifecycleRegistry
): PluginAPI {
	const logger = getLogger();

	return {
		config: {
			extend(_schema) {
				// Stubbed: config schema extension is defined in the interface for future use
			}
		},
		lifecycle: {
			onActivate(fn) {
				lifecycleRegistry.activateHooks.push(fn);
			},
			onDeactivate(fn) {
				lifecycleRegistry.deactivateHooks.push(fn);
			}
		},
		logger,
		providers: {
			register(name, providerClass) {
				getProviderRegistry().registerProvider(name, providerClass);
			}
		}
	};
}
