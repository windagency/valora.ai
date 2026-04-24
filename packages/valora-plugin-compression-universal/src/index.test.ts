import { describe, expect, it, vi } from 'vitest';

import type { PluginAPI } from 'plugins/plugin-api.types';

import { register } from './index';

function makeApi(): PluginAPI {
	return {
		compression: { registerStrategy: vi.fn() },
		config: { extend: vi.fn() },
		lifecycle: { onActivate: vi.fn(), onDeactivate: vi.fn() },
		logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
		providers: { register: vi.fn() }
	};
}

describe('valora-plugin-compression-universal register()', () => {
	it('registers all tool keys', async () => {
		const api = makeApi();
		register(api);
		const calls = vi.mocked(api.compression.registerStrategy).mock.calls.map(([tool]) => tool);
		expect(calls).toEqual(
			expect.arrayContaining([
				'git',
				'grep',
				'rg',
				'docker',
				'make',
				'ls',
				'find',
				'tree',
				'cat',
				'diff',
				'curl',
				'wget',
				'jq',
				'yq',
				'tail',
				'journalctl',
				'gh'
			])
		);
		expect(calls).toHaveLength(17);
	});
});
