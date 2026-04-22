import type { DIContainer } from 'di/container';
import type { LoadedPlugin } from 'types/plugin.types';

import { registerStrategy } from 'executor/output-compression.service';
import { getProviderRegistry } from 'llm/registry';
import { getLogger } from 'output/logger';

import type { PluginAPI } from './plugin-api.types';

export interface PluginLifecycleRegistry {
	activateHooks: Array<() => Promise<void>>;
	deactivateHooks: Array<() => Promise<void>>;
}

export function createPluginAPI(
	_container: DIContainer,
	plugin: LoadedPlugin,
	lifecycleRegistry: PluginLifecycleRegistry,
	resolvedOverrides: ReadonlySet<string> = new Set()
): PluginAPI {
	const logger = getLogger();

	return {
		compression: {
			registerStrategy(tool, fn) {
				registerStrategy(tool, fn);
			}
		},
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
			register(name, provider, descriptor) {
				const override = resolvedOverrides.has(name) || (plugin.manifest.overrides?.includes(name) ?? false);
				const options = { override, owner: plugin.manifest.name };
				if (descriptor !== undefined) {
					getProviderRegistry().registerProvider(name, provider, options, descriptor);
				} else {
					getProviderRegistry().registerProvider(name, provider, options);
				}
			}
		}
	};
}
