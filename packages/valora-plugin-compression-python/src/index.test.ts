import { describe, expect, it, vi } from 'vitest';

import type { PluginAPI } from '@windagency/valora-plugin-api';

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

describe('valora-plugin-compression-python register()', () => {
	it('registers all tool keys', () => {
		const api = makeApi();
		register(api);
		const calls = vi.mocked(api.compression.registerStrategy).mock.calls.map(([tool]) => tool);
		expect(calls).toEqual(expect.arrayContaining(['python', 'pytest', 'pip', 'pip3', 'cargo', 'ruff']));
		expect(calls).toHaveLength(6);
	});
});
