import type { ZodType } from 'zod';

import { getMemoryRegistry } from 'memory/registry';

import type { DIContainer } from 'di/container';
import type { LoadedPlugin } from 'types/plugin.types';

import { getConfigLoader } from 'config/loader';
import { registerStrategy } from 'executor/output-compression.service';
import { getProviderRegistry } from 'llm/registry';
import { getLogger } from 'output/logger';

import type { PluginAPI } from './plugin-api.types';

import { registerCliSubcommand } from './cli-registry';

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
		cli: {
			addSubcommand(name, description, handler) {
				registerCliSubcommand(name, description, handler, plugin.manifest.name);
			}
		},
		compression: {
			registerStrategy(tool, fn) {
				registerStrategy(tool, fn);
			}
		},
		config: {
			extend<TOutput>(schema: ZodType<TOutput>): () => TOutput {
				return () => {
					let raw: Record<string, unknown>;
					try {
						raw = getConfigLoader().getRaw();
					} catch {
						raw = {};
					}
					const result = schema.safeParse(raw);
					if (!result.success) {
						logger.warn(`Plugin "${plugin.manifest.name}" config is invalid; using defaults`, {
							errors: result.error.flatten()
						});
						return schema.parse({});
					}
					return result.data;
				};
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
		memory: {
			activate(name, config) {
				getMemoryRegistry().setActive(name, config ?? {});
			},
			register(name, provider, descriptor) {
				const override = resolvedOverrides.has(name) || (plugin.manifest.overrides?.includes(name) ?? false);
				const options = { override, owner: plugin.manifest.name };
				if (descriptor !== undefined) {
					getMemoryRegistry().registerProvider(name, provider, options, descriptor);
				} else {
					getMemoryRegistry().registerProvider(name, provider, options);
				}
			}
		},
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
