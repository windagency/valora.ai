import { describe, expect, it, vi } from 'vitest';

import type { PluginAPI } from 'plugins/plugin-api.types';

import { register } from './index.js';

function makeApi(): PluginAPI & {
	registeredProviders: Record<string, unknown>;
	deactivateHooks: Array<() => Promise<void>>;
} {
	const registeredProviders: Record<string, unknown> = {};
	const deactivateHooks: Array<() => Promise<void>> = [];

	return {
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
			register: (name, cls) => {
				registeredProviders[name] = cls;
			}
		},
		registeredProviders
	};
}

describe('valora-provider-ollama register()', () => {
	it('registers "ollama" provider via api.providers.register()', async () => {
		const api = makeApi();
		register(api);
		expect(api.registeredProviders['ollama']).toBeDefined();
	});

	it('registers a deactivate hook via api.lifecycle.onDeactivate()', async () => {
		const api = makeApi();
		register(api);
		expect(api.deactivateHooks).toHaveLength(1);
	});
});
