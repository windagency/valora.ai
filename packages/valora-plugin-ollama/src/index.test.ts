import { describe, expect, it, vi } from 'vitest';

import type { PluginAPI, ProviderDescriptor } from '@windagency/valora-plugin-api';

import { register } from './index.js';

function makeApi(): PluginAPI & {
	capturedDescriptor: ProviderDescriptor | undefined;
	capturedName: string | undefined;
	deactivateHooks: Array<() => Promise<void>>;
	registeredProviders: Record<string, unknown>;
} {
	const registeredProviders: Record<string, unknown> = {};
	const deactivateHooks: Array<() => Promise<void>> = [];
	let capturedDescriptor: ProviderDescriptor | undefined;
	let capturedName: string | undefined;

	return {
		capturedDescriptor: undefined,
		capturedName: undefined,
		config: { extend: vi.fn() },
		compression: { registerStrategy: vi.fn() },
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
				capturedName = name;
				capturedDescriptor = descriptor;
			}
		},
		get capturedDescriptor() {
			return capturedDescriptor;
		},
		get capturedName() {
			return capturedName;
		},
		registeredProviders
	};
}

describe('valora-plugin-ollama register()', () => {
	it('registers "ollama" provider via api.providers.register()', () => {
		const api = makeApi();
		register(api);
		expect(api.registeredProviders['ollama']).toBeDefined();
	});

	it('registers the provider with the name "ollama"', () => {
		const api = makeApi();
		register(api);
		expect(api.capturedName).toBe('ollama');
	});

	it('passes a descriptor with label "Ollama"', () => {
		const api = makeApi();
		register(api);
		expect(api.capturedDescriptor?.label).toBe('Ollama');
	});

	it('passes a descriptor with modelPrefix "ollama:"', () => {
		const api = makeApi();
		register(api);
		expect(api.capturedDescriptor?.modelPrefix).toBe('ollama:');
	});

	it('passes a descriptor with requiresApiKey false', () => {
		const api = makeApi();
		register(api);
		expect(api.capturedDescriptor?.requiresApiKey).toBe(false);
	});

	it('passes a descriptor whose modelModes includes an entry for llama3.1', () => {
		const api = makeApi();
		register(api);
		const modes = api.capturedDescriptor?.modelModes ?? [];
		expect(modes.some((m) => m.model === 'llama3.1')).toBe(true);
	});

	it('passes a descriptor whose modelModes includes entries for the current agentic model set', () => {
		const api = makeApi();
		register(api);
		const modes = api.capturedDescriptor?.modelModes ?? [];
		expect(modes.some((m) => m.model === 'qwen3:8b')).toBe(true);
		expect(modes.some((m) => m.model === 'qwen3:4b')).toBe(true);
		expect(modes.some((m) => m.model === 'phi4-mini')).toBe(true);
	});

	it('passes a descriptor with defaultModel "qwen3:8b"', () => {
		const api = makeApi();
		register(api);
		expect(api.capturedDescriptor?.defaultModel).toBe('qwen3:8b');
	});

	it('passes a descriptor whose contextWindows includes correct sizes for the current agentic model set', () => {
		const api = makeApi();
		register(api);
		const contextWindows = api.capturedDescriptor?.contextWindows ?? {};
		expect(contextWindows['qwen3:8b']).toBe(32_768);
		expect(contextWindows['qwen3:4b']).toBe(32_768);
		expect(contextWindows['phi4-mini']).toBe(128_000);
	});

	it('registers a deactivate hook via api.lifecycle.onDeactivate()', () => {
		const api = makeApi();
		register(api);
		expect(api.deactivateHooks).toHaveLength(1);
	});
});
