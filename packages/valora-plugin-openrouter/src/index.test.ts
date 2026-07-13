import { describe, expect, it, vi } from 'vitest';

import type { PluginAPI, ProviderDescriptor } from '@windagency/valora-plugin-api';

import { register } from './index.js';
import { OpenRouterProvider } from './openrouter-provider.js';

function makeApi(): PluginAPI & {
	registeredProviders: Record<string, unknown>;
	registeredDescriptors: Record<string, ProviderDescriptor | undefined>;
	deactivateHooks: Array<() => Promise<void>>;
} {
	const registeredProviders: Record<string, unknown> = {};
	const registeredDescriptors: Record<string, ProviderDescriptor | undefined> = {};
	const deactivateHooks: Array<() => Promise<void>> = [];

	return {
		compression: { registerStrategy: vi.fn() },
		config: { extend: vi.fn() },
		deactivateHooks,
		lifecycle: {
			onActivate: vi.fn(),
			onDeactivate: (fn) => {
				deactivateHooks.push(fn);
			}
		},
		logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
		providers: {
			register: (name, cls, descriptor) => {
				registeredProviders[name] = cls;
				registeredDescriptors[name] = descriptor;
			}
		},
		registeredDescriptors,
		registeredProviders
	};
}

describe('valora-provider-openrouter register()', () => {
	it('makes the "openrouter" provider available after registration', () => {
		const api = makeApi();
		register(api);
		expect(api.registeredProviders['openrouter']).toBe(OpenRouterProvider);
	});

	it('does not register any deactivate hooks — OpenRouter has no local process to stop', () => {
		const api = makeApi();
		register(api);
		expect(api.deactivateHooks).toHaveLength(0);
	});

	it('registers a descriptor with label "OpenRouter"', () => {
		const api = makeApi();
		register(api);
		expect(api.registeredDescriptors['openrouter']?.label).toBe('OpenRouter');
	});

	it('registers a descriptor with modelPrefix "openrouter:"', () => {
		const api = makeApi();
		register(api);
		expect(api.registeredDescriptors['openrouter']?.modelPrefix).toBe('openrouter:');
	});

	it('registers a descriptor with requiresApiKey true', () => {
		const api = makeApi();
		register(api);
		expect(api.registeredDescriptors['openrouter']?.requiresApiKey).toBe(true);
	});

	it('registers a descriptor with envVars.apiKey equal to "OPENROUTER_API_KEY"', () => {
		const api = makeApi();
		register(api);
		expect(api.registeredDescriptors['openrouter']?.envVars?.apiKey).toBe('OPENROUTER_API_KEY');
	});
});
