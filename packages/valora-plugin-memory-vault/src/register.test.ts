import { describe, expect, it, vi } from 'vitest';

import type { PluginAPI } from '@windagency/valora-plugin-api';

import { register } from './index';

describe('vault plugin register()', () => {
	it('calls api.memory.register and api.memory.activate', () => {
		const register_ = vi.fn();
		const activate = vi.fn();
		const extend = vi.fn().mockReturnValue(() => ({}));

		register({
			memory: { register: register_, activate },
			config: { extend },
			cli: { addSubcommand: vi.fn() },
			compression: { registerStrategy: vi.fn() },
			lifecycle: { onActivate: vi.fn(), onDeactivate: vi.fn() },
			logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
			providers: { register: vi.fn() }
		} as unknown as PluginAPI);

		expect(register_).toHaveBeenCalledWith('vault', expect.any(Function), expect.any(Object));
		expect(activate).toHaveBeenCalledWith('vault', expect.any(Object));
	});
});
