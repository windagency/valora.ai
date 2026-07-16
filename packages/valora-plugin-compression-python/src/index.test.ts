import { describe, expect, it, vi } from 'vitest';

import type { PluginAPI } from '@windagency/valora-plugin-api';

import { register } from './index';
import { filterCargo, filterPip, filterPython, filterRuff } from './strategies.js';

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

	it('binds each tool key to its own filter function, not a mismatched one', () => {
		const api = makeApi();
		register(api);
		const registerStrategy = vi.mocked(api.compression.registerStrategy);

		expect(registerStrategy).toHaveBeenCalledWith('python', filterPython);
		expect(registerStrategy).toHaveBeenCalledWith('pytest', filterPython);
		expect(registerStrategy).toHaveBeenCalledWith('pip', filterPip);
		expect(registerStrategy).toHaveBeenCalledWith('pip3', filterPip);
		expect(registerStrategy).toHaveBeenCalledWith('cargo', filterCargo);
		expect(registerStrategy).toHaveBeenCalledWith('ruff', filterRuff);
	});
});
