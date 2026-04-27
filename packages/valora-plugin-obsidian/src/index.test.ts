import { describe, expect, it, vi } from 'vitest';

import type { PluginAPI } from 'plugins/plugin-api.types';

import { register } from './index.js';

function makeApi() {
	const activateHooks: Array<() => Promise<void>> = [];
	const cliSubcommands: Array<{ description: string; handler: () => Promise<void> | void; name: string }> = [];

	const api: PluginAPI = {
		cli: {
			addSubcommand(name, description, handler) {
				cliSubcommands.push({ description, handler, name });
			}
		},
		compression: { registerStrategy: vi.fn() },
		config: { extend: vi.fn() },
		lifecycle: {
			onActivate: (fn) => {
				activateHooks.push(fn);
			},
			onDeactivate: vi.fn()
		},
		logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
		providers: { register: vi.fn() }
	};

	return { activateHooks, api, cliSubcommands };
}

describe('valora-plugin-obsidian register()', () => {
	it('calls api.config.extend once', () => {
		const { api } = makeApi();
		register(api);
		expect(api.config.extend).toHaveBeenCalledOnce();
	});

	it('registers exactly one activate hook via api.lifecycle.onActivate', () => {
		const { activateHooks, api } = makeApi();
		register(api);
		expect(activateHooks).toHaveLength(1);
	});

	it('registers exactly one CLI subcommand', () => {
		const { api, cliSubcommands } = makeApi();
		register(api);
		expect(cliSubcommands).toHaveLength(1);
	});

	it('registers the CLI subcommand with name "obsidian open"', () => {
		const { api, cliSubcommands } = makeApi();
		register(api);
		expect(cliSubcommands[0]?.name).toBe('obsidian open');
	});
});
